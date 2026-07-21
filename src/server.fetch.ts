import { Readable } from 'node:stream';
import { type ReadableStream } from 'node:stream/web';
import { getOptions } from './options.context';
import { formatUnknownError, log } from './logger';
import { memo } from './server.caching';
import { assertInputUrlWhiteListed } from './server.assertions';
import { isUrl } from './server.helpers';
import { type WhitelistUrl } from './options.defaults';

/**
 * Decoded payload. Can either be textual or binary data.

 * @property kind - Specifies the nature of the payload. 'text' indicates
 *     textual content, and 'bytes' indicates binary data.
 * @property mimeType - The MIME type of the payload, providing context
 *     for interpreting the data.
 * @property [text] - The textual content of the payload, present if
 *     `kind` is 'text'. This property is optional.
 * @property [chunks] - The binary data of the payload, split into chunks,
 *     present if `kind` is 'bytes'. This property is optional.
 */
type DecodedPayload = {
  kind: 'text' | 'bytes';
  mimeType: string;
  text?: string | undefined;
  chunks?: Uint8Array[] | undefined;
};

/**
 * Decoded stream result. Can either be textual or binary data.
 *
 * @property kind - Determines the type of data in the stream result.
 *   - `'text'` indicates textual data.
 *   - `'bytes'` indicates binary chunk data.
 * @property text - Optional property that holds the decoded text when
 *     `kind` is `'text'`. `undefined` for binary data.
 * @property chunks - Optional property that holds an array of Uint8Array
 *     representing binary chunks when `kind` is `'bytes'`. `undefined`
 *     for textual data.
 */
type DecodedStreamResult = {
  kind: 'text' | 'bytes';
  text?: string | undefined;
  chunks?: Uint8Array[] | undefined;
};

/**
 * Fetch state and response types
 *
 * @interface FetchState
 *
 * @property phase - The current state of the fetch operation.
 * @property type - The type of data expected from the fetch operation.
 * @property progress - Percentage progress (0–100) of the fetch operation, or `undefined`
 *     when the server omits `content-length` (i.e. chunked/unknown length responses). In
 *     that case, only `bytesReceived` is meaningful until `phase === 'success'`, when
 *     `progress` is set to `100`.
 * @property bytesReceived - The number of bytes received from the fetch operation.
 * @property message - A message, error or otherwise, associated with the fetch operation.
 * @property error - An error object associated with the fetch operation.
 * @property data - The data received from the fetch operation.
 */
interface FetchState {
  phase: 'idle' | 'loading' | 'success' | 'error' | 'cancelled';
  type?: 'json' | 'text' | 'binary' | undefined;
  progress?: number | undefined;
  bytesReceived?: number | undefined;
  message?: string | undefined;
  error?: FetchError | undefined;
  data?: unknown | undefined;
}

/**
 * Fetch response object.
 *
 * @property type - Type of data received from the fetch operation.
 * @property status - HTTP status code of the fetch response.
 * @property statusText - HTTP status text of the fetch response.
 * @property message - Message, error or otherwise, associated with the fetch operation.
 * @property data - The data received from the fetch operation.
 */
interface FetchResponse {
  type: 'json' | 'text' | 'binary';
  status: number;
  statusText: string;
  message?: string | undefined;
  data: unknown | undefined;
}

/**
 * Set a fetch request.
 *
 * @property get - Function to perform a GET request.
 * @property cancel - Function to cancel the fetch request.
 * @property status - Function to get the status of the fetch request.
 */
interface SetFetch {
  get: (url: string) => Promise<FetchResponse>;
  // post: (url: string, data: unknown) => Promise<FetchResponse>;
  cancel: () => void;
  status: (callback?: (state: FetchState) => void) => FetchState | (() => void);
}

/**
 * MIME-type classification helpers.
 *
 * @note Kept standalone so `parsePayload`, `decodeStream`, and `preflight`
 * all agree on what "text" vs "binary" means. Adding a new text-ish content
 * type = one edit here, not three.
 */
const TEXT_MIME_PREFIXES = ['text/'];

/**
 * MIME classification for types considered text.
 */
const TEXT_MIME_INCLUDES = [
  'application/json',
  '+json',
  'application/javascript',
  'application/xml',
  '+xml',
  'application/x-ndjson',
  'application/ndjson',
  'image/svg+xml'
];

/**
 * MIME classification for types considered ambiguous.
 */
const AMBIGUOUS_MIME = ['application/octet-stream', ''];

/**
 * Normalize a MIME type string by removing parameters, removing extra space,
 * and converting to lowercase.
 *
 * @param mimeType - MIME type string to normalize.
 * @returns Normalized MIME type in lowercase without any parameters.
 */
const normalizeMime = (mimeType: string): string =>
  (mimeType.split(';')[0] || '').trim().toLowerCase();

/**
 * Memoized version of `normalizeMime`.
 */
normalizeMime.memo = memo(normalizeMime);

/**
 * Determine if a MIME type is JSON-like.
 *
 * @param mimeType - MIME type string to check.
 * @returns `true` if the MIME type is JSON-like, `false` otherwise.
 */
const isJsonMime = (mimeType: string): boolean => {
  const mime = normalizeMime.memo(mimeType);

  return mime.includes('application/json') || mime.includes('+json');
};

/**
 * Determine if a MIME type is text-like.
 *
 * @param mimeType - MIME type string to check.
 * @returns `true` if the MIME type is text-like, `false` otherwise.
 */
const isTextMime = (mimeType: string): boolean => {
  const mime = normalizeMime.memo(mimeType);

  return TEXT_MIME_PREFIXES.some(prefix => mime.startsWith(prefix)) ||
    TEXT_MIME_INCLUDES.some(type => mime.includes(type)) ||
    AMBIGUOUS_MIME.includes(mime);
};

/**
 * Determine if a MIME type is binary.
 *
 * @param mimeType - MIME type string to check.
 * @returns `true` if the MIME type is binary, `false` otherwise.
 */
const isBinaryMime = (mimeType: string): boolean =>
  !isTextMime(mimeType);

/**
 * Fetch operation error. Extends the standard `Error`.
 * Includes additional properties (e.g., HTTP status code, status text, cancellation flag).
 *
 * @extends Error
 * @class
 */
class FetchError extends Error {
  override readonly name = 'FetchError';
  readonly status?: number | undefined;
  readonly statusText?: string | undefined;
  override readonly cause?: unknown | undefined;
  readonly cancelled: boolean;

  /**
   * Fetch error details.
   *
   * @param options - Error options.
   * @param options.message - Error message.
   * @param options.status - HTTP status code.
   * @param options.statusText - HTTP status text.
   * @param options.cause - Cause of the error.
   * @param options.cancelled - Indicates if the fetch operation was canceled.
   */
  constructor(options: {
    message: string;
    status?: number | undefined;
    statusText?: string | undefined;
    cause?: unknown | undefined;
    cancelled?: boolean | undefined;
  }) {
    super(options.message);

    this.status = options.status;
    this.statusText = options.statusText;
    this.cause = options.cause;
    this.cancelled = options.cancelled ?? false;
  }
}

/**
 * Parse a Blob object into the MIME type format.
 *
 * @note `allowBinary` must be set to `true` to return binary data.
 * Callers are, currently, responsible for the lifecycle of returned binary
 * data. (e.g., create via URL.createObjectURL, release via URL.revokeObjectURL).
 *
 * @note JSON hardening follow-up: enforce structural limits (jsonMaxDepth, jsonMaxKeys,
 * jsonMaxStringBytes) that byte-cap `maxSizeBytes` cannot express. Consider a streaming
 * parser (e.g. `stream-json`) once payload sizes grow.
 *
 * Review providing an alternate return pattern for binary responses
 * `data: { blob, url: URL.createObjectURL(blob), revoke: () => URL.revokeObjectURL(url) }`
 *
 * @param decoded - Parameter options. Accepts two objects
 *     - text: `{ kind: 'text', text: string }`
 *     - binary data: `{ kind: 'bytes', chunks: Uint8Array[] }`
 * @param {GlobalOptions} [options=getOptions()] - Configuration options for the fetch operation.
 * @returns {Promise<{ type: 'json' | 'text' | 'binary'; data: unknown }>} A Promise that
 *     resolves to an object containing the type of parsed data (`'json'`, `'text'`, or `'binary'`)
 *     and the corresponding data.
 *
 * @throws {FetchError} Throws an error if binary data processing is not allowed and the MIME
 *     type does not correspond to JSON or text formats.
 */
const parsePayload = async (
  decoded: DecodedPayload,
  options = getOptions()
): Promise<{ type: 'json' | 'text' | 'binary'; data: unknown }> => {
  const { xhrFetch } = options;
  const mime = normalizeMime(decoded.mimeType);

  if (decoded.kind === 'text') {
    if (isJsonMime(mime)) {
      if (!decoded.text) {
        return {
          type: 'json',
          data: null
        };
      }

      try {
        return {
          type: 'json',
          data: JSON.parse(decoded.text)
        };
      } catch (err) {
        throw new FetchError({ message: 'Invalid JSON payload.', cause: err });
      }
    }

    return { type: 'text', data: decoded.text };
  }

  if (xhrFetch.allowBinary) {
    return {
      type: 'binary',
      data: new Blob(decoded.chunks as BlobPart[], { type: mime })
    };
  }

  throw new FetchError({ message: `Binary data is not allowed (${mime}).` });
};

/**
 * Decodes a stream into either text or binary data based on the MIME type provided.
 *
 * @note Consume a Node Readable and either:
 *   - decode UTF-8 as it streams → returns { kind: 'text', text }
 *   - buffer bytes → returns { kind: 'bytes', chunks }
 *
 * Applies to ALL text-shaped payloads (JSON, HTML, XML, SVG, NDJSON,
 * JS, plain text) — not just JSON. Binary keeps the chunk-buffer path;
 * `parsePayload` decides whether to hand it back as a `Blob` or reject it.
 *
 * @note Binary path buffers chunks in memory (bounded by `maxSizeBytes`).
 * This is on-par for our use (small assets). If we ever need to
 * support large binary downloads, switch this branch to hand back either
 * the raw `Readable` or a `WritableStream` sink (e.g., to a temp file)
 * instead of accumulating `Uint8Array[]`.
 *
 * @param params - Parameter options.
 * @param params.stream - Stream used to read data chunks.
 * @param params.mimeType - The MIME type of the content being streamed.
 * @param [params.totalSize] - Optional total size of the expected data to compute progress percentage.
 * @param params.maxSizeBytes - The maximum allowable size of the stream in bytes. If exceeded, the stream
 *     will be aborted.
 * @param params.onProgress - Callback function invoked during the stream processing.
 *    - `bytes` {number} - The number of bytes processed so far.
 *    - `progress` {number | undefined} - The percentage progress of the stream (optional, depends on having
 *    `totalSize`).
 * @returns A promise resolving to an object containing either:
 *    - `{ kind: 'text', text: string }` if the stream is decoded as text.
 *    - `{ kind: 'bytes', chunks: Uint8Array[] }` if the stream is decoded as binary data.
 *
 * @throws {FetchError} If accumulated size exceeds `maxSizeBytes`.
 */
const decodeStream = async ({
  stream, mimeType, totalSize, maxSizeBytes, onProgress
}: {
  stream: Readable;
  mimeType: string;
  totalSize?: number | undefined;
  maxSizeBytes: number;
  onProgress: (bytes: number, progress?: number | undefined) => void;
}): Promise<DecodedStreamResult> => {
  const asText = isTextMime(mimeType);
  const decoder = asText ? new TextDecoder('utf-8') : undefined;

  const chunks: Uint8Array[] = [];
  const textParts: string[] = [];
  let totalBytes = 0;

  try {
    for await (const chunk of stream as AsyncIterable<Uint8Array>) {
      totalBytes += chunk.byteLength;

      if (maxSizeBytes && totalBytes > maxSizeBytes) {
        stream.destroy();
        throw new FetchError({ message: 'File download aborted: Size exceeded maximum limit.' });
      }

      if (decoder) {
        // stream: true keeps multi-byte code points across chunk boundaries
        textParts.push(decoder.decode(chunk, { stream: true }));
      } else {
        chunks.push(chunk);
      }

      const progress = totalSize ? Math.round((totalBytes / totalSize) * 100) : undefined;

      onProgress(totalBytes, progress);
    }
  } catch (err) {
    if (!stream.destroyed) {
      stream.destroy();
    }
    throw err;
  }

  if (decoder) {
    textParts.push(decoder.decode()); // flush any trailing partial

    return { kind: 'text', text: textParts.join('') };
  }

  return { kind: 'bytes', chunks };
};

/**
 * Opt-in HEAD preflight.
 *
 * @param url
 * @param signal
 * @note Off by default. When enabled via `options.xhrFetch.preflightHead`,
 * we HEAD the URL to catch oversized / disallowed-binary responses without
 * opening a body stream. Returns `null` (and callers fall back to GET-only
 * header sniffing) whenever HEAD is unreliable:
 *   - HTTP 405 / 501 (method not supported)
 *   - network / abort error
 *   - `content-length` reported as 0 (common lie on dynamic endpoints)
 *
 * Header values from HEAD are advisory. Authoritative size enforcement
 * still lives in `decodeStream`. Authoritative type enforcement still
 * lives in `parsePayload`. HEAD is a fast-fail hint, not a gate.
 */
const preflight = async (
  url: string,
  signal: AbortSignal
): Promise<{ contentLength?: number | undefined; contentType?: string | undefined } | null> => {
  try {
    const res = await fetch(url, { method: 'HEAD', signal });

    if (!res.ok || res.status === 405 || res.status === 501) {
      return null;
    }

    const contentLength = Number(res.headers.get('content-length')) || undefined;
    const contentType = res.headers.get('content-type') || undefined;

    // Suspicious HEAD: some servers return CL:0 for dynamic bodies.
    // Treat as "no info" rather than "empty".
    if (contentLength === 0) {
      return {
        contentType
      };
    }

    return {
      contentLength,
      contentType
    };
  } catch {
    return null;
  }
};

/**
 * Create a fetch operation.
 *
 * @note
 * **Single-flight by design.** Each `setFetch()` call returns an isolated instance
 * with its own in-flight tracking (`inflight` is closure state, not module state).
 * A given instance will service **one active request at a time**:
 *   - A second `get(sameUrl)` while one is in-flight returns the same promise (de-dup).
 *   - A second `get(otherUrl)` while one is in-flight rejects with `FetchError`
 *     ("Fetch already in progress. Create a new setFetch.").
 * Callers that need parallelism should instantiate a new `setFetch()` per request.
 *
 * **IMPORTANT! Do not call `setFetch` directly from feature code.** All outbound fetches
 * must be routed through `processDocs` (see `server.getResources.ts`) so that URL
 * whitelisting, e2e test hooks, and caching are consistently applied. Direct use
 * bypasses those guarantees and subjects us to potential security vulnerabilities.
 *
 * @param {GlobalOptions} [options=getOptions()] - Configuration options for the fetch operation.
 * @returns {SetFetch} Fetch operations:
 *   - `get`: GET request callback to the specified URL.
 *   - `cancel`: Cancel callback for the fetch operation.
 *   - `status`: Callback for returning state or registering a state listener.
 */
const setFetch = (options = getOptions()): SetFetch => {
  const { mode, modeOptions, whitelist, xhrFetch } = options;
  const fixtureUrl = mode === 'test' ? modeOptions?.test?.baseUrl : undefined;

  const state: FetchState = { phase: 'idle', progress: 0, bytesReceived: 0 };
  const listeners = new Set<(s: FetchState) => void>();
  const cancelReason = new Error('Request cancelled');

  let controller: AbortController | undefined;
  let stream: Readable | undefined;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let inflight: { key: string; promise: Promise<FetchResponse> } | undefined;
  let updatedWhitelist = whitelist.urls;

  if (mode === 'test' && isUrl(fixtureUrl)) {
    updatedWhitelist = updatedWhitelist.concat([fixtureUrl as WhitelistUrl]);
  }

  /**
   * Update state with the provided patch object; notify all listeners.
   *
   * @param {Partial<FetchState>} patch - Partial object containing updates to the state.
   */
  const updateState = (patch: Partial<FetchState>) => {
    Object.assign(state, patch);

    listeners.forEach(cb => {
      try {
        cb({ ...state });
      } catch (error) {
        log.debug('status callback error:', formatUnknownError(error));
      }
    });
  };

  /**
   * Prevent duplicating async tasks for the same key.
   *
   * @param {string} key - A unique identifier associated with the operation.
   * @param {() => Promise<FetchResponse>} startFetch - Start the async operation and return a promise.
   * @returns {Promise<FetchResponse>} Promise that resolves to the result of the async operation.
   *
   * @throws {FetchError} If an operation with the specified key is already in progress and a new
   *     task is attempted.
   */
  const checkInflight = (key: string, startFetch: () => Promise<FetchResponse>): Promise<FetchResponse> => {
    if (inflight) {
      if (inflight.key === key) {
        return inflight.promise;
      }

      return Promise.reject(new FetchError({ message: 'Fetch already in progress. Create a new setFetch.' }));
    }

    const promise = startFetch().finally(() => {
      inflight = undefined;
    });

    inflight = { key, promise };

    return promise;
  };

  /**
   * Execute a fetch request with the given URL and settings.
   *
   * @param url - URL to fetch.
   * @param settings - Optional settings for the fetch request.
   * @returns A Promise that resolves to the fetch response.
   */
  const executeFetch = async (url: string, settings: RequestInit = {}): Promise<FetchResponse> => {
    controller = new AbortController();
    timeoutId = setTimeout(
      () => controller?.abort(new Error(`Timeout: exceeded ${xhrFetch.timeoutMs}ms.`)),
      xhrFetch.timeoutMs
    );

    timeoutId.unref();

    updateState({ phase: 'loading', progress: 0, bytesReceived: 0, error: undefined, data: undefined, type: undefined });

    try {
      assertInputUrlWhiteListed(url, updatedWhitelist, {
        allowedProtocols: whitelist.protocols,
        inputDisplayName: 'setFetch URL',
        codeOrError: (message, cause) => new FetchError({ message, cause })
      });

      if (xhrFetch.preflightHead) {
        const hint = await preflight(url, controller.signal);

        if (hint) {
          if (hint.contentLength && xhrFetch.maxSizeBytes && hint.contentLength > xhrFetch.maxSizeBytes) {
            throw new FetchError({
              message: `File blocked (preflight): content-length ${hint.contentLength} exceeds ${xhrFetch.maxSizeBytes}.`
            });
          }

          if (hint.contentType && isBinaryMime(hint.contentType) && !xhrFetch.allowBinary) {
            throw new FetchError({
              message: `Binary data is not allowed (preflight: ${normalizeMime(hint.contentType)}).`
            });
          }
        }
      }

      const response = await fetch(url, { ...settings, signal: controller.signal });

      if (response.url && response.url !== url) {
        // Review using `Promise.try` instead
        // Post-redirect validation: ensure the new URL is still within the sandbox/whitelist
        await Promise.resolve().then(() => assertInputUrlWhiteListed(response.url, updatedWhitelist, {
          allowedProtocols: whitelist.protocols,
          inputDisplayName: 'setFetch URL',
          codeOrError: (message, cause) => new FetchError({ message, cause })
        })).catch(error => {
          response.body?.cancel?.().catch(() => {});
          throw error;
        });
      }

      if (!response.ok) {
        throw new FetchError({
          message: `Failed to fetch ${url}: ${response.status} ${response.statusText}`,
          status: response.status,
          statusText: response.statusText
        });
      }

      const mimeType = response.headers.get('content-type') || '';
      const totalSize = Number(response.headers.get('content-length')) || undefined;

      // Release instead of buffering bytes
      const setCancelError = (message: string) => {
        response.body?.cancel?.().catch(() => {});

        throw new FetchError({
          message,
          status: response.status,
          statusText: response.statusText
        });
      };

      if (totalSize && xhrFetch.maxSizeBytes && totalSize > xhrFetch.maxSizeBytes) {
        setCancelError(`File blocked: exceeds ${xhrFetch.maxSizeBytes} bytes.`);
      }

      if (isBinaryMime(mimeType) && !xhrFetch.allowBinary) {
        setCancelError(`Binary data is not allowed (${normalizeMime(mimeType)}).`);
      }

      stream = response.body ? Readable.fromWeb(response.body as ReadableStream<Uint8Array>) : undefined;

      const decoded = stream
        ? await decodeStream({
          stream,
          mimeType,
          totalSize,
          maxSizeBytes: xhrFetch.maxSizeBytes,
          onProgress: (bytesReceived, progress) => updateState({ bytesReceived, progress })
        })
        : ({ kind: 'text', text: '' } as const);

      const payload: DecodedPayload = decoded.kind === 'text'
        ? { kind: 'text', text: decoded.text, mimeType }
        : { kind: 'bytes', chunks: decoded.chunks, mimeType };

      const { type, data } = await parsePayload(payload);

      const result: FetchResponse = { type, status: response.status, statusText: response.statusText, data };

      updateState({ phase: 'success', progress: 100, type, data });

      return result;
    } catch (error) {
      const cancelled = controller?.signal?.reason === cancelReason;

      const fetchError = error instanceof FetchError
        ? error
        : new FetchError({ message: formatUnknownError(error), cause: error, cancelled });

      updateState({ phase: cancelled ? 'cancelled' : 'error', error: fetchError, message: fetchError.message });
      throw fetchError;
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      stream = undefined;
      controller = undefined;
    }
  };

  return {
    get: (url: string) => {
      const key = `GET:${url}`;

      return checkInflight(key, () => executeFetch(url, { method: 'GET' }));
    },
    cancel: () => {
      if (state.phase !== 'loading') {
        return;
      }

      controller?.abort(cancelReason);

      if (!stream?.destroyed) {
        stream?.destroy(cancelReason);
      }
    },
    status: (callback?: (state: FetchState) => void) => {
      if (typeof callback === 'function') {
        listeners.add(callback);
        callback({ ...state });

        return () => {
          listeners.delete(callback);
        };
      }

      return { ...state };
    }
  };
};

export {
  decodeStream,
  isBinaryMime,
  isJsonMime,
  isTextMime,
  normalizeMime,
  parsePayload,
  preflight,
  setFetch,
  FetchError,
  type DecodedPayload,
  type DecodedStreamResult,
  type FetchState,
  type FetchResponse,
  type SetFetch
};

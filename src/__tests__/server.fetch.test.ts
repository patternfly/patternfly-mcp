import { Readable } from 'node:stream';
import { ReadableStream } from 'node:stream/web';
import {
  decodeStream,
  isJsonMime,
  isBinaryMime,
  isTextMime,
  normalizeMime,
  parsePayload,
  preflight,
  setFetch,
  FetchError
} from '../server.fetch';
import { getOptions } from '../options.context';

describe('MIME helpers', () => {
  it('normalizeMime should normalize and strip parameters', () => {
    expect(normalizeMime('text/HTML')).toBe('text/html');
    expect(normalizeMime('application/json; charset=utf-8')).toBe('application/json');
    expect(normalizeMime('  application/JSON  ')).toBe('application/json');
  });

  it('isBinaryMime should exist', () => expect(isBinaryMime).toBeDefined());

  it('isJsonMime should identify JSON types', () => {
    expect(isJsonMime('application/json')).toBe(true);
    expect(isJsonMime('application/ld+json')).toBe(true);
    expect(isJsonMime('text/plain')).toBe(false);
  });

  it('isTextMime should identify text-like types', () => {
    expect(isTextMime('text/plain')).toBe(true);
    expect(isTextMime('application/javascript')).toBe(true);
    expect(isTextMime('image/svg+xml')).toBe(true);
    expect(isTextMime('application/octet-stream')).toBe(true); // Treated as text for decoding
    expect(isTextMime('image/png')).toBe(false);
  });
});

describe('decodeStream', () => {
  it('should decode multi-byte characters split across chunks', async () => {
    const emoji = '🤖'; // 4 bytes: F0 9F A4 96
    const bytes = Buffer.from(emoji);
    const stream = Readable.from([bytes.slice(0, 2), bytes.slice(2)]) as any;

    const result = await decodeStream({
      stream,
      mimeType: 'text/plain',
      maxSizeBytes: 100,
      onProgress: () => {}
    });

    expect(result).toEqual({ kind: 'text', text: emoji });
  });

  it('should enforce maxSizeBytes during streaming', async () => {
    const stream = Readable.from([Buffer.from('12345'), Buffer.from('67890')]) as any;

    await expect(decodeStream({
      stream,
      mimeType: 'text/plain',
      maxSizeBytes: 5,
      onProgress: () => {}
    })).rejects.toThrow('Size exceeded maximum limit');
  });

  it('should report progress correctly', async () => {
    const stream = Readable.from([Buffer.from('abc'), Buffer.from('def')]) as any;
    const onProgress = jest.fn();

    await decodeStream({
      stream,
      mimeType: 'text/plain',
      totalSize: 6,
      maxSizeBytes: 100,
      onProgress
    });

    expect(onProgress).toHaveBeenCalledWith(3, 50);
    expect(onProgress).toHaveBeenCalledWith(6, 100);
  });
});

describe('parsePayload', () => {
  it('should parse valid JSON', async () => {
    const payload = { kind: 'text' as const, mimeType: 'application/json', text: '{"key": "value"}' };
    const result = await parsePayload(payload);

    expect(result).toEqual({ type: 'json', data: { key: 'value' } });
  });

  it('should throw FetchError for malformed JSON', async () => {
    const payload = { kind: 'text' as const, mimeType: 'application/json', text: '{invalid}' };

    await expect(parsePayload(payload)).rejects.toThrow('Invalid JSON payload');
  });

  it('should handle binary data when allowed', async () => {
    const payload = { kind: 'bytes' as const, mimeType: 'image/png', chunks: [new Uint8Array([0, 1])] };
    const options = { xhrFetch: { allowBinary: true } } as any;
    const result = await parsePayload(payload, options);

    expect(result.type).toBe('binary');
    expect(result.data).toBeInstanceOf(Blob);
  });
});

describe('preflight', () => {
  it('should return info on successful HEAD request', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: new Map([
        ['content-length', '500'],
        ['content-type', 'application/json']
      ])
    });

    const result = await preflight('https://example.com', new AbortController().signal);

    expect(result).toEqual({ contentLength: 500, contentType: 'application/json' });
  });

  it('should handle content-length: 0 as missing info', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: new Map([['content-length', '0'], ['content-type', 'text/html']])
    });

    const result = await preflight('https://example.com', new AbortController().signal);

    expect(result).toEqual({ contentType: 'text/html' });
    expect(result?.contentLength).not.toBeDefined();
  });

  it('should return null on 405 Method Not Allowed', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 405 });
    const result = await preflight('https://example.com', new AbortController().signal);

    expect(result).toBeNull();
  });
});

describe('setFetch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('should fetch and parse text', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: {
        get: (name: string) => {
          if (name === 'content-length') {
            return '11';
          }

          if (name === 'content-type') {
            return 'text/plain';
          }

          return null;
        }
      },
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('hello '));
          controller.enqueue(new TextEncoder().encode('world'));
          controller.close();
        }
      })
    };

    (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

    const { get, status } = setFetch();
    const result = await get('https://patternfly.org');

    expect(result).toEqual(expect.objectContaining({
      type: 'text',
      status: 200,
      data: 'hello world'
    }));

    expect(status()).toEqual(expect.objectContaining({
      type: 'text',
      phase: 'success',
      progress: 100,
      data: 'hello world'
    }));
  });

  it('should fetch and parse JSON', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: {
        get: (name: string) => {
          if (name === 'content-type') {
            return 'application/json';
          }

          return null;
        }
      },
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"foo": "bar"}'));
          controller.close();
        }
      })
    };

    (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

    const { get } = setFetch();
    const result = await get('https://patternfly.org/data.json');

    expect(result.type).toBe('json');
    expect(result.data).toEqual({ foo: 'bar' });
  });

  it('should reject with FetchError on non-ok response', async () => {
    const mockResponse = {
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: {
        get: () => null
      }
    };

    (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

    const { get, status } = setFetch();
    const { phase: prePhase } = status() as any;

    expect(prePhase).toBe('idle');

    await expect(get('https://patternfly.org/404')).rejects.toThrow(FetchError);

    const { phase: postPhase } = status() as any;

    expect(postPhase).toBe('error');
  });

  it('should check content-length against maxSizeBytes', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: {
        get: (name: string) => (name === 'content-length' ? '1000' : null)
      }
    };

    (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

    const options = {
      ...getOptions(),
      xhrFetch: { allowBinary: false, maxSizeBytes: 500, timeoutMs: 1000, preflightHead: false }
    };

    const { get, status } = setFetch(options as any);

    await expect(get('https://patternfly.org')).rejects.toThrow('File blocked: exceeds 500 bytes.');

    expect((status() as any).phase).toBe('error');
  });

  it('should reject redirected URLs that are not whitelisted', async () => {
    const mockResponse = {
      ok: true,
      url: 'https://untrusted.com/data',
      body: { cancel: jest.fn().mockResolvedValue(undefined) },
      headers: new Map()
    };

    (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

    const { get } = setFetch();

    await expect(get('https://patternfly.org/redirect')).rejects.toThrow('must be within the whitelisted URLs');
    expect(mockResponse.body.cancel).toHaveBeenCalled();
  });

  it('should de-duplicate concurrent requests to the same URL', async () => {
    (global.fetch as jest.Mock).mockReturnValue(new Promise(() => {})); // Hang
    const { get } = setFetch();

    const p1 = get('https://patternfly.org/data');
    const p2 = get('https://patternfly.org/data');

    expect(p1).toBe(p2);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('should reject concurrent requests to different URLs', async () => {
    (global.fetch as jest.Mock).mockReturnValue(new Promise(() => {})); // Hang
    const { get } = setFetch();

    get('https://patternfly.org/a');
    await expect(get('https://patternfly.org/b')).rejects.toThrow('Fetch already in progress');
  });

  it('should handle cancel properly', async () => {
    let rejectPull: (reason: any) => void = () => {};
    const mockCancel = jest.fn();

    const stream = new ReadableStream({
      pull() {
        return new Promise((_, reject) => {
          rejectPull = reject;
        });
      },
      cancel(reason) {
        mockCancel(reason);
        rejectPull(reason);
      }
    });

    const mockResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: {
        get: () => null
      },
      body: stream
    };

    (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

    const { get, cancel, status } = setFetch();
    const promise = get('https://patternfly.org');

    // Wait for the fetch to start and hit the reader
    await new Promise(resolve => setTimeout(resolve, 10));

    expect((status() as any).phase).toBe('loading');

    cancel();

    await expect(promise).rejects.toMatchObject({ cancelled: true });
    expect((status() as any).phase).toBe('cancelled');
    expect(mockCancel).toHaveBeenCalled();
  });

  it('should handle timeout', async () => {
    jest.useFakeTimers();

    (global.fetch as jest.Mock).mockImplementation((_url, init) => new Promise((_, reject) => {
      if (init?.signal) {
        init.signal.addEventListener('abort', () => {
          reject(init.signal.reason);
        });
      }
    }));

    const options = {
      ...getOptions(),
      xhrFetch: { allowBinary: false, maxSizeBytes: 0, timeoutMs: 100, preflightHead: false }
    };

    const { get, status } = setFetch(options as any);
    const promise = get('https://patternfly.org');

    jest.advanceTimersByTime(150);

    await expect(promise).rejects.toThrow('Timeout');
    expect((status() as any).phase).toBe('error');

    jest.useRealTimers();
  });
});

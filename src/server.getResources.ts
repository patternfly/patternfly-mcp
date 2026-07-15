import { readFile } from 'node:fs/promises';
import { accessSync } from 'node:fs';
import { isAbsolute, normalize, resolve, dirname, join, parse, sep } from 'node:path';
import semver, { type SemVer } from 'semver';
import { getOptions } from './options.context';
import { DEFAULT_OPTIONS } from './options.defaults';
import { memo } from './server.caching';
import { normalizeString } from './server.search';
import { isUrl, isPath, createError } from './server.helpers';
import { FetchError, setFetch } from './server.fetch';
import { delay } from './server.task';
import { log, formatUnknownError } from './logger';

/**
 * Represents a successful document processing attempt.
 *
 * @template T - Metadata that can be returned with the processed document.
 */
type ProcessedDocSuccess<T = Record<string, unknown>> = {
  content: string;
  path: string;
  resolvedPath: string;
  isSuccess: true;
} & T;

/**
 * Represents a failed document processing attempt.
 *
 * @template T - Metadata that can be returned with the processed document.
 */
type ProcessedDocFailure<T = Record<string, unknown>> = {
  content: string;
  path: string | undefined;
  resolvedPath: string | undefined;
  isSuccess: false;
} & T;

/**
 * A processed document, either successful or failed.
 *
 * @template T - Metadata that can be returned with the processed document.
 */
type ProcessedDoc<T = Record<string, unknown>> = ProcessedDocSuccess<T> | ProcessedDocFailure<T>;

/**
 * Match a dependency version against a list of supported versions.
 *
 * @note
 * - Ignore URLs
 * - Attempt to ignore paths, and aliases (:/.). and avoid `isPath` since semver
 *     versions could be considered a valid path.
 *
 * @param value - The dependency semver version string to match
 * @param supportedVersions - An array of supported semver version strings
 * @param options - Options object
 * @param options.sep - Optional path separator. Defaults to `sep` from `path`.
 * @returns A matched SemVer object containing a version string or `undefined` if no match is found.
 */
const matchPackageVersion = (value: string | undefined, supportedVersions: string[] = [], { sep: separator = sep } = {}) => {
  if (
    supportedVersions.length === 0 ||
    typeof value !== 'string' ||
    !value.trim() ||
    value.includes(separator) ||
    value.startsWith('.') ||
    (value.includes('>') && value.includes('<') && !value.includes('=')) ||
    isUrl(value)
  ) {
    return undefined;
  }

  const updatedSupportedVersions = supportedVersions.map(version => semver.coerce(version)).filter(Boolean) as SemVer[];
  const updatedValue = semver.maxSatisfying(updatedSupportedVersions, value);

  if (updatedValue) {
    return updatedValue;
  }

  return undefined;
};

/**
 * Find the nearest package.json by walking up the directory tree.
 *
 * @note Path lookup behavior has nuance when using relative paths. See unit tests for examples.
 * - Relative made-up directories to the working directory will return the closest match.
 * - Absolute starting paths with relative working directories will return the closest match.
 *
 * @note There is subtle behavior around using async `access` and looping. We ended up moving towards
 * `accessSync` when combined with the loop because it kept returning false positives. You can alter
 * it as-is back to async and witness the unit tests fail. If it is moved back to async, it
 * should be thoroughly tested.
 *
 * @param startPath - Directory to start searching from
 * @param options - Options object
 * @param options.resolvedPath - Set to `true` to return the absolute path, or `false` to return the relative path. Defaults to `true`.
 * @returns The resolved/relative path to the nearest package.json, or `undefined` if none is found.
 */
const findNearestPackageJson = (startPath: string, { resolvedPath = true } = {}) => {
  if (typeof startPath !== 'string' || isUrl(startPath) || !isPath(startPath, { isStrict: false })) {
    return undefined;
  }

  let currentDir = startPath.trim();
  const { root } = parse(currentDir);

  while (currentDir !== root) {
    const pkgPath = join(currentDir, 'package.json');

    try {
      accessSync(pkgPath);

      return resolvedPath ? resolve(pkgPath) : pkgPath;
    } catch {
      currentDir = dirname(currentDir);
    }
  }

  return undefined;
};

/**
 * Read a local file and return its contents as a string
 *
 * @param filePath - Path to the file to be read.
 * @returns The file contents as a string.
 */
const readLocalFileFunction = async (filePath: string) => await readFile(filePath, 'utf-8');

/**
 * Memoized version of readLocalFileFunction. Use default memo options.
 */
readLocalFileFunction.memo = memo(readLocalFileFunction, DEFAULT_OPTIONS.resourceMemoOptions.readFile);

/**
 * Fetch content from a URL with timeout and error handling
 *
 * @note Minor guard against unexpected binary content. Currently, binary content
 * is unsupported. See {@link XhrFetchOptions}
 *
 * @param url - URL to fetch
 * @returns The fetched content as a string.
 */
const fetchUrlFunction = async (url: string): Promise<string> => {
  const { get } = setFetch();
  const { data, type } = await get(url); // throws FetchError on any failure

  if (type === 'binary') {
    throw new FetchError({ message: `Cannot return binary content (${url}).` });
  }

  return typeof data === 'string' ? data : JSON.stringify(data);
};

/**
 * Memoized version of fetchUrlFunction. Use default memo options.
 */
fetchUrlFunction.memo = memo(fetchUrlFunction, DEFAULT_OPTIONS.resourceMemoOptions.fetchUrl);

/**
 * Resolve a local path against a base directory.
 * Ensures the resolved path stays within the intended base for security.
 *
 * @param path - Path to resolve. If it's relative, it will be resolved against the base directory.'
 * @param settings - Optional settings object.
 * @param settings.sep - Optional path separator. Defaults to `sep` from `path`.
 * @param options - Options
 * @returns Resolved file or URL path.
 *
 * @throws {Error} - Throws an error if the resolved path is invalid or outside the allowed base directory.
 */
const resolveLocalPathFunction = (path: string, { sep: separator = sep } = {}, options = getOptions()) => {
  const documentationPrefix = options.docsPathSlug;

  // Safety check: Ensure the path is within the allowed directory
  const confirmThenReturnResolvedBase = (base: string, resolved: string) => {
    const normalizedBase = normalize(base);
    const refinedBase = normalizedBase.endsWith(separator) ? normalizedBase : `${normalizedBase}${separator}`;

    if (!resolved.startsWith(refinedBase) && resolved !== normalizedBase) {
      throw new Error(`Access denied: path ${path} is outside of allowed directory ${base}`);
    }

    return resolved;
  };

  if (path.startsWith(documentationPrefix)) {
    const subPath = path.slice(documentationPrefix.length);
    const failedBasePaths = [];

    for (const base of options.docsPaths) {
      const resolved = resolve(base, subPath);

      try {
        return confirmThenReturnResolvedBase(base, resolved);
      } catch {
        failedBasePaths.push(base);
      }
    }
    throw new Error(`Access denied: path ${path} does not match any allowed documentation directories ${failedBasePaths.join(', ')}`);
  }

  if (isUrl(path)) {
    return path;
  }

  const base = options.contextPath;
  const resolved = isAbsolute(path) ? normalize(path) : resolve(base, path);

  return confirmThenReturnResolvedBase(base, resolved);
};

/**
 * Mock a given path or URL. Used for testing with fixture servers.
 *
 * @param pathOrUrl - Input path or URL to be resolved.
 * @param options - Options
 * @returns Resolves to the finalized URL or path as a memoized fetchable resource.
 *
 * @throws {Error} Throws an error if the given path cannot be resolved in the specified mode and is neither a valid URL nor fetchable.
 */
const mockPathOrUrlFunction = async (pathOrUrl: string, options = getOptions()) => {
  const fixtureUrl = options.modeOptions?.test?.baseUrl;
  let updatedPathOrUrl = resolveLocalPathFunction(pathOrUrl);

  if (fixtureUrl && !updatedPathOrUrl.startsWith(fixtureUrl)) {
    updatedPathOrUrl = `${fixtureUrl}${updatedPathOrUrl.startsWith('/') ? updatedPathOrUrl : `/${updatedPathOrUrl}`}`;
  } else if (!isUrl(updatedPathOrUrl)) {
    throw new Error(`Access denied: path ${updatedPathOrUrl} cannot be accessed in ${options.mode} mode`);
  }

  // In test mode, everything is treated as a fetchable resource to allow mocking
  return fetchUrlFunction.memo(updatedPathOrUrl);
};

/**
 * Load a file from disk or `URL`, depending on the input type.
 *
 * @param pathOrUrl - Path or URL to load. If it's a URL, it will be fetched with `timeout` and `error` handling.
 * @param options - Options
 * @returns Resolves to an object containing the loaded content, path, and the resolved path.
 * @throws {Error} If the path cannot be accessed in the current mode. Includes `path` and `resolvedPath`
 *     properties when available.
 */
const loadFileFetch = async (pathOrUrl: string, options = getOptions()) => {
  let updatedPathOrUrl = pathOrUrl;

  try {
    if (options.mode === 'test') {
      const mockContent = await mockPathOrUrlFunction(pathOrUrl);

      return { content: mockContent, resolvedPath: updatedPathOrUrl, path: pathOrUrl };
    }

    updatedPathOrUrl = resolveLocalPathFunction(pathOrUrl);
    let content;

    if (isUrl(updatedPathOrUrl)) {
      content = await fetchUrlFunction.memo(updatedPathOrUrl);
    } else {
      content = await readLocalFileFunction.memo(updatedPathOrUrl);
    }

    return { content, resolvedPath: updatedPathOrUrl, path: pathOrUrl };
  } catch (error) {
    throw createError(error, {}, { resolvedPath: updatedPathOrUrl, path: pathOrUrl });
  }
};

/**
 * Promise queue for `loadFileFetch`. Limit the number of concurrent promises.
 *
 * @param queue - List of paths or URLs to load
 * @param settings - Optional settings object.
 * @param settings.limit - Optional limit on the number of concurrent promises. Defaults to `5`.
 * @param settings.throttleMs - Optional throttle for requests (ms). Interrupts based on the `limit`. Defaults to `250`.
 * @returns An array of `PromiseSettledResult` objects, one for each input path or URL.
 */
const promiseQueue = async (queue: string[], { limit = 5, throttleMs = 250 } = {}) => {
  const results = [];
  const slidingQueue = new Set<Promise<unknown>>();
  // let activeCount = 0;

  for (const [index, item] of queue.entries()) {
    // Use a sliding window to limit the number of concurrent promises.
    const promise = loadFileFetch(item).finally(() => {
      slidingQueue.delete(promise);
    });

    results.push(promise);
    slidingQueue.add(promise);

    // Make sure we never have more than `limit` of promises inflight.
    if (slidingQueue.size >= limit) {
      // Silent fail if one promise fails to load, but keep processing the rest.
      await Promise.race(slidingQueue).catch((reason: unknown) => {
        log.debug(`Failed to load promise from queue: ${formatUnknownError(reason)}`);
      });
    }

    // Throttle every `limit` number of intervals
    if (throttleMs > 0 && (index + 1) % limit === 0) {
      // Minor variance for throttling, prevent sync, slightly longer or shorter.
      const randomizedMs = throttleMs * (0.9 + Math.random() * 0.2);

      await delay({ ms: randomizedMs });
    }
  }

  return Promise.allSettled(results);
};

/**
 * Normalize inputs, load all in parallel, and return per-doc results.
 *
 * @note Remember:
 * - To limit the number of docs to load to avoid OOM.
 * - Deduplication of paths happens using `normalizeString.memo`. Original paths are
 *     still used to fetch and are returned as part of the result.
 *
 * @template T - Metadata fields on `{ doc, ...metadata }` inputs, merged into each result.
 * @param inputs - List of paths or URLs to load
 * @param options - Optional options
 * @returns An array of {@link ProcessedDoc} entries:
 *   - `content` is the loaded content string.
 *   - `path` is the original input path or URL.
 *   - `resolvedPath` is the resolved path after normalization, see {@link loadFileFetch}.
 *   - `isSuccess` is true if the doc was successfully loaded, false otherwise.
 */
const processDocsFunction = async <T extends Record<string, unknown> = Record<string, unknown>>(
  inputs: (string | ({ doc: string } & T))[],
  options = getOptions()
): Promise<ProcessedDoc<Omit<T, 'doc'>>[]> => {
  const normalizeInputs = inputs.map(input =>
    (typeof input === 'string' ? { doc: input } : input) as { doc: string } & T);

  const uniqueInputsMap = new Map<string, { doc: string } & T>();

  for (const input of normalizeInputs) {
    const trimmedDoc = input.doc.trim();

    if (trimmedDoc) {
      const normalizedPath = normalizeString.memo(trimmedDoc);

      if (!uniqueInputsMap.has(normalizedPath)) {
        uniqueInputsMap.set(normalizedPath, { ...input, doc: trimmedDoc });
      }
    }
  }

  const uniqueInputsList = Array.from(uniqueInputsMap.values()).slice(0, options.minMax.docsToLoad.max);
  const list = uniqueInputsList.map(input => input.doc);

  const settled = await promiseQueue(list);
  const docs: ProcessedDoc<Omit<T, 'doc'>>[] = [];

  settled.forEach((res, index) => {
    const originalInput = uniqueInputsList[index];

    if (!originalInput) {
      return;
    }

    const { doc: originalPath, ...metadata } = originalInput;

    if (res.status === 'fulfilled') {
      docs.push({
        ...(metadata as Omit<T, 'doc'>),
        ...res.value,
        isSuccess: true
      });

      return;
    }

    const reason: Error & { path?: string; resolvedPath?: string } = res.reason;
    const error = reason instanceof Error ? reason : undefined;
    const errorPath = error?.path || originalPath;
    const errorResolvedPath = error?.resolvedPath || undefined;
    const errorMessage = error?.message || String(reason);

    docs.push({
      ...(metadata as Omit<T, 'doc'>),
      content: `❌ Failed to load ${errorPath}: ${errorMessage}`,
      path: errorPath,
      resolvedPath: errorResolvedPath,
      isSuccess: false
    });

    log.debug(`Failed to load ${errorPath} from processing: ${formatUnknownError(errorMessage)}`);
  });

  return docs;
};

/**
 * Memoized version of processDocsFunction. Use default memo options.
 */
processDocsFunction.memo = memo(processDocsFunction, DEFAULT_OPTIONS.toolMemoOptions.usePatternFlyDocs);

export {
  fetchUrlFunction,
  findNearestPackageJson,
  loadFileFetch,
  matchPackageVersion,
  processDocsFunction,
  promiseQueue,
  readLocalFileFunction,
  resolveLocalPathFunction,
  type ProcessedDoc,
  type ProcessedDocSuccess,
  type ProcessedDocFailure
};

import { readFile } from 'node:fs/promises';
import { isAbsolute, normalize, resolve, sep } from 'node:path';
import { getOptions } from './options.context';
import { DEFAULT_OPTIONS } from './options.defaults';
import { memo } from './server.caching';
import { normalizeString } from './server.search';
import { isUrl } from './server.helpers';
import { log, formatUnknownError } from './logger';

interface ProcessedDoc {
  content: string;
  path: string | undefined;
  resolvedPath: string | undefined;
  isSuccess: boolean;
}

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
 * @note Review expanding fetch to handle more file types like JSON.
 *
 * @param url - URL to fetch
 * @param options - Options
 * @returns The fetched content as a string.
 */
const fetchUrlFunction = async (url: string, options = getOptions()) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.xhrFetch.timeoutMs);

  // Allow the process to exit
  timeout.unref();

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'text/plain, text/markdown, */*' }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
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
 * @param options - Options
 * @returns Resolved file or URL path.
 *
 * @throws {Error} - Throws an error if the resolved path is invalid or outside the allowed base directory.
 */
const resolveLocalPathFunction = (path: string, options = getOptions()) => {
  const documentationPrefix = options.docsPathSlug;

  // Safety check: Ensure the path is within the allowed directory
  const assertPathWithinBaseAndReturn = (base: string, resolved: string) => {
    const normalizedBase = normalize(base);
    const refinedBase = normalizedBase.endsWith(sep) ? normalizedBase : `${normalizedBase}${sep}`;

    if (!resolved.startsWith(refinedBase) && resolved !== normalizedBase) {
      throw new Error(`Access denied: path ${path} is outside of allowed directory ${base}`);
    }

    return resolved;
  };

  // Paths starting with the documentation prefix are resolved relative to the documentation path
  if (path.startsWith(documentationPrefix)) {
    const base = options.docsPath;
    const resolved = resolve(base, path.slice(documentationPrefix.length));

    return assertPathWithinBaseAndReturn(base, resolved);
  }

  // URLs are returned as-is
  if (isUrl(path)) {
    return path;
  }

  const base = options.contextPath;
  const resolved = isAbsolute(path) ? normalize(path) : resolve(base, path);

  return assertPathWithinBaseAndReturn(base, resolved);
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
  const documentationPrefix = options.docsPathSlug;
  const fixtureUrl = options.modeOptions?.test?.baseUrl;
  let updatedPathOrUrl = pathOrUrl.startsWith(documentationPrefix) ? pathOrUrl : resolveLocalPathFunction(pathOrUrl);

  if (fixtureUrl) {
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
 * @returns Resolves to an object containing the loaded content and the resolved path.
 */
const loadFileFetch = async (pathOrUrl: string, options = getOptions()) => {
  if (options.mode === 'test') {
    const mockContent = await mockPathOrUrlFunction(pathOrUrl);

    return { content: mockContent, resolvedPath: pathOrUrl };
  }

  const updatedPathOrUrl = resolveLocalPathFunction(pathOrUrl);
  let content;

  if (isUrl(updatedPathOrUrl)) {
    content = await fetchUrlFunction.memo(updatedPathOrUrl);
  } else {
    content = await readLocalFileFunction.memo(updatedPathOrUrl);
  }

  return { content, resolvedPath: updatedPathOrUrl };
};

/**
 * Promise queue for `loadFileFetch`. Limit the number of concurrent promises.
 *
 * @param queue - List of paths or URLs to load
 * @param limit - Optional limit on the number of concurrent promises. Defaults to 5.
 * @returns An array of `PromiseSettledResult` objects, one for each input path or URL.
 */
const promiseQueue = async (queue: string[], limit = 5) => {
  const results = [];
  const slidingQueue = new Set();
  let activeCount = 0;

  for (const item of queue) {
    // Use a sliding window to limit the number of concurrent promises.
    const promise = loadFileFetch(item).finally(() => {
      slidingQueue.delete(promise);
      activeCount -= 1;
    });

    results.push(promise);
    slidingQueue.add(promise);
    activeCount += 1;

    if (activeCount >= limit) {
      // Silent fail if one promise fails to load, but keep processing the rest.
      await Promise.race(slidingQueue).catch((reason: unknown) => {
        log.debug(`Failed to load promise from queue: ${formatUnknownError(reason)}`);
      });
    }
  }

  return Promise.allSettled(results);
};

/**
 * Normalize inputs, load all in parallel, and return a joined string.
 *
 * @note Remember to limit the number of docs to load to avoid OOM.
 * @param inputs - List of paths or URLs to load
 * @param options - Optional options
 * @returns An array of loaded docs with content, path, resolvedPath, and isSuccess properties:
 *   - `content` is the loaded content string.
 *   - `path` is the original input path or URL.
 *   - `resolvedPath` is the resolved path after normalization.
 *   - `isSuccess` is true if the doc was successfully loaded, false otherwise.
 */
const processDocsFunction = async (
  inputs: string[],
  options = getOptions()
): Promise<ProcessedDoc[]> => {
  const uniqueInputs = new Map(
    inputs.map(input => [normalizeString.memo(input), input.trim()])
  );
  const list = Array.from(uniqueInputs.values()).slice(0, options.maxDocsToLoad).filter(Boolean);

  const settled = await promiseQueue(list);
  const docs: { content: string, path: string | undefined, resolvedPath: string | undefined, isSuccess: boolean }[] = [];

  settled.forEach((res, index) => {
    const original = list[index];
    let content;
    let resolvedPath;
    const path = original;
    let isSuccess = false;

    if (res.status === 'fulfilled') {
      const { resolvedPath: docResolvedPath, content: docContent } = res.value;

      resolvedPath = docResolvedPath;
      content = docContent;
      isSuccess = true;
    } else {
      const errorMessage = res.reason instanceof Error ? res.reason.message : String(res.reason);

      content = `❌ Failed to load ${original}: ${errorMessage}`;
    }

    docs.push({
      content,
      path,
      resolvedPath,
      isSuccess
    });
  });

  return docs;
};

/**
 * Memoized version of processDocsFunction. Use default memo options.
 */
processDocsFunction.memo = memo(processDocsFunction, DEFAULT_OPTIONS.toolMemoOptions.usePatternFlyDocs);

export {
  fetchUrlFunction,
  loadFileFetch,
  processDocsFunction,
  promiseQueue,
  readLocalFileFunction,
  resolveLocalPathFunction,
  type ProcessedDoc
};

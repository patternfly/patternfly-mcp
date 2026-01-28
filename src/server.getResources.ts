import { readFile } from 'node:fs/promises';
import { isAbsolute, normalize, resolve } from 'node:path';
import { getOptions } from './options.context';
import { DEFAULT_OPTIONS } from './options.defaults';
import { memo } from './server.caching';
import { normalizeString } from './server.search';
import { isUrl } from './server.helpers';

/**
 * Read a local file and return its contents as a string
 *
 * @param filePath
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
 */
const resolveLocalPathFunction = (path: string, options = getOptions()) => {
  if (isUrl(path)) {
    return path;
  }

  const base = options.contextPath;
  const resolved = isAbsolute(path) ? normalize(path) : resolve(base, path);

  // Safety check: ensure the resolved path actually starts with the base directory
  if (!resolved.startsWith(normalize(base))) {
    throw new Error(`Access denied: path ${path} is outside of base directory ${base}`);
  }

  return resolved;
};

/**
 * Load a file from disk or `URL`, depending on the input type.
 *
 * @param pathOrUrl - Path or URL to load. If it's a URL, it will be fetched with `timeout` and `error` handling.
 */
const loadFileFetch = async (pathOrUrl: string) => {
  const isUrlStr = isUrl(pathOrUrl);
  const updatedPathOrUrl = (isUrlStr && pathOrUrl) || resolveLocalPathFunction(pathOrUrl);
  let content;

  if (isUrlStr) {
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
      await Promise.race(slidingQueue).catch(() => {});
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
 */
const processDocsFunction = async (
  inputs: string[],
  options = getOptions()
) => {
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

export { fetchUrlFunction, loadFileFetch, processDocsFunction, promiseQueue, readLocalFileFunction, resolveLocalPathFunction };

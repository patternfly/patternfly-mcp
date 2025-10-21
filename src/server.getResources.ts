import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { OPTIONS } from './options';
import { memo } from './server.caching';

/**
 * Read a local file and return its contents as a string
 *
 * @param filePath
 */
const readLocalFileFunction = async (filePath: string) => await readFile(filePath, 'utf-8');

/**
 * Memoized version of readLocalFileFunction
 */
readLocalFileFunction.memo = memo(readLocalFileFunction, OPTIONS.resourceMemoOptions.readFile);

/**
 * Fetch content from a URL with timeout and error handling
 *
 * @param url
 */
const fetchUrlFunction = async (url: string) => {
  const controller = new AbortController();
  const timeoutMs = Number(process.env.DOC_MCP_FETCH_TIMEOUT_MS || 15_000);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

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
 * Memoized version of fetchUrlFunction
 */
fetchUrlFunction.memo = memo(fetchUrlFunction, OPTIONS.resourceMemoOptions.fetchUrl);

/**
 * Resolve a local path depending on docs host flag
 *
 * @param relativeOrAbsolute
 * @param options
 */
const resolveLocalPathFunction = (relativeOrAbsolute: string, options = OPTIONS) =>
  (options.docsHost && join(options.llmsFilesPath, relativeOrAbsolute)) || relativeOrAbsolute;

/**
 * Normalize inputs, load all in parallel, and return a joined string.
 *
 * @param inputs
 * @param options
 */
const processDocsFunction = async (
  inputs: string[],
  options = OPTIONS
) => {
  const seen = new Set<string>();
  const list = inputs
    .map(str => String(str).trim())
    .filter(Boolean)
    .filter(str => {
      if (seen.has(str)) {
        return false;
      }
      seen.add(str);

      return true;
    });

  const loadOne = async (pathOrUrl: string) => {
    const isUrl = options.urlRegex.test(pathOrUrl);
    const updatedPathOrUrl = (isUrl && pathOrUrl) || resolveLocalPathFunction(pathOrUrl);
    let content;

    if (isUrl) {
      content = await fetchUrlFunction.memo(updatedPathOrUrl);
    } else {
      content = await readLocalFileFunction.memo(updatedPathOrUrl);
    }

    return { header: `# Documentation from ${updatedPathOrUrl}`, content };
  };

  const settled = await Promise.allSettled(list.map(item => loadOne(item)));
  const parts: string[] = [];

  settled.forEach((res, index) => {
    const original = list[index];

    if (res.status === 'fulfilled') {
      const { header, content } = res.value;

      parts.push(`${header}\n\n${content}`);
    } else {
      parts.push(`❌ Failed to load ${original}: ${res.reason}`);
    }
  });

  return parts.join(options.separator);
};

export { readLocalFileFunction, fetchUrlFunction, resolveLocalPathFunction, processDocsFunction };

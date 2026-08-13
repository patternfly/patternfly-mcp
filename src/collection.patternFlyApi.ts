import {
  type McpCollection,
  type McpCollectionRecord,
  type McpCollectionResult
} from './collections';
import { log } from './logger';
import { processDocsFunction } from './server.getResources';
import { memo } from './server.caching';
import { isPlainObject, joinUrl } from './server.helpers';
import {
  getOptions,
  getSessionOptions,
  runWithOptions,
  runWithSession
} from './options.context';
import { DEFAULT_OPTIONS } from './options.defaults';

/**
 * Processed content for API responses.
 *
 * @property url - The URL of the content.
 * @property content - The content itself.
 * @property semanticContext - Semantic context of the content.
 * @property semanticContext.version - PatternFly version of the content.
 * @property semanticContext.section - Section of the content.
 * @property semanticContext.item - Item of the content.
 * @property semanticContext.facet - Facet of the content.
 * @property semanticContext.kind - Kind of the content.
 * @property semanticContext.metadata - Remaining metadata, if any, of the content.
 */
interface ApiContent {
  url: string;
  content: string;
  semanticContext: {
    version?: string | undefined;
    section?: string | undefined;
    item?: string | undefined;
    facet?: string | undefined;
    kind?: string | undefined;
    metadata?: string[] | undefined;
  }
}

/**
 * API crawler response.
 *
 * @interface ApiCrawler
 *
 * @property content - Content retrieved from the API.
 * @property path - Initial or relative path used to fetch the content.
 * @property resolvedPath - Absolute or resolved path after processing the initial path.
 */
interface ApiCrawler {
  content: string;
  path: string;
  resolvedPath: string;
}

/**
 * API parsed payload response
 */
type ParsePayloadApi = string | number | boolean | null | string[] | Record<string, unknown>;

/**
 * API parsed payload response.
 *
 * @interface ParsePayload
 *
 * @property isEmpty - Whether the parsed payload is considered empty.
 * @property {ParsePayloadApi} payload - Parsed version of the input payload.
 */
interface ParsePayload {
  isEmpty: boolean;
  payload: ParsePayloadApi;
}

/**
 * Parses the given payload and determines its state and structure.
 *
 * @param payload - Input payload to be parsed.
 * @returns An object containing:
 * - `isEmpty`: A boolean indicating whether the parsed payload is considered empty.
 * - `payload`: The parsed version of the input payload. If the input is a string
 *   and can be parsed as JSON without error, the parsed result is returned.
 *   Otherwise, the trimmed string or original value is provided.
 */
const parsePayload = (payload: unknown): ParsePayload => {
  const updatedPayload = typeof payload === 'string' ? payload.trim() : '';
  let isEmpty: boolean;
  let parsedPayload: ParsePayloadApi;

  try {
    parsedPayload = JSON.parse(updatedPayload);

    if (typeof parsedPayload === 'number') {
      isEmpty = false;
    } else {
      isEmpty = (Array.isArray(parsedPayload) && parsedPayload.length === 0) ||
        (isPlainObject(parsedPayload) && Object.keys(parsedPayload).length === 0) ||
        parsedPayload === null;
    }
  } catch {
    parsedPayload = updatedPayload;
    isEmpty = updatedPayload.length === 0;
  }

  return { isEmpty, payload: parsedPayload };
};

/**
 * Memoized version of parsePayload.
 */
parsePayload.memo = memo(parsePayload, DEFAULT_OPTIONS.resourceMemoOptions.default);

/**
 * Determines if the payload is empty.
 *
 * @param payload - Data to be evaluated for emptiness.
 * @returns Returns `true` if the payload is empty, otherwise `false`.
 */
const isEmptyPayload = (payload: unknown) => {
  if (typeof payload === 'string') {
    const trimmedPayload = payload.trim();

    return trimmedPayload === '' || trimmedPayload === '{}' || trimmedPayload === '[]' || trimmedPayload === 'null' || trimmedPayload === '""';
  }

  return payload === null || payload === undefined || parsePayload.memo(payload).isEmpty;
};

/**
 * Memoized version of isEmptyPayload.
 */
isEmptyPayload.memo = memo(isEmptyPayload, DEFAULT_OPTIONS.resourceMemoOptions.default);

/**
 * Recursively crawls a list of URLs.
 *
 * Resolves paths and fetches content; built specifically around the PatternFly API response structure.
 *
 * @param urls - The list of URLs to crawl.
 * @param [options] - An optional configuration object.
 * @returns {Promise<ProcessedDoc[]>} A promise that resolves to an array of processed documents,
 *     each containing information about the crawling result, status, and content.
 */
const crawler = async (urls: string[], options = getOptions()): Promise<ApiCrawler[]> => {
  const componentPaths = options.patternflyOptions.api.componentPaths;
  const settled = await processDocsFunction(urls);
  const content: ApiCrawler[] = [];

  for (const res of settled) {
    const { isEmpty, payload } = parsePayload.memo(res.content);

    if (res.isSuccess) {
      if (Array.isArray(payload)) {
        if (componentPaths.some(componentPath => res?.path?.includes(componentPath))) {
          if (!isEmpty) {
            content.push({ ...res });
          }
          continue;
        }

        const updatedPayload = [...payload, ...componentPaths].map(path => joinUrl(res.path, path));
        const crawledContent = await crawler(updatedPayload);

        content.push(...crawledContent);
        continue;
      }

      if (!isEmpty) {
        content.push({ ...res });
      }
    }
  }

  return content;
};

/**
 * Get and process available API versions.
 *
 * @param [options=getOptions()] - Configuration options.
 * @returns A promise that resolves to an array of processed version URLs.
 *
 * @throws
 */
const getVersions = async (options = getOptions()) => {
  const versionUrl = options.patternflyOptions.api.versions;
  const processedVersions = await processDocsFunction([versionUrl]);
  const versions: string[] = [];

  if (processedVersions[0]) {
    const response = processedVersions[0];

    if (response.isSuccess) {
      const { payload } = parsePayload.memo(response.content);

      if (Array.isArray(payload)) {
        versions.push(...payload.map(version => joinUrl(options.patternflyOptions.api.base, version)));
      }
    }
  }

  if (versions.length === 0) {
    throw new Error(`No API versions available ${versionUrl}.`);
  }

  return versions;
};

/**
 * Process content metadata from response paths.
 *
 * @param apiResponses - The list of pre-metadata content.
 * @param [options=getOptions()] - Configuration options.
 * @returns The list of processed API content with metadata.
 */
const contentMetadata = (apiResponses: ApiCrawler[], options = getOptions()): ApiContent[] => {
  const base = options.patternflyOptions.api.base;
  const componentPaths = options.patternflyOptions.api.componentPaths;

  return apiResponses.map(({ content, resolvedPath }) => {
    const [version, section, item, facet, ...remaining] = resolvedPath.replace(base, '').split('/').filter(Boolean) || [];
    const kind = facet && (componentPaths.includes(facet) || remaining.includes(facet)) ? facet : 'doc';

    return {
      url: resolvedPath,
      content,
      semanticContext: {
        version,
        section,
        item,
        facet,
        kind,
        metadata: (remaining.length && remaining) || undefined
      }
    };
  });
};

/**
 * Memoized version of contentMetadata.
 */
contentMetadata.memo = memo(contentMetadata);

/**
 * Initiate API crawl.
 *
 * @returns A promise resolving to an array of processed API content entries.
 */
const apiSpider = async (): Promise<ApiContent[]> => {
  log.info(`API spider crawl started`);
  let seedVersions: string[] = [];
  let content: ApiCrawler[] = [];

  try {
    seedVersions = await getVersions();
  } catch (err) {
    log.warn(`API spider: getVersions failed`, err);

    return [];
  }

  if (seedVersions.length) {
    try {
      content = await crawler(seedVersions);
    } catch (err) {
      log.warn(`API spider: crawler failed`, err);

      return [];
    }
  }

  // Review the memo here. It may be better served to tie into crawler,
  // like `crawler.memo` as part of the countdown to refresh
  const updatedContent = contentMetadata.memo(content);

  log.info(
    `API spider crawl completed. ${updatedContent.length} content ${
      (updatedContent.length === 1 && 'entry') || 'entries'
    } retrieved.`
  );

  return updatedContent;
};

/**
 * Async collect and process entries for a collection.
 *
 * @returns {Promise<McpCollectionResult>} Object containing a list of processed records.
 */
const collectionCallback = async (): Promise<McpCollectionResult> => {
  const entries = await apiSpider();
  const recordsMap: Map<string, McpCollectionRecord> = new Map();

  entries?.forEach((entry, index) => {
    const semanticContext = entry.semanticContext || {};
    const name = (semanticContext.item || 'api-entry').toLowerCase();
    const version = (semanticContext.version || 'unknown').toLowerCase();
    const displayName = semanticContext.item || name;

    const id = `api::${version}::${semanticContext.section || ''}::${name}::${semanticContext.kind || ''}::${index}`;

    if (recordsMap.has(id)) {
      return;
    }

    const adaptedEntry = {
      displayName,
      description: entry.content || `PatternFly API documentation for ${displayName}`,
      pathSlug: name,
      category: semanticContext.kind,
      section: semanticContext.section || 'components',
      source: 'api' as const,
      version,
      id,
      path: entry.url
    };

    const record = {
      id,
      sourceId: entry.url,
      sourceType: 'api' as const,
      data: {
        [name]: adaptedEntry
      }
    };

    recordsMap.set(record.id, record);
  });

  return { records: [...recordsMap.values()] };
};

/**
 * Create a PatternFly API collection.
 *
 * @param options - Global options
 * @param session - Session options
 * @returns {McpCollection} The collection definition tuple
 */
const patternFlyApiCollection = (options = getOptions(), session = getSessionOptions()): McpCollection => {
  const callback: McpCollection[1] = async () =>
    runWithSession(session, async () =>
      runWithOptions(options, async () => collectionCallback()));

  return [
    'patternfly-api',
    callback,
    {
      runParallel: '#collectionPatternFlyApi',
      runSchedule: {
        cancelMs: options.patternflyOptions.api.crawlCancelMs,
        intervalMs: options.patternflyOptions.api.crawlIntervalMs
      }
    }
  ];
};

export {
  patternFlyApiCollection,
  collectionCallback,
  apiSpider,
  crawler,
  isEmptyPayload,
  parsePayload,
  type ApiContent,
  type ApiCrawler,
  type ParsePayload,
  type ParsePayloadApi
};

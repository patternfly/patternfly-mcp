import {
  type McpCollection,
  type McpCollectionRecord,
  type McpCollectionResult
} from './collections';
import { log } from './logger';
import { processDocsFunction } from './server.getResources';
import { memo } from './server.caching';
import { isPlainObject, joinUrl, timeoutFunction } from './server.helpers';
import {
  getOptions,
  getSessionOptions,
  runWithOptions,
  runWithSession
} from './options.context';
import { DEFAULT_OPTIONS } from './options.defaults';
import {
  calculateContentQualityScore,
  extractApiDescription,
  extractApiDisplayName,
  extractApiName,
  normalizeSlug
} from './collection.patternFlyApiHelpers';
import { contentType } from './resource.helpers';

/**
 * Processed content for API responses.
 *
 * @interface ApiContent
 *
 * @property description - Description of the content.
 * @property displayName - Display name of the content.
 * @property category - Category of the content.
 * @property isLowQuality - Whether the content is low quality.
 * @property id - ID of the content.
 * @property isDeferred - Whether the content is deferred.
 * @property name - Name of the content.
 * @property path - Path of the content.
 * @property pathSlug - Slug path of the content.
 * @property section - Section of the content.
 * @property source - Source of the content.
 * @property version - Version of the content.
 */
interface ApiContent {
  description: string;
  displayName: string;
  category: string;
  content: string;
  contentType: string;
  isLowQuality: boolean;
  id: string;
  isDeferred: boolean;
  name: string;
  path: string;
  pathSlug: string;
  section: string;
  source: string;
  version: string;
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
 * Deferred API categories.
 *
 * @note Minimal PatternFly API data quality threshold
 * - Last resort for content that requires additional parsing or should be ignored.
 * - A quality threshold still has to be met even if these items are removed
 * - Quality metrics need to be updated periodically as API content is added.
 *
 * - `props`: Deferred in favor of using @patternfly/patternfly-component-schemas.
 * - `react`: Quality threshold applied. Some examples still contain low-quality data.
 * - `react-demos`: Deferred React demonstration components.
 * - `html`: Quality threshold applied. Some examples still contain low-quality data.
 * - `html-demos`: Deferred HTML demonstration examples.
 * - `text`: Quality threshold applied. Some examples still contain low-quality data.
 */
const DEFERRED_API_CATEGORIES = new Set<string>([
  'props',
  // 'react',
  'react-demos',
  // 'html',
  'html-demos'
  // 'text',
  // 'examples'
]);

/**
 * Min content quality threshold. See {@link calculateContentQualityScore}
 */
const MIN_API_QUALITY_THRESHOLD = 0.95;

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
 * Filters and returns a list of unique URLs from the input array, ensuring no duplicates.
 *
 * @param urls - Array of URLs to be filtered for uniqueness.
 * @param [visited] - Set object for visited URLs. Defaults to an empty Set.
 * @returns An array containing only unique URLs from the input array.
 */
const getUniqueUrls = (urls: string[], visited = new Set<string>()) => urls.filter(url => {
  if (visited.has(url)) {
    return false;
  }

  visited.add(url);

  return true;
});

/**
 * Recursively crawls a list of URLs.
 *
 * Resolves paths and fetches content; built specifically around the PatternFly API response structure.
 *
 * @param urls - The list of URLs to crawl.
 * @param [settings] - An optional configuration object.
 * @param [settings.visited] - Used to track visited paths.
 * @param [settings.signal] - AbortSignal for the crawling operation.
 * @param [options] - An optional configuration object.
 * @returns {Promise<ApiCrawler[]>} A promise that resolves to an array of processed documents,
 *     each containing information about the crawling result, status, and content.
 */
const crawler = async (
  urls: string[],
  { visited = new Set<string>(), signal }: { visited?: Set<string>; signal?: AbortSignal | undefined } = {},
  options = getOptions()
): Promise<ApiCrawler[]> => {
  if (signal?.aborted) {
    log.debug('Aborted PatternFly API collection crawl.');

    return [];
  }

  const { componentPaths, traversalPaths } = options.patternflyOptions.api;
  const uniqueUrls = getUniqueUrls(urls, visited);

  if (uniqueUrls.length === 0) {
    return [];
  }

  const settled = await processDocsFunction(uniqueUrls) || [];
  const content: ApiCrawler[] = [];

  for (const res of settled) {
    if (!res.isSuccess) {
      continue;
    }

    const { isEmpty, payload } = parsePayload.memo(res.content);

    if (Array.isArray(payload)) {
      // Terminal Data Arrays (props, css, etc)
      if (componentPaths.some(componentPath => res?.path?.endsWith(`/${componentPath}`))) {
        if (!isEmpty) {
          content.push({ ...res });
        }
        continue;
      }

      // Traversal & Directory Array Processing
      const flattenedPayload: string[] = [];

      payload.forEach(value => {
        if (typeof value === 'string') {
          flattenedPayload.push(value);

          log.debug(`Collection PatternFly API adding path`, value);
        } else if (isPlainObject(value)) {
          Object.values(value).forEach(value => {
            if (typeof value === 'string') {
              flattenedPayload.push(value);

              log.debug(`Collection PatternFly API adding path`, value);
            }
          });
        }
      });

      const updatedPayload = [...flattenedPayload, ...traversalPaths, ...componentPaths].map(path => joinUrl(res.path, path));

      log.debug(`Collection PatternFly API Crawling ${updatedPayload.length} path(s)`);

      const crawledContent = await crawler(updatedPayload, { visited, signal });

      content.push(...crawledContent);
      continue;
    }

    // String Payloads (Markdown, HTML, .tsx source code)
    if (!isEmpty) {
      content.push({ ...res });
    }

    // Probe Traversal Paths on Facet Endpoints (e.g. /react -> /react/examples)
    if (!traversalPaths.some(traversalPath => res?.path?.endsWith(`/${traversalPath}`))) {
      const traversalUrls = traversalPaths.map(traversalPath => joinUrl(res.path, traversalPath));
      const traversalCrawledContent = await crawler(traversalUrls, { visited, signal });

      content.push(...traversalCrawledContent);
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
 * Initiate API crawl.
 *
 * @param options - Options for the API spider.
 * @returns A promise resolving to an array of processed API content entries.
 */
const apiSpider = async (options = getOptions()): Promise<ApiCrawler[]> => {
  log.info(`Collection PatternFly API spider crawl started`);

  const { timeoutMs } = options.patternflyOptions.api;
  let seedVersions: string[] = [];
  let content: ApiCrawler[] = [];

  try {
    seedVersions = await getVersions();
  } catch (err) {
    log.warn(`API spider: getVersions failed`, err);

    return [];
  }

  if (seedVersions.length) {
    const controller = new AbortController();

    try {
      content = await timeoutFunction(
        () => crawler(seedVersions, { visited: new Set<string>(), signal: controller.signal }),
        {
          timeout: timeoutMs,
          errorMessage: `Crawl timed out after ${timeoutMs}ms`
        }
      );
    } catch (err) {
      controller.abort();
      log.warn(`Collection PatternFly API spider: crawler failed`, err);

      return [];
    }
  }

  log.info(
    `Collection PatternFly API spider crawl completed. ${content.length} content ${
      (content.length === 1 && 'entry') || 'entries'
    } retrieved.`
  );

  return content;
};

/**
 * Light/Immediate process for content metadata from response paths.
 *
 * @param crawlerResponse - An entry with pre-metadata content.
 * @param [options] - Configuration options.
 * @returns The process metadata entry.
 */
const contentMetadata = (crawlerResponse: ApiCrawler, options = getOptions()): ApiContent => {
  const { content, resolvedPath } = crawlerResponse;
  const { base } = options.patternflyOptions.api;

  // Relative path after '/api/'
  const segments = resolvedPath.replace(base, '').split('/').filter(Boolean);
  const [version = 'unknown', section = 'components', rawItem = 'api-entry', rawFacet = 'doc', rawDetailType = '', rawDetail = '', ...remaining] = segments;

  const normalizedVersion = version.toLowerCase();
  const normalizedSection = normalizeSlug(section);
  const normalizedItem = normalizeSlug(rawItem);
  const normalizedFacet = normalizeSlug(rawFacet);
  const normalizedDetailType = normalizeSlug(rawDetailType);
  const normalizedDetail = normalizeSlug(rawDetail);

  // Make a category from the normalized facet
  const normalizedCategory = normalizedFacet;

  // Build hierarchical normalized path slug: e.g. "AI/overview/text" or "components/button/props"
  const isDetailSameName = normalizedDetail && normalizedDetail.includes(normalizedItem);
  const pathSlug = [
    normalizedSection,
    isDetailSameName ? undefined : normalizedItem,
    normalizedFacet,
    normalizedDetailType,
    normalizedDetail,
    ...remaining.map(normalizeSlug)
  ].filter(Boolean).join('-');

  const name = extractApiName(normalizedItem, normalizedSection);

  const id = `api::${normalizedVersion}::${normalizedSection}::${normalizedItem}::${normalizedCategory}${normalizedDetailType ? `::${normalizedDetailType}::${normalizedDetail}` : ''}`;

  const displayName = extractApiDisplayName(content, { slug: normalizedItem, kind: normalizedCategory, section: normalizedSection });
  const description = extractApiDescription(content, { displayName, kind: normalizedCategory, detailType: normalizedDetailType });

  const isLowQuality = calculateContentQualityScore(content, { kind: normalizedCategory }) < MIN_API_QUALITY_THRESHOLD;
  const isDeferred = DEFERRED_API_CATEGORIES.has(normalizedCategory);

  return {
    description,
    displayName,
    category: normalizedCategory,
    content,
    contentType: contentType(content),
    isLowQuality,
    id,
    isDeferred,
    name,
    path: resolvedPath,
    pathSlug,
    section: normalizedSection,
    source: 'api' as const,
    version: normalizedVersion
  };
};

/**
 * Async collect and process entries for a collection. Add "conditional" metadata.
 *
 * @returns {Promise<McpCollectionResult>} Object containing a list of processed records.
 */
const collectionCallback = async (): Promise<McpCollectionResult> => {
  const entries = await apiSpider();
  const recordsMap: Map<string, McpCollectionRecord> = new Map();

  for (const entry of entries) {
    const { name, isDeferred, isLowQuality, ...metadata } = contentMetadata(entry);

    if (isDeferred || isLowQuality) {
      continue;
    }

    if (recordsMap.has(metadata.id)) {
      continue;
    }

    const record = {
      id: metadata.id,
      sourceId: metadata.path,
      sourceType: 'api' as const,
      data: {
        [name]: [{
          ...metadata
        }]
      }
    };

    recordsMap.set(record.id, record);
  }

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
        ...options.patternflyOptions.api.schedule
      }
    }
  ];
};

export {
  patternFlyApiCollection,
  collectionCallback,
  apiSpider,
  crawler,
  getUniqueUrls,
  isEmptyPayload,
  parsePayload,
  type ApiContent,
  type ApiCrawler,
  type ParsePayload,
  type ParsePayloadApi
};

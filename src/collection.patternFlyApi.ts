import {
  type McpCollectionCallbackContext,
  type McpCollection,
  type McpCollectionRecord,
  type McpCollectionResult
} from './collections';
import { formatUnknownError, log } from './logger';
import { processDocsFunction } from './server.getResources';
import { memo } from './server.caching';
import { setFetch } from './server.fetch';
import { deferTask } from './server.task';
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
import { contentType as extractContentType } from './resource.helpers';

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
 * @property qualityScore - Content quality score.
 * @property section - Section of the content.
 * @property source - Source of the content.
 * @property version - Version of the content.
 */
interface ApiContent {
  description: string;
  displayName: string;
  category: string;
  contentType: string;
  isLowQuality: boolean;
  id: string;
  isDeferred: boolean;
  name: string;
  path: string;
  pathSlug: string;
  qualityScore?: number;
  section: string;
  source: string;
  version: string;
}

/**
 * Compressed PatternFly API embedded record.
 *
 * @property p - Relative path (after base URL)
 * @property n - Display Name
 * @property d - Description
 * @property c - Content Type ('markdown' | 'json' | 'html')
 * @property q - Quality Score (>= 0.95)
 */
interface ApiEmbedded {
  p: string;
  n: string;
  d: string;
  c: string;
  q: number;
}

/**
 * Expanded PatternFly API embedded record. See {@link ApiEmbedded}
 *
 * @property path - Full path, includes base URL
 * @property displayName - Display Name
 * @property description - Description
 * @property content - Empty content placeholder
 * @property contentType - Content Type ('markdown' | 'json' | 'html')
 * @property resolvedPath - Full path, includes base URL
 * @property qualityScore - Quality Score (>= 0.95)
 */
interface ApiEmbeddedExpanded {
  path: string;
  displayName: string;
  description: string;
  content: string;
  contentType: string;
  resolvedPath: string;
  qualityScore: number;
}

/**
 * Embedded (packaged with the MCP) API collection.
 *
 * @property version - Collection version associated with the underlying API.
 * @property generated - Contains the timestamp indicating when the collection was generated.
 * @property base - Represents the base URL or identifier for the collection.
 * @property items - An array of `ApiEmbeddedItem` objects that are part of the collection.
 */
interface ApiEmbeddedCollection {
  version: string;
  generated: string;
  base: string;
  records: ApiEmbedded[];
}

/**
 * API crawler response.
 *
 * @interface ApiCrawler
 *
 * @property content - Content retrieved from the API.
 * @property path - Initial or relative path used to fetch the content.
 * @property resolvedPath - Absolute or resolved path after processing the initial path.
 * @property qualityScore - Content quality score.
 */
interface ApiCrawler {
  content: string;
  path: string;
  resolvedPath: string;
  qualityScore: number;
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
 * @property qualityScore - Content quality score.
 */
interface ParsePayload {
  isEmpty: boolean;
  payload: ParsePayloadApi;
  qualityScore: number;
}

/**
 * Metadata for an entry discarded during collection processing.
 *
 * @interface ApiDiscardedRecord
 *
 * @property reason - Reason why the entry was discarded ('deferred' | 'low-quality').
 * @property qualityScore - Quality score of the discarded entry.
 */
interface ApiDiscardedRecord {
  reason: 'deferred' | 'low-quality';
  qualityScore: number;
}

/**
 * Processed API records result containing admitted records and discarded ledger.
 *
 * @interface ApiCollectionResult
 *
 * @property discarded - Map of discarded record IDs and their rejection reasons.
 */
interface ApiCollectionResult extends McpCollectionResult {
  discarded: Map<string, ApiDiscardedRecord>;
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
 * Majority confirmation, is the API live and healthy?
 *
 * @param options - Global options.
 * @returns `true` if 2 of 3 probes INCLUDING the last attempt confirms the API is live and healthy, otherwise `false`.
 */
const probeHealth = async (options = getOptions()): Promise<boolean> => {
  const { base } = options.patternflyOptions.api;
  const { get } = setFetch();
  let successCount = 0;
  let isLastSuccess = false;

  log.debug('Checking PatternFly API heartbeat.');

  const check = async () => {
    isLastSuccess = false;

    try {
      const response = await get(base, { method: 'HEAD' });

      if (response.status < 400) {
        successCount += 1;
        isLastSuccess = true;
      }
    } catch {
      isLastSuccess = false;
    }
  };

  const task = deferTask(check, {
    repeat: 3,
    intervalMs: 1500,
    continueOnError: true
  })();

  try {
    await task.start();
  } catch {
    // Handled by continueOnError
  }

  return successCount >= 2 && isLastSuccess;
};

/**
 * Expand and normalize embedded collections into expanded embedded content for
 * metadata processing.
 *
 * @param {ApiEmbeddedCollection} collection - Embedded collection to expand.
 * @returns {ApiEmbeddedExpanded[]} An array of expanded embedded content.
 */
const expandApiEmbeddedCollection = (collection: ApiEmbeddedCollection): ApiEmbeddedExpanded[] => {
  if (!Array.isArray(collection.records)) {
    return [];
  }

  const base = collection.base || '';

  return collection.records.map(record => {
    const updatedPath = base ? joinUrl(base, record.p) : record.p;

    return {
      path: updatedPath,
      displayName: record.n,
      description: record.d,
      resolvedPath: updatedPath,
      content: '',
      contentType: record.c,
      qualityScore: record.q
    };
  });
};

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
  let updatedPayload: string | Record<string, unknown> = '';

  if (typeof payload === 'string') {
    updatedPayload = payload.trim();
  } else if (isPlainObject(payload)) {
    updatedPayload = payload;
  }

  const qualityScore = calculateContentQualityScore(updatedPayload);
  let isEmpty: boolean;
  let parsedPayload: ParsePayloadApi;

  try {
    parsedPayload = typeof updatedPayload === 'string' ? JSON.parse(updatedPayload) : updatedPayload;

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

  return { isEmpty, payload: parsedPayload, qualityScore };
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

  const settled = await processDocsFunction(
    uniqueUrls, { loadLimit: 200, parallelLoadLimit: 15, parallelLoadThrottleMs: 75 }
  ) || [];

  const content: ApiCrawler[] = [];

  for (const res of settled) {
    if (!res.isSuccess) {
      continue;
    }

    const { isEmpty, payload, qualityScore } = parsePayload.memo(res.content);

    if (Array.isArray(payload)) {
      // Terminal Data Arrays (props, css, etc)
      if (componentPaths.some(componentPath => res?.path?.endsWith(`/${componentPath}`))) {
        if (!isEmpty) {
          content.push({ ...res, qualityScore });
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
      content.push({ ...res, qualityScore });
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
 * @param {ApiCrawler | ApiEmbeddedExpanded} record - An entry with either pre-metadata content or expanded embedded content.
 * @param [options] - Configuration options.
 * @returns The process metadata entry.
 */
const contentMetadata = (record: ApiCrawler | ApiEmbeddedExpanded, options = getOptions()): ApiContent => {
  const { content, resolvedPath, qualityScore } = record;
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
    ...remaining.map(remainder => normalizeSlug(remainder))
  ].filter(Boolean).join('-');

  const name = extractApiName(normalizedItem, normalizedSection);

  const id = `api::${normalizedVersion}::${normalizedSection}::${normalizedItem}::${normalizedCategory}${normalizedDetailType ? `::${normalizedDetailType}::${normalizedDetail}` : ''}`;

  const displayName = (record as ApiEmbeddedExpanded)?.displayName ||
    extractApiDisplayName(content, { slug: normalizedItem, category: normalizedCategory, section: normalizedSection, detail: rawDetail, detailType: normalizedDetailType });

  const description = (record as ApiEmbeddedExpanded)?.description ||
    extractApiDescription(content, { displayName, category: normalizedCategory, detailType: normalizedDetailType });

  const contentType = (record as ApiEmbeddedExpanded)?.contentType || extractContentType(content);

  const isLowQuality = qualityScore < MIN_API_QUALITY_THRESHOLD;
  const isDeferred = DEFERRED_API_CATEGORIES.has(normalizedCategory);

  return {
    description,
    displayName,
    category: normalizedCategory,
    contentType,
    isLowQuality,
    id,
    isDeferred,
    name,
    path: resolvedPath,
    pathSlug,
    qualityScore,
    section: normalizedSection,
    source: 'api' as const,
    version: normalizedVersion
  };
};

/**
 * Generate a structured collection of API records.
 *
 * @param {ApiCrawler[] | ApiEmbeddedExpanded[]} entries - Array of crawler or embedded records for processing.
 * @returns {ApiCollectionResult} A structured collection of API records and discarded entries ledger.
 */
const getPatternFlyApiRecords = (entries: ApiCrawler[] | ApiEmbeddedExpanded[]): ApiCollectionResult => {
  const recordsMap: Map<string, McpCollectionRecord> = new Map();
  const discarded: Map<string, ApiDiscardedRecord> = new Map();

  for (const entry of entries) {
    const { name, isDeferred, isLowQuality, ...metadata } = contentMetadata(entry);
    const { qualityScore } = entry;

    if (isDeferred) {
      discarded.set(metadata.id, { reason: 'deferred', qualityScore });
      continue;
    }

    if (isLowQuality) {
      discarded.set(metadata.id, { reason: 'low-quality', qualityScore });
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

  return { records: [...recordsMap.values()], discarded };
};

/**
 * Initial collection load. Load the embedded API catalog.
 *
 * @returns {Promise<McpCollectionResult>} The processed collection of API records.
 */
const collectionInitialCallback = async (): Promise<McpCollectionResult> => {
  let embeddedCollection: ApiEmbeddedExpanded[] = [];

  try {
    let loaded;

    if (process.env.NODE_ENV === 'local') {
      loaded = (await import('./collection.patternFlyApi.json', { with: { type: 'json' } })).default;
    } else {
      loaded = (await import('#apiCatalog', { with: { type: 'json' } })).default;
    }

    embeddedCollection = expandApiEmbeddedCollection(loaded);
  } catch (error) {
    log.warn(`Failed to load embedded API catalog '#apiCatalog': ${formatUnknownError(error)}`);
  }

  return getPatternFlyApiRecords(embeddedCollection);
};

/**
 * Async collect and process entries for a collection. Crawl the PatternFly API
 * catalog and heal missing entries against previous collection state.
 *
 * @param [context={}] - Execution context containing previous collection state.
 * @param [context.previous] - Previous collection result stored in the registry or passed by caller.
 * @param [options=getOptions()] - Global options.
 * @returns {Promise<ApiCollectionResult>} The processed collection of API records with discard ledger.
 */
const collectionCallback = async (
  { previous }: McpCollectionCallbackContext = {},
  options = getOptions()
): Promise<ApiCollectionResult> => {
  if (!options.patternflyOptions.api.crawlEnabled) {
    log.debug('PatternFly API crawler is disabled, using baseline records.');

    const baseline = previous?.records?.length
      ? previous.records
      : (await collectionInitialCallback()).records;

    return { records: baseline, discarded: new Map() };
  }

  const isHealthy = await probeHealth(options);

  if (!isHealthy) {
    log.debug('PatternFly API health probe failed, skipping background updates.');

    return { records: [], discarded: new Map() };
  }

  // 1. Resolve baseline: non-empty previous state -> fallback to seed catalog
  const baseline = previous?.records?.length
    ? previous.records
    : (await collectionInitialCallback()).records;

  // 2. Run a fresh crawler pass
  const entries = await apiSpider();
  const currentResult = getPatternFlyApiRecords(entries);
  const currentIds = new Set(currentResult.records.map(record => record.id));
  const updatedRecords = [...currentResult.records];

  // 3. Filter missing candidates: skip admitted records and crawler-discarded entries
  const missingCandidates: McpCollectionRecord[] = [];

  for (const record of baseline) {
    if (!currentIds.has(record.id) && !currentResult.discarded.has(record.id)) {
      missingCandidates.push(record);
    }
  }

  // 4. Probe missing candidate records directly (filters transient edge omissions vs. true 404s)
  if (missingCandidates.length > 0) {
    let viableCandidates = 0;

    log.debug(`Start PatternFly API collection review of ${missingCandidates.length} missing candidate(s).`);

    const probeUrls = missingCandidates.map(record => record.sourceId);
    const probeResults = await processDocsFunction(
      probeUrls,
      {
        loadLimit: probeUrls.length,
        parallelLoadLimit: 10,
        parallelLoadThrottleMs: 50
      }
    ) || [];

    const probeMap = new Map(probeResults.map(probe => [probe.path, probe]));

    for (const candidate of missingCandidates) {
      const probed = probeMap.get(candidate.sourceId);

      if (probed?.isSuccess && !isEmptyPayload.memo(probed.content)) {
        log.debug(`ADD PatternFly API collection missing candidate: ${candidate.id}. Candidate path ${candidate.sourceId}`);

        updatedRecords.push(candidate);
        viableCandidates += 1;
        continue;
      }

      log.debug(`DROP PatternFly API collection missing candidate (unreachable, empty, or lacks quality): ${candidate.id}. Candidate path ${candidate.sourceId}`);
    }

    log.debug(`Finish PatternFly API collection missing candidates review. ${viableCandidates} of ${missingCandidates.length} viable candidate(s) applied.`);
  }

  return { records: updatedRecords, discarded: currentResult.discarded };
};

/**
 * Create a PatternFly API collection.
 *
 * @param options - Global options
 * @param session - Session options
 * @returns {McpCollection} The collection definition tuple
 */
const patternFlyApiCollection = (options = getOptions(), session = getSessionOptions()): McpCollection => {
  const callback: McpCollection[2] = async context =>
    runWithSession(session, async () =>
      runWithOptions(options, async () => collectionCallback(context, options)));

  const initial = async () =>
    runWithSession(session, async () =>
      runWithOptions(options, async () => collectionInitialCallback()));

  return [
    'patternfly-api',
    {
      title: 'PatternFly API'
    },
    callback,
    {
      ...(options.patternflyOptions.api.crawlEnabled
        ? {
          initial,
          runParallel: '#collectionPatternFlyApi',
          runSchedule: {
            ...options.patternflyOptions.api.schedule
          }
        }
        : {
          isRequired: true
        }),
      retainLastViable: true
    }
  ];
};

export {
  MIN_API_QUALITY_THRESHOLD,
  patternFlyApiCollection,
  collectionCallback,
  collectionInitialCallback,
  apiSpider,
  contentMetadata,
  crawler,
  expandApiEmbeddedCollection,
  getPatternFlyApiRecords,
  getUniqueUrls,
  isEmptyPayload,
  parsePayload,
  probeHealth,
  type ApiCollectionResult,
  type ApiContent,
  type ApiCrawler,
  type ApiDiscardedRecord,
  type ApiEmbeddedCollection,
  type ApiEmbedded,
  type ApiEmbeddedExpanded,
  type ParsePayload,
  type ParsePayloadApi
};

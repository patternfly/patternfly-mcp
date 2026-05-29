import {
  fuzzySearch,
  type FuzzySearch,
  type FuzzySearchOptions,
  type FuzzySearchResult
} from './server.search';
import { memo } from './server.caching';
import { generateHash } from './server.helpers';
import { DEFAULT_OPTIONS } from './options.defaults';
import {
  getPatternFlyMcpResources,
  type PatternFlyMcpAvailableResources,
  type PatternFlyMcpDocsMeta,
  type PatternFlyMcpResourceMetadata
} from './patternFly.getResources';
import { type PatternFlyMcpDocsCatalogDoc } from './docs.embedded';

/**
 * A filtered MCP resource.
 *
 * @note Filtered resources lose their redundant version reference Map from `getPatternFlyMcpResources`
 * to simplify filtering. This data is STILL available inside the resource metadata, but is
 * potentially unnecessary since filtering already handles "version."
 */
type PatternFlyMcpResourceFilteredMetadata = Omit<PatternFlyMcpResourceMetadata, 'versions'>;

/**
 * Filters for specific properties of PatternFly data.
 *
 * @interface FilterPatternFlyFilters
 *
 * @property [version] - PatternFly version to filter search results. Defaults to undefined for all versions.
 * @property [category] - Category to filter search results. Defaults to undefined for all categories.
 * @property [section] - Section to filter search results. Defaults to undefined for all sections.
 * @property [name] - Name, or hash id, to filter search results. Defaults to undefined for all names and IDs.
 * @property [path] - Document path, or URI, to filter search results. Defaults to undefined for all paths and URIs.
 */
interface FilterPatternFlyFilters {
  version?: string | undefined;
  category?: string | undefined;
  section?: string | undefined;
  name?: string | undefined;
  path?: string | undefined;
}

/**
 * Result object returned by filterPatternFly.
 *
 * @interface FilterPatternFlyResults
 *
 * @property {PatternFlyMcpDocsCatalogDoc & PatternFlyMcpDocsMeta} byEntry - Array of filtered documentation entries.
 * @property {Map<string, PatternFlyMcpResourceFilteredMetadata>} byResource - Map of filtered resources by resource name.
 */
interface FilterPatternFlyResults {
  byEntry: (PatternFlyMcpDocsCatalogDoc & PatternFlyMcpDocsMeta)[];
  byResource: Map<string, PatternFlyMcpResourceFilteredMetadata>;
}

/**
 * Search result object returned by searchPatternFly. Includes additional metadata.
 *
 * @interface SearchPatternFlyResult
 *
 * @extends FuzzySearchResult
 * @extends PatternFlyMcpResourceFilteredMetadata
 *
 * @property query - Search query used to generate the result.
 */
interface SearchPatternFlyResult extends FuzzySearchResult, PatternFlyMcpResourceFilteredMetadata {
  query: string;
}

/**
 * Search results object returned by searchPatternFly.
 * Includes additional metadata and URLs.
 *
 * @interface SearchPatternFlyResults
 *
 * @property isSearchWildCardAll - Whether the search query matched all components
 * @property {SearchPatternFlyResult | undefined} firstExactMatch - `@deprecated Unreliable when the query is a hash, URI, or
 *     path (compares name to the query string). Prefer exactMatches[0] or searchResults`.
 * @property {SearchPatternFlyResult[]} exactMatches - Exact matches within search results
 * @property {SearchPatternFlyResult[]} remainingMatches - Contrast to `exactMatches`, the remaining matches within search results
 * @property {SearchPatternFlyResult[]} searchResults - All search results, exact and remaining matches
 * @property totalPotentialMatches - Total number of available PatternFly keywords to match on, what was possible before narrowing.
 * @property totalResults - Total number of actual resources that meet all criteria.
 */
interface SearchPatternFlyResults {
  isSearchWildCardAll: boolean;
  // @deprecated Use exactMatches[0] or searchResults
  firstExactMatch: SearchPatternFlyResult | undefined;
  exactMatches: SearchPatternFlyResult[];
  remainingMatches: SearchPatternFlyResult[];
  searchResults: SearchPatternFlyResult[];
  totalPotentialMatches: number;
  totalResults: number;
}

/**
 * Options for searchPatternFly.
 *
 * @interface SearchPatternFlyOptions
 *
 * @property {Promise<PatternFlyMcpAvailableResources>} [mcpResources] - Object of multifaceted documentation entries to search.
 * @property [allowWildCardAll] - Allow a search query to match all components.
 * @property [dynamicFilter] - Allow a search query to attempt a multi-filter match on returned search results for tighter results.
 * @property [maxDistance] - Maximum edit distance for fuzzy search.
 * @property [maxResults] - Maximum number of results to return.
 */
interface SearchPatternFlyOptions {
  mcpResources?: Promise<PatternFlyMcpAvailableResources>;
  allowWildCardAll?: boolean;
  dynamicFilter?: boolean;
  maxDistance?: number;
  maxResults?: number;
}

/**
 * Optional settings for {@link filterPatternFly}.
 *
 * @interface FilterPatternFlySettings
 *
 * @property [maxSyncTime] - Max synchronous time slice in milliseconds before yielding when `signal` is set. Defaults to `25`.
 * @property [signal] - Abort signal; breaks the resource loop when aborted.
 * @property [signalError] - Error to throw when aborted (avoids returning partial results on sibling passes).
 */
interface FilterPatternFlySettings {
  maxSyncTime?: number;
  signal?: AbortSignal;
  signalError?: Error | DOMException;
}

/**
 * Filter keys tried in parallel by {@link dynamicFilterPatternFly}. Order is priority
 * (e.g. `name` first for hash/entry id and URI narrowing). Do not randomize — truncation
 * and `Promise.any` both keep this sequence; reorder only with intentional product priority.
 */
const SEARCH_FILTERS: (keyof FilterPatternFlyFilters)[] = ['name', 'section', 'category', 'version', 'path'];

/**
 * Max parallel dynamic-filter passes (excluding the always-included base pass). Matches
 * {@link SEARCH_FILTERS} length; longer custom `searchFilters` arrays are truncated from the
 * front so priority order is preserved. Do not randomize the slice.
 */
const MAX_DYNAMIC_FILTER_PASSES = SEARCH_FILTERS.length;

/**
 * Filtering and manage PatternFly MCP resources.
 *
 * Allows handling resources as
 * - a `Promise` that resolves to `PatternFlyMcpAvailableResources`
 *    - Use the `Promise` when the resources are retrieved asynchronously and require processing upon resolution.
 * - a `Map` instance where the key is a string and the value is `PatternFlyMcpResourceFilteredMetadata`.
 *    - Use the `Map` when the resources are already available and stored in key-value pairs for quick access.
 *
 */
type FilterPatternFlyMcpResources = | Promise<PatternFlyMcpAvailableResources> |
  Map<string, PatternFlyMcpResourceFilteredMetadata>;

/**
 * Used for configuring the `filterPatternFly.memo`.
 *
 * @property {FilterPatternFlyFilters} 0 The filters to be applied, which specify the behavior or conditions for the memoized functionality.
 * @property {FilterPatternFlyMcpResources} [1] Optional MCP resources configuration to be utilized during memo execution.
 * @property {FilterPatternFlySettings} [2] Optional settings that influence runtime behavior or processing settings.
 */
type FilterPatternFlyMemoArgs = [
  filters: FilterPatternFlyFilters | undefined,
  mcpResources?: FilterPatternFlyMcpResources | undefined,
  settings?: FilterPatternFlySettings | undefined
];

/**
 * Apply sequenced priority filters for predictable filtering, filter PatternFly data.
 *
 * @note It is tempting to apply a default version to this function. Do not. Architecture
 * dictates that this function remains purely data-driven, apply default versions in the caller.
 * See both MCP resources and tools for examples.
 *
 * @note This is a predictable filter, not a search. Use searchPatternFly for fuzzy search.
 * - Has case-insensitive filtering for all fields
 * - Exact "version" filtering only
 * - Has `prefix`, `suffix` filtering for any non-"version" field.
 *
 * @note Memoization: {@link filterPatternFly.memo} caches by `filters` + `resources` map content. Used for MCP
 * resource handlers (full-catalog reads) and {@link searchPatternFly}'s non-dynamic scoped filter pass.
 * {@link dynamicFilterPatternFly}'s `Promise.any` race still calls bare {@link filterPatternFly}; see that
 * function's developer note before reintroducing memo there.
 *
 * @note Filter formats are generally assumed to be string values. If expanding to other types, ensure
 * proper handling of non-string values. Future updates should align with the string coercion used
 * in other code base searches.
 *
 * @performance At current catalog scale (~5–6ms cold), the filter loop stays synchronous.
 * When `signal` is set, optional time-slicing (`maxSyncTime` + `setImmediate` every 200 resources)
 * yields if execution exceeds the threshold — skipped when no signal is set.
 *
 * @param {FilterPatternFlyFilters} filters - Available filters for PatternFly data.
 * @param [mcpResources] - An optional map of available PatternFly documentation entries to search.
 *     Internally, defaults to `getPatternFlyMcpResources.resources`
 * @param [settings] - Optional {@link FilterPatternFlySettings}.
 * @param [settings.maxSyncTime] - Optional maximum synchronous time slice in milliseconds before yielding to event loop.
 * @param [settings.signal] - Optional abort signal; breaks the resource loop when aborted.
 * @param [settings.signalError] - Optional error to throw when aborted.
 * @returns {Promise<FilterPatternFlyResults>} - Filtered PatternFly results.
 * - `byEntry`: Array of filtered documentation entries.
 * - `byResource`: Map of filtered resources by resource name.
 */
const filterPatternFly = async (
  filters: FilterPatternFlyFilters | undefined,
  mcpResources?: FilterPatternFlyMcpResources,
  { maxSyncTime = 25, signal, signalError }: FilterPatternFlySettings = {}
): Promise<FilterPatternFlyResults> => {
  const getResources = await (mcpResources || getPatternFlyMcpResources.memo());
  const resources = (getResources as PatternFlyMcpAvailableResources)?.resources ||
    (getResources as Map<string, PatternFlyMcpResourceFilteredMetadata>);

  // Normalize filters - Currently, this is set to string filtering. Review expanding if/when necessary.
  let updatedFilters: FilterPatternFlyFilters = {};
  const startTime = (signal && performance.now()) || undefined;

  if (filters) {
    // Allow strings and coerced numbers as strings
    updatedFilters = Object.fromEntries(
      Object.entries(filters)
        .filter(([_key, value]) => (typeof value === 'string' || typeof value === 'number') && String(value).trim().length > 0)
        .map(([key, value]) => [key, String(value).trim().toLowerCase()])
    );
  }

  // Filter matching for resources and entries
  const byResource = new Map<string, PatternFlyMcpResourceFilteredMetadata>();
  const byEntry: (PatternFlyMcpDocsCatalogDoc & PatternFlyMcpDocsMeta)[] = [];
  const filterMatch = (propertyValue: unknown, filterValue: string) => {
    const normalizePropertyValue = String(propertyValue).trim().toLowerCase();

    return normalizePropertyValue === filterValue ||
      normalizePropertyValue.startsWith(filterValue) ||
      normalizePropertyValue.endsWith(filterValue);
  };

  const isBlocking = (i: number) =>
    signal && startTime && (i % 200 === 0) && (performance.now() - startTime > maxSyncTime);

  let index = 0;

  for (const [name, resource] of resources) {
    if (isBlocking(index)) {
      await new Promise(resolve => setImmediate(resolve));
    }

    index += 1;

    if (signal?.aborted) {
      if (signalError) {
        throw signalError;
      }

      break;
    }

    const matchedEntries = resource.entries.filter(entry => {
      // Throw on abort so sibling passes reject instead of returning partial entry batches.
      if (signal?.aborted) {
        if (signalError) {
          throw signalError;
        }

        return false;
      }

      const matchesVersion = !updatedFilters.version || String(entry.version).toLowerCase() === updatedFilters.version;
      const matchesCategory = !updatedFilters.category || filterMatch(entry.category, updatedFilters.category);
      const matchesSection = !updatedFilters.section || filterMatch(entry.section, updatedFilters.section);
      const matchesPath = !updatedFilters.path || filterMatch(entry.path, updatedFilters.path) ||
        filterMatch(entry.uriId, updatedFilters.path) || filterMatch(entry.uriSchemas, updatedFilters.path) ||
        filterMatch(entry.uriSchemasId, updatedFilters.path) || filterMatch(entry.uri, updatedFilters.path);

      // Filter order matters specific id -> group id -> group name
      const matchesName = !updatedFilters.name || filterMatch(entry.id, updatedFilters.name) ||
        filterMatch(entry.groupId, updatedFilters.name) || filterMatch(entry.name, updatedFilters.name);

      // Any missing filter registers as true. Only filters that are active run their check.
      return matchesVersion && matchesCategory && matchesSection && matchesPath && matchesName;
    });

    if (signal?.aborted) {
      if (signalError) {
        throw signalError;
      }

      break;
    }

    if (matchedEntries.length > 0) {
      byEntry.push(...matchedEntries);
      const { versions, ...filteredResource } = resource;
      let versionContextualProperties = {};

      // Apply version contextual properties, typically group/resource related URIs.
      if (updatedFilters.version && versions?.[updatedFilters.version]) {
        // General props version dependent
        versionContextualProperties = {
          isSchemasAvailable: versions[updatedFilters.version]?.isSchemasAvailable,
          uri: versions[updatedFilters.version]?.uri,
          uriSchemas: versions[updatedFilters.version]?.uriSchemas,
          uriSchemasId: versions[updatedFilters.version]?.uriSchemasId
        };
      }

      byResource.set(name, {
        ...filteredResource,
        ...versionContextualProperties,
        entries: matchedEntries
      });
    }
  }

  return {
    byEntry,
    byResource
  };
};

/**
 * Memoized version of filterPatternFly for MCP resource handlers.
 *
 * @note Use {@link filterPatternFly.memo} for full-catalog MCP resource reads (index/template handlers) and
 * {@link searchPatternFly}'s non-dynamic scoped filter pass. Do **not** use it inside
 * {@link dynamicFilterPatternFly}'s `Promise.any` race or its fallback — see that function's developer note for
 * why and how to reintroduce memo there safely.
 *
 * @note Cache key hashes `filters` and `resources` only. `signal`, `signalError`, and `maxSyncTime` are
 * forwarded on cache miss but excluded from the key. `cacheErrors: false` — rejected/aborted passes are not cached.
 */
filterPatternFly.memo = memo(filterPatternFly, {
  ...DEFAULT_OPTIONS.resourceMemoOptions.default,
  cacheErrors: false,
  keyHash: (args: Readonly<FilterPatternFlyMemoArgs>) => {
    const [filters, resources] = args;

    return generateHash([filters, resources]);
  }
});

/**
 * Filter down the tightest possible results. The first pass that matches `maxResultsLimit`
 * wins. If no matches, return the base filter.
 *
 * @note Parallel pass count is at most {@link MAX_DYNAMIC_FILTER_PASSES} filter passes plus one base
 * pass; longer `searchFilters` lists are truncated from the front. Keep {@link SEARCH_FILTERS}
 * aligned with product priority — do not randomize pass order or truncation.
 *
 * @note **Memo split (read before changing this race).** This function is memoized externally
 * via {@link dynamicFilterPatternFly.memo} (with `cacheErrors: false`), but its internal calls
 * to {@link filterPatternFly} must remain bare primarily for performance but also to avoid dealing with
 * cache poison and partial results or collisions across races. If you decide to ignore this warning and
 * re-implement the memo internally, inside `promise.any`, you'll need to pass
 * `_passId keyHash + cacheErrors: false + signalError`.
 *
 * @note **Do not drop `filterPatternFly.memo` into `Promise.any` or the fallback without the guards
 * below.** Parallel passes share filters/maps but differ by abort timing; memoizing naively caches partial
 * results from losing passes or collides entries across races. Fixing that cost more than memo saved.
 *
 * @note **If you need memo back in this race, reproduce all of the following (prior working design):**
 * - Give each `Promise.any` race one shared settings object (`signal`, `signalError`, and a module-private
 *   `_passId` from `randomUUID()`) so memo keys from that race do not collide with MCP {@link filterPatternFly.memo}
 *   calls or other concurrent races.
 * - Extend settings with internal `_passId?: string` (not public API) and hash it in {@link filterPatternFly.memo}'s
 *   `keyHash` alongside `filters` and `resources`: `generateHash([filters, resources, settings._passId])`.
 * - Keep `cacheErrors: false` on {@link filterPatternFly.memo} so rejected/aborted passes are never cached.
 * - Keep `signalError` on {@link filterPatternFly} so aborted siblings **throw** instead of returning partial
 *   `byEntry` batches (otherwise memo stores poisoned slices).
 * - Still call bare {@link filterPatternFly} on the catch fallback unless you also scope that path's cache key
 *   (fallback runs without `signal` after `finally` aborts the shared controller).
 *
 * @note Parallel passes today share one settings object per race (`signal`, `signalError`) so aborted siblings
 * throw via `signalError` even without memo.
 *
 * @param searchQuery - Search query.
 * @param filters - Available filters for PatternFly data.
 * @param mcpResources - Scoped resources for PatternFly data.
 * @param [options] - Optional settings object
 * @param [options.searchFilters] - Array of filters to search typically from {@link filterPatternFly}. Defaults to {@link SEARCH_FILTERS}.
 * @param [options.maxFilterPasses] - Max number of parallel filter passes. Defaults to {@link MAX_DYNAMIC_FILTER_PASSES}.
 * @param [options.maxResultsLimit] - Max number of results internal conditions need to match before they return the original result. Defaults to `1`.
 * @param [options.useExistingFilters] - Use the existing filters or bypass them. Defaults to `true`.
 * @returns {Promise<FilterPatternFlyResults>} - A Promise resolving to the filtering results.
 */
const dynamicFilterPatternFly = async (
  searchQuery: string,
  filters: FilterPatternFlyFilters | undefined,
  mcpResources?: Promise<PatternFlyMcpAvailableResources> | Map<string, PatternFlyMcpResourceFilteredMetadata>,
  {
    searchFilters = SEARCH_FILTERS,
    maxFilterPasses = MAX_DYNAMIC_FILTER_PASSES,
    maxResultsLimit = 1,
    useExistingFilters = true
  }: { searchFilters?: (keyof FilterPatternFlyFilters)[]; maxFilterPasses?: number; maxResultsLimit?: number; useExistingFilters?: boolean } = {}
): Promise<FilterPatternFlyResults> => {
  // Error name
  const dynamicFilterPassNotMatched = 'DynamicFilterPassNotMatchedError';

  // Centralized error
  const createDynamicFilterPassNotMatchedError = () => {
    const error = new Error('Dynamic filter pass did not match maxResultsLimit');

    error.name = dynamicFilterPassNotMatched;

    return error;
  };

  // Matching conditions based on options
  const isCloseMatch = (output: FilterPatternFlyResults) =>
    output.byEntry.length === maxResultsLimit;

  const abortController = new AbortController();
  const { signal } = abortController;

  // Run match and handle abort
  const passFail = (promise: Promise<FilterPatternFlyResults>) =>
    promise.then(output => {
      if (signal.aborted || !isCloseMatch(output)) {
        return Promise.reject(createDynamicFilterPassNotMatchedError());
      }

      abortController.abort();

      return output;
    }).catch((err: unknown) => {
      if (signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
        return Promise.reject(createDynamicFilterPassNotMatchedError());
      }

      throw err;
    });

  // Limit the filters to ones not already set; cap parallel passes to avoid runaway fan-out.
  const filtersToTry = searchFilters
    .filter(filter => !(useExistingFilters && filters && filters[filter]))
    .slice(0, maxFilterPasses);

  const settings = {
    signal,
    signalError: new DOMException('Filter operation aborted', 'AbortError')
  };

  try {
    // Inner passes should remain non-memoized for performance see @note above
    return await Promise.any([
      ...filtersToTry.map(filter =>
        passFail(filterPatternFly({ ...filters, [filter]: searchQuery }, mcpResources, settings))),
      passFail(filterPatternFly(filters, mcpResources, settings))
    ]);
  } catch {
    // Base pass is in the race; if all reject, rescan without signal (finally aborts shared controller).
    return filterPatternFly(filters, mcpResources);
  } finally {
    abortController.abort();
  }
};

/**
 * Memoized version of dynamicFilterPatternFly
 *
 * @note `cacheErrors: false` so a rejected fallback doesn't stick. This aligns with
 * {@link filterPatternFly.memo}. Parallel pass poison is avoided by calling bare
 * {@link filterPatternFly} inside the race, not by this outer memo setting alone.
 */
dynamicFilterPatternFly.memo = memo(dynamicFilterPatternFly, {
  ...DEFAULT_OPTIONS.resourceMemoOptions.default,
  cacheErrors: false
});

/**
 * Search for PatternFly component documentation URLs using fuzzy search.
 *
 * @note It is tempting to apply a default version to this function. Do not. Architecture
 * dictates that this function remains purely data-driven, apply default versions in the caller.
 * See both MCP resources and tools for examples.
 *
 * @note Non-dynamic filtering uses {@link filterPatternFly.memo} on the scoped `searchResultsFilterMap`
 * (cache key = filters + map content). Dynamic filtering uses {@link dynamicFilterPatternFly.memo} instead.
 *
 * @param searchQuery - Search query. Values are coerced to string for fuzzy search.
 * @param {FilterPatternFlyFilters} filters - Available filters for PatternFly data.
 * @param [settings] - Optional settings object
 * @param [settings.mcpResources] - Optional function object of multifaceted documentation entries to search.
 *    Applied as a dependency to help with testing. Defaults to `getPatternFlyMcpResources`
 *     - `keywordsIndex`: Index of normalized keywords for fuzzy search
 *     - `keywordsMap`: Map of normalized keywords against versioned entries
 *     - `resources`: Map of names against entries
 * @param [settings.allowWildCardAll] - Allow a search query to match all resources. Defaults to `false`.
 * @param [settings.dynamicFilter] - Allow a search query to attempt a multi-filter match on returned search results. Defaults to `false`.
 *   Useful for narrowing down search results to a specific resource.
 * @param [settings.maxDistance] - Maximum edit distance for fuzzy search. Defaults to `3`.
 * @param [settings.maxResults] - Maximum number of results to return. Defaults to `10`.
 * @returns Object containing search results and matched URLs
 *   - `isSearchWildCardAll`: Whether the search query matched all resources
 *   - `firstExactMatch`: `@deprecated` See {@link SearchPatternFlyResults#exactMatches} Exact-ranked result
 *   - `exactMatches`: Exact matches within search results
 *   - `remainingMatches`: Contrast to `exactMatches`, the remaining matches within search results
 *   - `searchResults`: All search results, exact and remaining matches
 *   - `totalPotentialMatches`: Total number of available PatternFly keywords to match on, what was possible before narrowing.
 *   - `totalResults`: Total number of actual resources that meet all criteria.
 */
const searchPatternFly = async (searchQuery: unknown, filters?: FilterPatternFlyFilters | undefined, {
  mcpResources,
  allowWildCardAll = false,
  dynamicFilter = false,
  maxDistance = 3,
  maxResults = 10
}: SearchPatternFlyOptions = {}): Promise<SearchPatternFlyResults> => {
  const coercedSearchQuery = String(searchQuery).trim();
  const updatedResources = await (mcpResources || getPatternFlyMcpResources.memo());
  const updatedFilters = filters || {};
  const isWildCardAll = coercedSearchQuery === '*' || coercedSearchQuery.toLowerCase() === 'all' || coercedSearchQuery === '';
  const isSearchWildCardAll = allowWildCardAll && isWildCardAll;
  const pathMatchName = updatedResources.pathIndex?.get(coercedSearchQuery.toLowerCase());
  const uriMatchName = updatedResources.uriIndex?.get(coercedSearchQuery.toLowerCase());
  const hashMatchName = updatedResources.hashIndex?.get(coercedSearchQuery.toLowerCase());
  let search: FuzzySearch | undefined;
  let searchResults: FuzzySearchResult[] = [];

  // Perform wildcard all search or fuzzy search
  if (isSearchWildCardAll) {
    searchResults = updatedResources.keywordsIndex.map(name => ({ matchType: 'all', distance: 0, item: name } as FuzzySearchResult));
  } else if (pathMatchName || uriMatchName || hashMatchName) {
    searchResults = [
      {
        matchType: 'exact',
        distance: 0,
        item: pathMatchName || uriMatchName || hashMatchName
      } as FuzzySearchResult
    ];
  } else {
    const fuzzySearchSettings: FuzzySearchOptions = {
      maxDistance,
      maxResults,
      isFuzzyMatch: true,
      deduplicateByNormalized: true
    };

    // Pass the original searchQuery, fuzzySearch has its own normalization.
    search = fuzzySearch(searchQuery, updatedResources.keywordsIndex, fuzzySearchSettings);
    searchResults = search.results;
  }

  // Store refined results in a map for easy "did we already find this?" checks
  const searchResultsMap = new Map<string, SearchPatternFlyResult>();
  const searchResultsFilterMap = new Map<string, PatternFlyMcpResourceFilteredMetadata>();
  const fuzzyResultsMap = new Map<string, FuzzySearchResult>();

  // Refine search results with versioning for filtering and remapping
  for (const result of searchResults) {
    const versionMap = updatedResources.keywordsMap.get(result.item);

    if (versionMap) {
      const versionResults = updatedFilters.version
        ? versionMap.get(updatedFilters.version)
        : Array.from(versionMap.values()).flat();

      if (versionResults) {
        for (const name of versionResults) {
          const namedResource = updatedResources.resources.get(name);

          if (!namedResource || searchResultsMap.has(name)) {
            continue;
          }

          if (!fuzzyResultsMap.has(name)) {
            // Set results for filtering.
            searchResultsFilterMap.set(name, namedResource);

            // Set fuzzy results so we can map back the searchResultsFilterMap filtered output.
            fuzzyResultsMap.set(name, result);
          }
        }
      }
    }
  }

  let filtered: FilterPatternFlyResults;

  // Filter resources. Dynamic filtering applies the search query to each filter as a fallback.
  if (dynamicFilter && !isSearchWildCardAll) {
    filtered = await dynamicFilterPatternFly.memo(coercedSearchQuery, updatedFilters, searchResultsFilterMap);
  } else {
    filtered = await filterPatternFly.memo(updatedFilters, searchResultsFilterMap);
  }

  const { byResource } = filtered;

  // Loop fuzzy results, apply and update search results with resources.
  for (const [name, fuzzyMatch] of fuzzyResultsMap) {
    const filteredData = byResource.get(name);

    if (!filteredData) {
      continue;
    }

    searchResultsMap.set(name, {
      ...fuzzyMatch,
      ...filteredData,
      query: coercedSearchQuery
    } as SearchPatternFlyResult);
  }

  // Minor breakdown of search results
  const exactMatches = Array.from(searchResultsMap.values()).filter(result => result.matchType === 'exact' || result.matchType === 'all');
  const remainingMatches = Array.from(searchResultsMap.values()).filter(result => result.matchType !== 'exact' && result.matchType !== 'all');

  // Sort by distance then name
  const sortByDistanceByName = (a: SearchPatternFlyResult, b: SearchPatternFlyResult) => {
    if (a.distance !== b.distance) {
      return a.distance - b.distance;
    }

    return a.name.localeCompare(b.name);
  };

  const sortedExactMatches = exactMatches.sort(sortByDistanceByName);
  const sortedRemainingMatches = remainingMatches.sort(sortByDistanceByName);
  const sortedSearchResults = Array.from(searchResultsMap.values()).sort(sortByDistanceByName);

  return {
    isSearchWildCardAll,
    // @deprecated firstExactMatch - Use exactMatches[0] or searchResults
    firstExactMatch: sortedExactMatches[0],
    exactMatches: sortedExactMatches.slice(0, maxResults),
    remainingMatches: (maxResults - exactMatches.length) < 0 ? [] : sortedRemainingMatches.slice(0, maxResults - exactMatches.length),
    searchResults: sortedSearchResults.slice(0, maxResults),
    totalResults: sortedSearchResults.length,
    totalPotentialMatches: search?.totalResults ?? updatedResources.keywordsIndex.length
  };
};

/**
 * Memoized version of searchPatternFly.
 */
searchPatternFly.memo = memo(searchPatternFly, DEFAULT_OPTIONS.toolMemoOptions.searchPatternFlyDocs);

export {
  dynamicFilterPatternFly,
  filterPatternFly,
  searchPatternFly,
  type FilterPatternFlyFilters,
  type FilterPatternFlyResults,
  type FilterPatternFlySettings,
  type SearchPatternFlyResult,
  type SearchPatternFlyResults
};

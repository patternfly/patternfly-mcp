import { fuzzySearch, type FuzzySearch, type FuzzySearchResult } from './server.search';
import { memo } from './server.caching';
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
 * @property [name] - Name to filter search results. Defaults to undefined for all names.
 */
interface FilterPatternFlyFilters {
  version?: string | undefined;
  category?: string | undefined;
  section?: string | undefined;
  name?: string | undefined;
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
 * @property {SearchPatternFlyResult | undefined} firstExactMatch - First exact match within search results
 * @property {SearchPatternFlyResult[]} exactMatches - Exact matches within search results
 * @property {SearchPatternFlyResult[]} remainingMatches - Contrast to `exactMatches`, the remaining matches within search results
 * @property {SearchPatternFlyResult[]} searchResults - All search results, exact and remaining matches
 * @property totalPotentialMatches - Total number of available PatternFly keywords to match on, what was possible before narrowing.
 * @property totalResults - Total number of actual resources that meet all criteria.
 */
interface SearchPatternFlyResults {
  isSearchWildCardAll: boolean;
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
 * @property [maxDistance] - Maximum edit distance for fuzzy search.
 * @property [maxResults] - Maximum number of results to return.lts.
 */
interface SearchPatternFlyOptions {
  mcpResources?: Promise<PatternFlyMcpAvailableResources>;
  allowWildCardAll?: boolean;
  maxDistance?: number;
  maxResults?: number;
}

/**
 * Apply sequenced priority filters for predictable filtering, filter PatternFly data.
 *
 * @note This is a predictable filter, not a search. Use searchPatternFly for fuzzy search.`
 * - Has case-insensitive filtering for all fields
 * - Exact "version" filtering only
 * - Has `prefix`, `suffix` filtering for any non-"version" field.
 *
 * @note Filter formats are generally assumed to be string values. If expanding to other types, ensure
 * proper handling of non-string values.
 *
 * @param {FilterPatternFlyFilters} filters - Available filters for PatternFly data.
 * @param [mcpResources] - An optional map of available PatternFly documentation entries to search.
 *     Internally, defaults to `getPatternFlyMcpResources.resources`
 * @returns {Promise<FilterPatternFlyResults>} - Filtered PatternFly results.
 * - `byEntry`: Array of filtered documentation entries.
 * - `byResource`: Map of filtered resources by resource name.
 */
const filterPatternFly = async (
  filters: FilterPatternFlyFilters | undefined,
  mcpResources?: Promise<PatternFlyMcpAvailableResources> | Map<string, PatternFlyMcpResourceFilteredMetadata>
): Promise<FilterPatternFlyResults> => {
  const getResources = await (mcpResources || getPatternFlyMcpResources.memo());
  const resources = (getResources as PatternFlyMcpAvailableResources)?.resources ||
    (getResources as Map<string, PatternFlyMcpResourceFilteredMetadata>);

  // Normalize filters - Currently, this is set to string filtering. Review expanding if/when necessary.
  let updatedFilters: FilterPatternFlyFilters = {};

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
  const filterMatch = (propertyValue: string | number | undefined, filterValue: string) => {
    if (typeof propertyValue !== 'string' && typeof propertyValue !== 'number') {
      return false;
    }

    // Coerce potential numbers to strings
    const normalizePropertyValue = String(propertyValue).trim().toLowerCase();

    return normalizePropertyValue === filterValue ||
      normalizePropertyValue.startsWith(filterValue) ||
      normalizePropertyValue.endsWith(filterValue);
  };

  for (const [name, resource] of resources) {
    const matchedEntries = resource.entries.filter(entry => {
      const matchesVersion = !updatedFilters.version || entry.version.toLowerCase() === updatedFilters.version;
      const matchesCategory = !updatedFilters.category || filterMatch(entry.category, updatedFilters.category);
      const matchesSection = !updatedFilters.section || filterMatch(entry.section, updatedFilters.section);
      const matchesName = !updatedFilters.name || filterMatch(entry.name, updatedFilters.name);

      // Any missing filter registers as true. Only filters that are active run their check.
      return matchesVersion && matchesCategory && matchesSection && matchesName;
    });

    if (matchedEntries.length > 0) {
      byEntry.push(...matchedEntries);
      const { versions, ...filteredResource } = resource;
      let versionContextualProperties = {};

      // Apply version contextual properties, typically URIs
      if (updatedFilters.version && versions?.[updatedFilters.version]) {
        versionContextualProperties = {
          isSchemasAvailable: versions[updatedFilters.version]?.isSchemasAvailable,
          uri: versions[updatedFilters.version]?.uri,
          uriSchemas: versions[updatedFilters.version]?.uriSchemas
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
 * Memoized version of filterPatternFly
 */
filterPatternFly.memo = memo(filterPatternFly, DEFAULT_OPTIONS.resourceMemoOptions.default);

/**
 * Search for PatternFly component documentation URLs using fuzzy search.
 *
 * @note Uses `filterPatternFly` for additional filtering. Future updates should
 * consider moving the await outside the loop to improve performance, possibly a
 * second iteration.
 *
 * @param searchQuery - Search query string
 * @param {FilterPatternFlyFilters} filters - Available filters for PatternFly data.
 * @param [settings] - Optional settings object
 * @param [settings.mcpResources] - Optional function object of multifaceted documentation entries to search.
 *    Applied as a dependency to help with testing. Defaults to `getPatternFlyMcpResources`
 *     - `keywordsIndex`: Index of normalized keywords for fuzzy search
 *     - `keywordsMap`: Map of normalized keywords against versioned entries
 *     - `resources`: Map of names against entries
 * @param [settings.allowWildCardAll] - Allow a search query to match all resources. Defaults to `false`.
 * @param [settings.maxDistance] - Maximum edit distance for fuzzy search. Defaults to `3`.
 * @param [settings.maxResults] - Maximum number of results to return. Defaults to `10`.
 * @returns Object containing search results and matched URLs
 *   - `isSearchWildCardAll`: Whether the search query matched all resources
 *   - `firstExactMatch`: First exact match within search results
 *   - `exactMatches`: Exact matches within search results
 *   - `remainingMatches`: Contrast to `exactMatches`, the remaining matches within search results
 *   - `searchResults`: All search results, exact and remaining matches
 *   - `totalPotentialMatches`: Total number of available PatternFly keywords to match on, what was possible before narrowing.
 *   - `totalResults`: Total number of actual resources that meet all criteria.
 */
const searchPatternFly = async (searchQuery: string | number, filters?: FilterPatternFlyFilters | undefined, {
  mcpResources,
  allowWildCardAll = false,
  maxDistance = 3,
  maxResults = 10
}: SearchPatternFlyOptions = {}): Promise<SearchPatternFlyResults> => {
  const coercedSearchQuery = String(searchQuery).trim();
  const updatedResources = await (mcpResources || getPatternFlyMcpResources.memo());
  const updatedFilters = filters || {};
  const isWildCardAll = coercedSearchQuery === '*' || coercedSearchQuery.toLowerCase() === 'all' || coercedSearchQuery === '';
  const isSearchWildCardAll = allowWildCardAll && isWildCardAll;
  let search: FuzzySearch | undefined;
  let searchResults: FuzzySearchResult[] = [];

  // Perform wildcard all search or fuzzy search
  if (isSearchWildCardAll) {
    searchResults = updatedResources.keywordsIndex.map(name => ({ matchType: 'all', distance: 0, item: name } as FuzzySearchResult));
  } else {
    // Pass the original searchQuery, fuzzySearch has its own normalization.
    search = fuzzySearch(searchQuery, updatedResources.keywordsIndex, {
      maxDistance,
      maxResults,
      isFuzzyMatch: true,
      deduplicateByNormalized: true
    });

    searchResults = search.results;
  }

  // Store refined results in a map for easy "did we already find this?" checks"
  const searchResultsMap = new Map<string, SearchPatternFlyResult>();

  // Refine search results with version filtering and mapping
  for (const result of searchResults) {
    const versionMap = updatedResources.keywordsMap.get(result.item);

    if (versionMap) {
      const versionResults = updatedFilters.version ? versionMap.get(updatedFilters.version) : Array.from(versionMap.values()).flat();

      if (versionResults) {
        for (const name of versionResults) {
          const namedResource = updatedResources.resources.get(name);

          if (!namedResource || searchResultsMap.has(name)) {
            continue;
          }

          // Omit versions from the result
          const { versions, ...filteredResource } = namedResource;

          // Apply contextual filtering and flattening
          const { byResource } = await filterPatternFly(updatedFilters, new Map([[name, { ...filteredResource }]]));

          if (!byResource.has(name)) {
            continue;
          }

          let versionContextualProperties;

          // Apply version contextual properties, typically URIs
          if (updatedFilters.version && versions[updatedFilters.version]) {
            versionContextualProperties = {
              isSchemasAvailable: versions[updatedFilters.version]?.isSchemasAvailable,
              uri: versions[updatedFilters.version]?.uri,
              uriSchemas: versions[updatedFilters.version]?.uriSchemas
            };
          }

          // Apply property filters
          searchResultsMap.set(name, {
            ...result,
            ...byResource.get(name),
            ...versionContextualProperties,
            query: coercedSearchQuery
          } as SearchPatternFlyResult);
        }
      }
    }
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
  filterPatternFly,
  searchPatternFly,
  type FilterPatternFlyFilters,
  type FilterPatternFlyResults,
  type SearchPatternFlyResult,
  type SearchPatternFlyResults
};

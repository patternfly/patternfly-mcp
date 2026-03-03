import { distance, closest } from 'fastest-levenshtein';
import { memo } from './server.caching';

/**
 * Options for closest search
 *
 * @interface ClosestSearchOptions
 *
 * @property missingReturnValue - The value to return when no match is found.
 * @property normalizeFn - Function to normalize strings for comparison.
 */
interface ClosestSearchOptions {
  missingReturnValue?: unknown;
  normalizeFn?: (str: unknown) => string;
}

/**
 * Fuzzy search result match types.
 */
type FuzzySearchResultMatchType = 'exact' | 'prefix' | 'suffix' | 'contains' | 'partial' | 'fuzzy' | 'all';

/**
 * Fuzzy search result using fastest-levenshtein
 *
 * @property item - The matched string item from the search.
 * @property distance - The numerical representation of similarity between the search query and the item.
 * @property {FuzzySearchResultMatchType} matchType - The categorization of the match, indicating the nature of the similarity.
 */
type FuzzySearchResult = {
  item: string;
  distance: number;
  matchType: FuzzySearchResultMatchType;
};

/**
 * Fuzzy search result using fastest-levenshtein
 *
 * @interface FuzzySearchResult
 *
 * @property {FuzzySearchResult[]} results - Array of search results
 * @property totalResults - Total number of results actually found.
 * @property totalResultsReturned - Total number of results returned based on settings.
 */
interface FuzzySearch {
  results: FuzzySearchResult[],
  totalResults: number;
  totalResultsReturned: number;
}

/**
 * Options for fuzzy search
 *
 * @interface FuzzySearchOptions
 *
 * @param allowEmptyQuery - Allow empty queries to match items with length <= maxDistance (default: `false`)
 * @param maxDistance - Maximum edit distance for a match. Distance is defined as
 *   - exact = 0
 *   - prefix = 1
 *   - suffix = 1
 *   - contains = 2
 *   - partial = 2
 *   - fuzzy = Levenshtein edit distance
 * @param maxResults - Maximum number of results to return
 * @param normalizeFn - Function to normalize strings. Should always return a string (default: `normalizeString`)
 * @param isExactMatch - Include exact matches in results (default: `true`)
 * @param isPrefixMatch - Include prefix matches in results (default: `true`)
 * @param isSuffixMatch - Include suffix matches in results (default: `true`)
 * @param isContainsMatch - Include contains matches in results (default: `true`)
 * @param isPartialMatch - Include partial matches in results (default: `true`)
 * @param isFuzzyMatch - Allow fuzzy matches even when `maxDistance` is negative or zero.
 * @param deduplicateByNormalized - If `true`, deduplicate results by normalized value instead of original value.
 */
interface FuzzySearchOptions {
  allowEmptyQuery?: boolean;
  maxDistance?: number;
  maxResults?: number;
  normalizeFn?: (str: unknown) => string;
  isExactMatch?: boolean;
  isPrefixMatch?: boolean;
  isSuffixMatch?: boolean;
  isContainsMatch?: boolean;
  isPartialMatch?: boolean;
  isFuzzyMatch?: boolean;
  deduplicateByNormalized?: boolean;
}

/**
 * Internal lightweight normalization: coerce any value to string, trim, lowercase,
 * remove diacritics (a sign/accent character), squash separators.
 *
 * - Functions `findClosest` and `fuzzySearch` use this internally.
 * - Can be overridden in the `findClosest` and `fuzzySearch` related options for custom normalization.
 * - Function has a `memo` property to allow use as a memoized function.
 *
 * @param str - Any value to normalize.
 * @returns Normalized string
 */
const normalizeString = (str: unknown) => String(str)
  .trim()
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[\s_-]+/g, ' ')
  .replace(/\s+/g, ' ');

/**
 * Memoized version of normalizeString
 */
normalizeString.memo = memo(normalizeString, { cacheLimit: 50 });

/**
 * Find the closest match using fastest-levenshtein's closest function.
 *
 * - Returns the **first** original item whose normalized value equals the best normalized candidate.
 * - If multiple items normalize to the same value, only the first occurrence in the array is returned.
 * - For multiple matches, use `fuzzySearch` instead.
 * - Null/undefined items are coerced to strings to make them searchable.
 *
 * @param query - Search query value
 * @param items - Array of strings and/or numbers to search
 * @param {ClosestSearchOptions} options - Search configuration options
 * @returns Closest matching item from items.
 *
 * @example
 * ```typescript
 * const result = findClosest('button', ['Button', 'ButtonGroup', 'Badge']);
 * // Returns: 'Button' (the closest match)
 * ```
 */
const findClosest = (
  query: unknown,
  items: unknown[] = [],
  {
    missingReturnValue = null,
    normalizeFn = normalizeString.memo
  }: ClosestSearchOptions = {}
) => {
  const normalizedQuery = normalizeFn(query);

  if (normalizedQuery === '' || !Array.isArray(items) || items.length === 0) {
    return missingReturnValue;
  }

  const normalizedItems = items.map(item => normalizeFn(item));
  const closestMatch = closest(normalizedQuery, normalizedItems);

  return items[normalizedItems.indexOf(closestMatch)];
};

/**
 * Fuzzy search using fastest-levenshtein
 *
 * - Exact/prefix/suffix/contains are evaluated first with constant distances (0/1/1/2).
 * - Fuzzy distance is computed only when earlier classifications fail and only when the
 *   string length delta is within `maxDistance` (cheap lower-bound check).
 * - Global filter: result included only if its type is enabled AND distance <= maxDistance.
 * - Negative `maxDistance` values intentionally filter out all results, including exact matches.
 * - Empty-query fallback is allowed when `isFuzzyMatch` is true (items with length <= maxDistance can match).
 *
 * @param query - Search query value
 * @param items - Array of strings and/or numbers to search
 * @param {FuzzySearchOptions} options - Search configuration options
 * @returns {FuzzySearch} An object containing search results with distance and match type
 * - `results`: Array of matching strings with distance and match type.
 * - `totalResults`: Total number of results found.
 * - `totalResultsReturned`: Total number of results returned (after applying maxResults limit).
 *
 * @example
 * ```typescript
 * const results = fuzzySearch('button', ['Button', 'ButtonGroup', 'Badge'], {
 *   maxDistance: 3,
 *   maxResults: 5
 * });
 * // Returns: { results: [{ item: 'Button', distance: 0, matchType: 'exact' }, ...], totalResults: 15, totalResultsReturned: 5 }
 * ```
 */
const fuzzySearch = (
  query: unknown,
  items: unknown[] = [],
  {
    allowEmptyQuery = false,
    maxDistance = 3,
    maxResults = 10,
    normalizeFn = normalizeString.memo,
    isExactMatch = true,
    isPrefixMatch = true,
    isSuffixMatch = true,
    isContainsMatch = true,
    isPartialMatch = true,
    isFuzzyMatch = false,
    deduplicateByNormalized = false
  }: FuzzySearchOptions = {}
): FuzzySearch => {
  const normalizedQuery = normalizeFn(query);
  const seenItem = new Set<string>();
  const results: FuzzySearchResult[] = [];

  items?.forEach(item => {
    const normalizedItem = normalizeFn(item);
    const deduplicationKey = deduplicateByNormalized ? normalizedItem : String(item);

    if (seenItem.has(deduplicationKey)) {
      return;
    }

    seenItem.add(deduplicationKey);
    let editDistance = 0;
    let matchType: FuzzySearchResultMatchType | undefined;

    if (normalizedItem === normalizedQuery) {
      matchType = 'exact';
    } else if (normalizedQuery !== '' && normalizedItem.startsWith(normalizedQuery)) {
      matchType = 'prefix';
      editDistance = 1;
    } else if (normalizedQuery !== '' && normalizedItem.endsWith(normalizedQuery)) {
      matchType = 'suffix';
      editDistance = 1;
    } else if (normalizedQuery !== '' && normalizedItem.includes(normalizedQuery)) {
      matchType = 'contains';
      editDistance = 2;
    } else if (normalizedQuery !== '' && normalizedItem !== '' && normalizedQuery.includes(normalizedItem)) {
      matchType = 'partial';
      editDistance = 2;
    } else if (
      isFuzzyMatch &&
      (allowEmptyQuery || (normalizedQuery !== '' && normalizedItem !== '')) &&
      Math.abs(normalizedItem.length - normalizedQuery.length) <= maxDistance
    ) {
      matchType = 'fuzzy';
      editDistance = distance(normalizedItem, normalizedQuery);
    }

    if (matchType === undefined) {
      return;
    }

    const isIncluded = (matchType === 'exact' && isExactMatch) ||
      (matchType === 'prefix' && isPrefixMatch) ||
      (matchType === 'suffix' && isSuffixMatch) ||
      (matchType === 'contains' && isContainsMatch) ||
      (matchType === 'partial' && isPartialMatch) ||
      (matchType === 'fuzzy' && isFuzzyMatch);

    if (editDistance <= maxDistance && isIncluded) {
      results.push({
        item: String(item),
        distance: editDistance,
        matchType
      });
    }
  });

  // Sort by distance (lowest first), then alphabetically
  results.sort((a, b) => {
    if (a.distance !== b.distance) {
      return a.distance - b.distance;
    }

    return a.item.localeCompare(b.item);
  });

  return {
    results: results.slice(0, maxResults),
    totalResults: results.length,
    totalResultsReturned: results.slice(0, maxResults).length
  };
};

export {
  normalizeString,
  fuzzySearch,
  findClosest,
  type ClosestSearchOptions,
  type FuzzySearch,
  type FuzzySearchResult,
  type FuzzySearchResultMatchType,
  type FuzzySearchOptions
};

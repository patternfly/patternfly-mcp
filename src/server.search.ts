import { distance, closest } from 'fastest-levenshtein';

/**
 * Options for closest search
 */
interface ClosestSearchOptions {
  normalizeFn?: (str: string) => string;
}

/**
 * Fuzzy search result using fastest-levenshtein
 */
interface FuzzySearchResult {
  item: string;
  distance: number;
  matchType: 'exact' | 'prefix' | 'suffix' | 'contains' | 'fuzzy';
}

/**
 * Options for fuzzy search
 *
 * - `maxDistance` - Maximum edit distance for a match. Distance is defined as
 *   - exact = 0
 *   - prefix = 1
 *   - suffix = 1
 *   - contains = 2
 *   - fuzzy = Levenshtein edit distance
 * - `maxResults` - Maximum number of results to return
 * - `normalizeFn` - Function to normalize strings (default: `normalizeString`)
 * - `isExactMatch` | `isPrefixMatch` | `isSuffixMatch` | `isContainsMatch` | `isFuzzyMatch` - Enable specific match modes
 */
interface FuzzySearchOptions {
  maxDistance?: number;
  maxResults?: number;
  normalizeFn?: (str: string) => string;
  isExactMatch?: boolean;
  isPrefixMatch?: boolean;
  isSuffixMatch?: boolean;
  isContainsMatch?: boolean;
  isFuzzyMatch?: boolean;
}

/**
 * Internal lightweight normalization: trim, lowercase, remove diacritics (a sign/accent character), squash separators
 *
 * - Functions `findClosest` and `fuzzySearch` use this internally.
 * - Can be overridden in the `findClosest` and `fuzzySearch` related options for custom normalization.
 *
 * @param str
 */
const normalizeString = (str: string) => String(str || '')
  .trim()
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[\s_-]+/g, ' ')
  .replace(/\s+/g, ' ');

/**
 * Find the closest match using fastest-levenshtein's closest function.
 *
 * - Returns the first original item whose normalized value equals the best normalized candidate.
 *
 * @param query - Search query string
 * @param items - Array of strings to search
 * @param {ClosestSearchOptions} options - Search configuration options
 * @returns {string | null} Closest matching string or null
 *
 * @example
 * ```typescript
 * const result = findClosest('button', ['Button', 'ButtonGroup', 'Badge']);
 * // Returns: 'Button' (the closest match)
 * ```
 */
const findClosest = (
  query: string,
  items: string[] = [],
  {
    normalizeFn = normalizeString
  }: ClosestSearchOptions = {}
) => {
  const normalizedQuery = normalizeFn(query);

  if (!normalizedQuery || !Array.isArray(items) || items.length === 0) {
    return null;
  }

  const normalizedItems = items.map(item => (item ? normalizeFn(item) : item));
  const closestMatch = closest(normalizedQuery, normalizedItems);

  return items[normalizedItems.indexOf(closestMatch)] || null;
};

/**
 * Fuzzy search using fastest-levenshtein
 *
 * - Exact/prefix/suffix/contains are evaluated first with constant distances (0/1/1/2).
 * - Fuzzy distance is computed only when earlier classifications fail and only when the
 *   string length delta is within `maxDistance` (cheap lower-bound check).
 * - Global filter `distance <= maxDistance` applies to all match types.
 * - Empty-query fallback: if `query` normalizes to `''` and `isFuzzyMatch` is true,
 *   items with length `<= maxDistance` can match (since `distance('', s) = s.length`).
 *
 * @param query - Search query string
 * @param items - Array of strings to search
 * @param {FuzzySearchOptions} options - Search configuration options
 * @returns {FuzzySearchResult[]} Array of matching strings with distance and match type
 *
 * @example
 * ```typescript
 * const results = fuzzySearch('button', ['Button', 'ButtonGroup', 'Badge'], {
 *   maxDistance: 3,
 *   maxResults: 5
 * });
 * // Returns: [{ item: 'Button', distance: 0, matchType: 'exact' }, ...]
 * ```
 */
const fuzzySearch = (
  query: string,
  items: string[] = [],
  {
    maxDistance = 3,
    maxResults = 10,
    normalizeFn = normalizeString,
    isExactMatch = true,
    isPrefixMatch = true,
    isSuffixMatch = true,
    isContainsMatch = true,
    isFuzzyMatch = false
  }: FuzzySearchOptions = {}
): FuzzySearchResult[] => {
  const normalizedQuery = normalizeFn(query);
  const seenItem = new Set<string>();
  const results: FuzzySearchResult[] = [];

  items?.forEach(item => {
    if (seenItem.has(item)) {
      return;
    }

    seenItem.add(item);

    const normalizedItem = normalizeFn(item);
    let editDistance = 0;
    let matchType: FuzzySearchResult['matchType'] | undefined;

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
    } else if (isFuzzyMatch && Math.abs(normalizedItem.length - normalizedQuery.length) <= maxDistance) {
      matchType = 'fuzzy';
      editDistance = distance(normalizedQuery, normalizedItem);
    }

    if (matchType === undefined) {
      return;
    }

    const isIncluded = (matchType === 'exact' && isExactMatch) ||
      (matchType === 'prefix' && isPrefixMatch) ||
      (matchType === 'suffix' && isSuffixMatch) ||
      (matchType === 'contains' && isContainsMatch) ||
      (matchType === 'fuzzy' && isFuzzyMatch);

    if (editDistance <= maxDistance && isIncluded) {
      results.push({
        item,
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

  return results.slice(0, maxResults);
};

export {
  normalizeString,
  fuzzySearch,
  findClosest,
  type ClosestSearchOptions,
  type FuzzySearchResult,
  type FuzzySearchOptions
};

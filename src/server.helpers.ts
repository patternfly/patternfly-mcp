import { createHash } from 'crypto';
import { distance, closest } from 'fastest-levenshtein';

/**
 * Simple hash from content.
 *
 * @param {unknown} content - Content to hash
 * @returns {string} Hash string
 */
const generateHash = (content: unknown) =>
  createHash('sha1')
    .update(JSON.stringify({ value: (typeof content === 'function' && content.toString()) || content }))
    .digest('hex');

/**
 * Check if "is a Promise", "Promise like".
 *
 * @param {object} obj - Object to check
 * @returns {boolean} True if object is a Promise
 */
const isPromise = (obj: unknown) => /^\[object (Promise|Async|AsyncFunction)]/.test(Object.prototype.toString.call(obj));

/**
 * Fuzzy search result using fastest-levenshtein
 */
interface FuzzySearchResult {
  item: string;
  distance: number;
  matchType: 'exact' | 'prefix' | 'contains' | 'fuzzy';
}

/**
 * Options for fuzzy search
 */
interface FuzzySearchOptions {
  maxDistance?: number;
  maxResults?: number;
  isExactMatch?: boolean;
  isPrefixMatch?: boolean;
  isContainsMatch?: boolean;
  isFuzzyMatch?: boolean;
}

/**
 * Find the closest match using fastest-levenshtein's closest function.
 *
 * User input is trimmed to handle accidental spaces.
 *
 * @param query - Search query string
 * @param items - Array of strings to search
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
  items: string[]
): string | null => {
  const queryLower = query.toLowerCase().trim();

  return closest(queryLower, items) || null;
};

/**
 * Fuzzy search using fastest-levenshtein
 *
 * User input is trimmed to handle accidental spaces.
 *
 * @param query - Search query string
 * @param items - Array of strings to search
 * @param options - Search configuration options
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
  items: string[],
  options: FuzzySearchOptions = {}
): FuzzySearchResult[] => {
  const {
    maxDistance = 3,
    maxResults = 10,
    isExactMatch = true,
    isPrefixMatch = true,
    isContainsMatch = true,
    isFuzzyMatch = false
  } = options;

  const queryLower = query.trim().toLowerCase();
  const results: FuzzySearchResult[] = [];

  items.forEach(item => {
    const itemLower = item.toLowerCase();
    let editDistance = 0;
    let matchType: FuzzySearchResult['matchType'] | undefined;

    if (itemLower === queryLower) {
      matchType = 'exact';
    } else if (itemLower.startsWith(queryLower)) {
      matchType = 'prefix';
      editDistance = distance(queryLower, itemLower);
    } else if (itemLower.includes(queryLower)) {
      matchType = 'contains';
      editDistance = distance(queryLower, itemLower);
    } else if (isFuzzyMatch) {
      matchType = 'fuzzy';
      editDistance = distance(queryLower, itemLower);
    }

    if (matchType === undefined) {
      return;
    }

    const isIncluded = (matchType === 'exact' && isExactMatch) || (matchType === 'prefix' && isPrefixMatch) || (matchType === 'contains' && isContainsMatch) || (matchType === 'fuzzy' && isFuzzyMatch);

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
  generateHash,
  isPromise,
  fuzzySearch,
  findClosest,
  type FuzzySearchResult,
  type FuzzySearchOptions
};

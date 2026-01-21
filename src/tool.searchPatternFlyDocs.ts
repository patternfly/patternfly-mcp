import { z } from 'zod';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { componentNames as pfComponentNames } from '@patternfly/patternfly-component-schemas/json';
import { type McpTool } from './server';
import { COMPONENT_DOCS } from './docs.component';
import { LAYOUT_DOCS } from './docs.layout';
import { CHART_DOCS } from './docs.chart';
import { getLocalDocs } from './docs.local';
import { fuzzySearch, type FuzzySearchResult } from './server.search';
import { getOptions } from './options.context';
import { memo } from './server.caching';
import { stringJoin } from './server.helpers';
import { DEFAULT_OPTIONS } from './options.defaults';

/**
 * List of component names to include in search results.
 *
 * @note The "table" component is manually added to the list because it's not currently included
 * in the component schemas package.
 */
const componentNames = [...pfComponentNames, 'Table'].sort((a, b) => a.localeCompare(b));

/**
 * Extract a component name from an internal documentation URL string
 *
 * @note This is reliant on the documentation URLs being in the accepted format.
 * If the format changes, this will need to be updated. This is a short-term solution
 * until we can move the internal links to a new format like:
 * ```
 *  {
 *    name: 'Charts',
 *    description: 'Colors for Charts',
 *    type: 'example',
 *    scope: '@patternfly',
 *    url: `${PF_EXTERNAL_EXAMPLES_CHARTS}/ChartTheme/examples/ChartTheme.md`
 *  }
 * ```
 *
 * @example
 * extractComponentName('[@patternfly/ComponentName - Type](URL)');
 *
 * @param docUrl - Documentation URL string
 * @returns ComponentName or `null` if not found
 */
const extractComponentName = (docUrl: string): string | null => {
  // Stop at space or closing bracket, allowing dashes in the name
  const match = docUrl.match(/\[@patternfly\/([^\s\]]+)/);
  const name = match && match[1] ? match[1].trim() : null;

  // Filter out known non-component patterns
  if (name?.startsWith('react-')) {
    return null;
  }

  return name;
};

/**
 * Extract a URL from an internal Markdown link.
 *
 * @note This is a short-term solution until we can move the internal links to a new format.
 *
 * @example
 * extractUrl('[text](URL)');
 *
 * @param docUrl
 * @returns URL or original string if not a Markdown link
 */
const extractUrl = (docUrl: string): string => {
  const match = docUrl.match(/]\(([^)]+)\)/);

  return match && match[1] ? match[1] : docUrl;
};

/**
 * Build a map of component names relative to internal documentation URLs.
 *
 * @returns Map of component name -> array of URLs (Design Guidelines + Accessibility)
 */
const setComponentToDocsMap = () => {
  const map = new Map<string, string[]>();
  const allDocs = [...COMPONENT_DOCS, ...LAYOUT_DOCS, ...CHART_DOCS, ...getLocalDocs()];
  const getKey = (value?: string | undefined) => {
    if (!value) {
      return undefined;
    }

    for (const [key, urls] of map) {
      if (urls.includes(value)) {
        return key;
      } else {
        const results = fuzzySearch(value, urls, {
          deduplicateByNormalized: true
        });

        if (results.length) {
          return key;
        }
      }
    }

    return undefined;
  };

  allDocs.forEach(docUrl => {
    const componentName = extractComponentName(docUrl);

    if (componentName) {
      const url = extractUrl(docUrl);
      const existing = map.get(componentName) || [];

      map.set(componentName, [...existing, url]);
    }
  });

  return {
    map,
    getKey
  };
};

/**
 * Memoized version of componentToDocsMap.
 */
setComponentToDocsMap.memo = memo(setComponentToDocsMap);

/**
 * Search for PatternFly component documentation URLs using fuzzy search.
 *
 * @param searchQuery - Search query string
 * @param settings - Optional settings object
 * @param settings.names - List of names to search. Defaults to all component names.
 * @param settings.allowWildCardAll - Allow a search query to match all components. Defaults to false.
 * @returns Object containing search results and matched URLs
 *   - `isSearchWildCardAll`: Whether the search query matched all components
 *   - `firstExactMatch`: First exact match within fuzzy search results
 *   - `exactMatches`: All exact matches within fuzzy search results
 *   - `searchResults`: Fuzzy search results
 */
const searchComponents = (searchQuery: string, { names = componentNames, allowWildCardAll = false } = {}) => {
  const isWildCardAll = searchQuery.trim() === '*' || searchQuery.trim().toLowerCase() === 'all' || searchQuery.trim() === '';
  const isSearchWildCardAll = allowWildCardAll && isWildCardAll;
  const { map: componentToDocsMap } = setComponentToDocsMap.memo();
  let searchResults: FuzzySearchResult[] = [];

  if (isSearchWildCardAll) {
    searchResults = componentNames.map(name => ({ matchType: 'all', distance: 0, item: name } as FuzzySearchResult));
  } else {
    searchResults = fuzzySearch(searchQuery, names, {
      maxDistance: 3,
      maxResults: 10,
      isFuzzyMatch: true,
      deduplicateByNormalized: true
    });
  }

  const extendResults = (results: FuzzySearchResult[] = []) => results.map(result => {
    const isSchemasAvailable = pfComponentNames.includes(result.item);
    const urls = componentToDocsMap.get(result.item) || [];
    const matchedUrls = new Set<string>();

    urls.forEach(url => {
      matchedUrls.add(url);
    });

    return {
      ...result,
      doc: `patternfly://docs/${result.item}`,
      isSchemasAvailable,
      schema: isSchemasAvailable ? `patternfly://schemas/${result.item}` : undefined,
      urls: Array.from(matchedUrls)
    };
  });

  const exactMatches = searchResults.filter(result => result.matchType === 'exact');
  const extendedExactMatches = extendResults(exactMatches);
  const extendedSearchResults = extendResults(searchResults);

  return {
    isSearchWildCardAll,
    firstExactMatch: extendedExactMatches[0],
    exactMatches: extendedExactMatches,
    searchResults: extendedSearchResults
  };
};

/**
 * Memoized version of searchComponents.
 */
searchComponents.memo = memo(searchComponents, DEFAULT_OPTIONS.toolMemoOptions.searchPatternFlyDocs);

/**
 * searchPatternFlyDocs tool function
 *
 * Searches for PatternFly component documentation URLs using fuzzy search.
 * Returns URLs only (does not fetch content). Use usePatternFlyDocs to fetch the actual content.
 *
 * @param options - Optional configuration options (defaults to OPTIONS)
 * @returns MCP tool tuple [name, schema, callback]
 */
const searchPatternFlyDocsTool = (options = getOptions()): McpTool => {
  const callback = async (args: any = {}) => {
    const { searchQuery } = args;

    if (typeof searchQuery !== 'string') {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Missing required parameter: searchQuery must be a string: ${searchQuery}`
      );
    }

    if (searchQuery.length > options.maxSearchLength) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Search query exceeds ${options.maxSearchLength} character max length.`
      );
    }

    const { isSearchWildCardAll, searchResults } = searchComponents.memo(searchQuery, { allowWildCardAll: true });

    if (!isSearchWildCardAll && searchResults.length === 0) {
      return {
        content: [{
          type: 'text',
          text: stringJoin.newline(
            `No PatternFly documentation found matching "${searchQuery}"`,
            '',
            '---',
            '',
            '**Important**:',
            '  - Use a search all ("*") to find all available components.'
          )
        }]
      };
    }

    const results = searchResults.map(result => {
      const urlList = result.urls.map((url: string, index: number) => `  ${index + 1}. ${url}`).join('\n');

      return stringJoin.newline(
        '',
        `## ${result.item}`,
        `**Match Type**: ${result.matchType}`,
        `### "usePatternFlyDocs" tool documentation URLs`,
        urlList.length ? urlList : '  - No URLs found',
        `### Resources metadata`,
        ` - **Component name**: ${result.item}`,
        ` - **JSON Schemas**: ${result.isSchemasAvailable ? 'Available' : 'Not available'}`
      );
    });

    return {
      content: [{
        type: 'text',
        text: stringJoin.newline(
          `# Search results for "${isSearchWildCardAll ? 'all components' : searchQuery}", ${searchResults.length} matches found:`,
          ...results,
          '',
          '---',
          '',
          '**Important**:',
          '  - Use the "usePatternFlyDocs" tool with the above URLs to fetch documentation content.',
          '  - Use a search all ("*") to find all available components.'
        )
      }]
    };
  };

  return [
    'searchPatternFlyDocs',
    {
      description: `Search PatternFly components and get component names with documentation URLs. Supports case-insensitive partial and all ("*") matches.

      **Usage**:
        1. Input a "searchQuery" to find PatternFly documentation URLs and component names.
        2. Use the returned component names OR URLs with the "usePatternFlyDocs" tool to get markdown documentation and component JSON schemas.

      **Returns**:
        - Component names that can be used with "usePatternFlyDocs"
        - Documentation URLs that can be used with "usePatternFlyDocs"
      `,
      inputSchema: {
        searchQuery: z.string().max(options.maxSearchLength).describe('Full or partial component name to search for (e.g., "button", "table", "*")')
      }
    },
    callback
  ];
};

searchPatternFlyDocsTool.toolName = 'searchPatternFlyDocs';

export { searchPatternFlyDocsTool, searchComponents, setComponentToDocsMap, componentNames };

import { z } from 'zod';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { type McpTool } from './server';
import { getComponentList, getComponentInfo } from './api.client';
import { fuzzySearch, type FuzzySearchResult } from './server.search';
import { getOptions } from './options.context';
import { memo } from './server.caching';
import { stringJoin } from './server.helpers';
import { DEFAULT_OPTIONS } from './options.defaults';

/**
 * Search for PatternFly components using fuzzy search.
 *
 * @param searchQuery - Search query string
 * @param settings - Optional settings object
 * @param settings.allowWildCardAll - Allow a search query to match all components. Defaults to false.
 * @param options - Global options
 * @returns Object containing search results and component metadata
 *
 * @note Component list is fetched from the doc-core API and cached in memory.
 * The search is async because it awaits the API-sourced component index.
 */
const searchComponents = async (searchQuery: string, { allowWildCardAll = false } = {}, options = getOptions()) => {
  const componentNames = await getComponentList.memo(options);
  const isWildCardAll = searchQuery.trim() === '*' || searchQuery.trim().toLowerCase() === 'all' || searchQuery.trim() === '';
  const isSearchWildCardAll = allowWildCardAll && isWildCardAll;
  let searchResults: FuzzySearchResult[] = [];

  if (isSearchWildCardAll) {
    searchResults = componentNames.map(name => ({ matchType: 'all', distance: 0, item: name } as FuzzySearchResult));
  } else {
    const { results } = fuzzySearch(searchQuery, componentNames, {
      maxDistance: 3,
      maxResults: 10,
      isFuzzyMatch: true,
      deduplicateByNormalized: true
    });

    searchResults = results;
  }

  const extendResults = async (results: FuzzySearchResult[] = []) => {
    const extended = [];

    for (const result of results) {
      const info = await getComponentInfo.memo(result.item, options);

      extended.push({
        ...result,
        section: info?.section,
        hasProps: info?.hasProps ?? false,
        hasCss: info?.hasCss ?? false,
        exampleCount: info?.exampleCount ?? 0,
        tabs: info?.tabs ?? []
      });
    }

    return extended;
  };

  const exactMatches = searchResults.filter(result => result.matchType === 'exact');
  const extendedExactMatches = await extendResults(exactMatches);
  const extendedSearchResults = await extendResults(searchResults);

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
 * Searches for PatternFly components using fuzzy search.
 * Returns component metadata (does not fetch content). Use usePatternFlyDocs to fetch the actual content.
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

    const { isSearchWildCardAll, searchResults } = await searchComponents.memo(searchQuery, { allowWildCardAll: true }, options);

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
      const available = [
        result.hasProps && 'props',
        result.hasCss && 'css',
        result.exampleCount > 0 && `${result.exampleCount} examples`
      ].filter(Boolean).join(', ');

      return stringJoin.newline(
        '',
        `## ${result.item}`,
        `**Match Type**: ${result.matchType}`,
        `**Section**: ${result.section || 'unknown'}`,
        `**Available Data**: ${available || 'docs only'}`,
        `**Tabs**: ${result.tabs.join(', ') || 'none'}`
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
          '  - Use the "usePatternFlyDocs" tool with a component name to fetch documentation content.',
          '  - Use a search all ("*") to find all available components.'
        )
      }]
    };
  };

  return [
    'searchPatternFlyDocs',
    {
      description: `Search PatternFly components and get component metadata. Supports case-insensitive partial and all ("*") matches.

      **Usage**:
        1. Input a "searchQuery" to find PatternFly components.
        2. Use the returned component names with the "usePatternFlyDocs" tool to get markdown documentation and props.

      **Returns**:
        - Component names, sections, and available data types (props, css, examples)
      `,
      inputSchema: {
        searchQuery: z.string().max(options.maxSearchLength).describe('Full or partial component name to search for (e.g., "button", "table", "*")')
      }
    },
    callback
  ];
};

searchPatternFlyDocsTool.toolName = 'searchPatternFlyDocs';

export { searchPatternFlyDocsTool, searchComponents };

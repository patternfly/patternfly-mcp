import { z } from 'zod';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { componentNames as pfComponentNames } from '@patternfly/patternfly-component-schemas/json';
import { type McpTool } from './server';
import { COMPONENT_DOCS } from './docs.component';
import { LAYOUT_DOCS } from './docs.layout';
import { CHART_DOCS } from './docs.chart';
import { getLocalDocs } from './docs.local';
import { fuzzySearch } from './server.search';
import { memo } from './server.caching';
import { DEFAULT_OPTIONS } from './options.defaults';

/**
 * List of component names to include in search results.
 *
 * @note The "table" component is manually added to the list because it's not currently included
 * in the component schemas package.
 */
const componentNames = [...pfComponentNames, 'Table'].sort((a, b) => a.localeCompare(b));

/**
 * Extract a component name from a documentation URL string
 *
 * @note This is reliant on the documentation URLs being in the accepted format.
 * If the format changes, this will need to be updated.
 *
 * @example
 * extractComponentName('[@patternfly/ComponentName - Type](URL)');
 *
 * @param docUrl - Documentation URL string
 * @returns ComponentName or `null` if not found
 */
const extractComponentName = (docUrl: string): string | null => {
  const match = docUrl.match(/\[@patternfly\/([^\s-]+)/);

  return match && match[1] ? match[1] : null;
};

/**
 * Extract a URL from a Markdown link
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
 * Build a map of component names relative to documentation URLs.
 *
 * @returns Map of component name -> array of URLs (Design Guidelines + Accessibility)
 */
const buildComponentToDocsMap = (): Map<string, string[]> => {
  const map = new Map<string, string[]>();
  const allDocs = [...COMPONENT_DOCS, ...LAYOUT_DOCS, ...CHART_DOCS, ...getLocalDocs()];

  for (const docUrl of allDocs) {
    const componentName = extractComponentName(docUrl);

    if (componentName) {
      const url = extractUrl(docUrl);
      const existing = map.get(componentName) || [];

      map.set(componentName, [...existing, url]);
    }
  }

  return map;
};

/**
 * Memoized version of buildComponentToDocsMap. Use default memo options.
 */
buildComponentToDocsMap.memo = memo(buildComponentToDocsMap, DEFAULT_OPTIONS.resourceMemoOptions.default);

/**
 * Search for PatternFly component documentation URLs using fuzzy search.
 *
 * @param searchQuery - Search query string
 * @returns Object containing search results and matched URLs
 */
const searchComponents = (searchQuery: string) => {
  const componentToDocsMap = buildComponentToDocsMap();

  // Use fuzzy search to handle exact matches and variations
  const searchResults = fuzzySearch(searchQuery, componentNames, {
    maxDistance: 3,
    maxResults: 10,
    isFuzzyMatch: true,
    deduplicateByNormalized: true
  });

  const matchedUrls: string[] = [];
  const seenUrls = new Set<string>();

  for (const result of searchResults) {
    const urls = componentToDocsMap.get(result.item) || [];

    for (const url of urls) {
      if (!seenUrls.has(url)) {
        matchedUrls.push(url);
        seenUrls.add(url);
      }
    }
  }

  return {
    searchResults,
    matchedUrls
  };
};

/**
 * searchPatternFlyDocs tool function
 *
 * Searches for PatternFly component documentation URLs using fuzzy search.
 * Returns URLs only (does not fetch content). Use usePatternFlyDocs to fetch the actual content.
 *
 * @returns MCP tool tuple [name, schema, callback]
 */
const searchPatternFlyDocsTool = (): McpTool => {
  const callback = async (args: any = {}) => {
    const { searchQuery } = args;

    if (!searchQuery || typeof searchQuery !== 'string') {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Missing required parameter: searchQuery must be a string: ${searchQuery}`
      );
    }

    const { searchResults, matchedUrls } = searchComponents(searchQuery);

    if (searchResults.length === 0) {
      return {
        content: [{
          type: 'text',
          text: [
            `No PatternFly components found matching "${searchQuery}"`,
            'To browse all available components, read the "patternfly://schemas/index" resource.'
          ].join('\n')
        }]
      };
    }

    // For scenarios where no documentation URLs are available for a component, return a
    // message with the first matched component and a list of similar components.
    if (matchedUrls.length === 0) {
      const componentList = searchResults
        .slice(0, 5)
        .map(result => result.item)
        .join(', ');

      return {
        content: [
          {
            type: 'text',
            text: [
              `Found components matching "${searchQuery}" but no documentation URLs are available. Matched components: ${componentList}`,
              'To browse all available documentation, read the "patternfly://docs/index" resource.'
            ].join('\n')
          }
        ]
      };
    }

    // Return the first 10 matched URLs as a formatted list
    const urlListText = matchedUrls
      .slice(0, 10)
      .map((url, index) => `${index + 1}. ${url}`)
      .join('\n');

    return {
      content: [{
        type: 'text',
        text: `Documentation URLs for "${searchQuery}":\n\n${urlListText}\n\nUse the "usePatternFlyDocs" tool with these URLs to fetch content.`
      }]
    };
  };

  return [
    'searchPatternFlyDocs',
    {
      description: 'Search for PatternFly component documentation URLs. Returns URLs only (no content). Use "usePatternFlyDocs" to fetch the actual documentation.',
      inputSchema: {
        searchQuery: z.string().describe('Component name to search for (e.g., "button", "table")')
      }
    },
    callback
  ];
};

searchPatternFlyDocsTool.toolName = 'searchPatternFlyDocs';

export { searchPatternFlyDocsTool, searchComponents, componentNames };

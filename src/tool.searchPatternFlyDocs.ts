import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { type McpTool } from './server';
import { stringJoin } from './server.helpers';
import { assertInput, assertInputStringLength, assertInputStringNumberEnumLike } from './server.assertions';
import { getOptions } from './options.context';
import { searchPatternFly } from './patternFly.search';
import { getPatternFlyMcpResources } from './patternFly.getResources';
import { normalizeEnumeratedPatternFlyVersion } from './patternFly.helpers';

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
    const { searchQuery, version } = args;
    const isVersion = typeof version === 'string' && version.length > 0;

    assertInputStringLength(searchQuery, {
      ...options.minMax.inputStrings,
      inputDisplayName: 'searchQuery'
    });

    if (isVersion) {
      assertInputStringLength(version, {
        max: options.minMax.inputStrings.max,
        min: 2,
        inputDisplayName: 'version'
      });

      assertInputStringNumberEnumLike(version, options.patternflyOptions.availableSearchVersions, {
        inputDisplayName: 'version'
      });
    }

    const { latestVersion } = await getPatternFlyMcpResources.memo();
    const normalizedVersion = await normalizeEnumeratedPatternFlyVersion(version);
    const updatedVersion = normalizedVersion || latestVersion;

    const { isSearchWildCardAll, exactMatches, remainingMatches, searchResults, totalPotentialMatches } = await searchPatternFly.memo(
      searchQuery,
      { version: updatedVersion },
      { allowWildCardAll: true, maxResults: options.minMax.toolSearches.max }
    );

    assertInput(
      !isSearchWildCardAll || (isSearchWildCardAll && searchResults.length > 0),
      stringJoin.newline(
        `Internal Search Error: The server failed to retrieve PatternFly resources for query "${searchQuery}"`,
        'Ensure documentation resources are loaded or restart the server.'
      ),
      ErrorCode.InternalError
    );

    if (!isSearchWildCardAll && searchResults.length === 0) {
      return {
        content: [{
          type: 'text',
          text: stringJoin.newline(
            `No PatternFly resources found matching "${searchQuery}"`,
            options.separator,
            '**Important**:',
            '  - Use a search all ("*") to find all available resources.'
          )
        }]
      };
    }

    // Default to parsing all remainingMatches
    let parseResults = remainingMatches;

    // Focus the result set. If there are exact matches, use those.
    if (isSearchWildCardAll || exactMatches.length > 0) {
      parseResults = exactMatches;

    // Focus the result set. If there aren't any exactMatches use "distance 1" matches only.
    } else if (searchResults.some(result => result.distance === 1)) {
      parseResults = searchResults.filter(result => result.distance === 1);
    }

    const searchTitlePatternFly = updatedVersion
      ? `Search results for PatternFly version "${updatedVersion}" and`
      : `Search results for`;

    let searchTitle = stringJoin.basic(
      `# ${searchTitlePatternFly} "${searchQuery}".`,
      `Showing ${parseResults.length} related ${parseResults.length === 1 ? 'match' : 'matches'}.`
    );

    if (isSearchWildCardAll) {
      searchTitle = stringJoin.basic(
        `# ${searchTitlePatternFly} "all" resources.`,
        `Only showing the first ${parseResults.length} results. There are ${totalPotentialMatches} potential match variations.`,
        `Try searching with a more specific query.`
      );
    } else if (exactMatches.length > 0) {
      searchTitle = stringJoin.basic(
        `# ${searchTitlePatternFly} "${searchQuery}".`,
        `Showing ${parseResults.length} exact ${parseResults.length === 1 ? 'match' : 'matches'}.`
      );
    }

    const results = parseResults.map((result, index) => {
      const availableVersions = new Set<string>();
      const urlList = result.entries
        .filter(entry => entry.path)
        .map(entry => {
          availableVersions.add(entry.version);

          return `      - [${entry.displayName} - (${entry.version}) - ${entry.description}](${entry.path})`;
        });

      const uri = result.uri;
      const uriSchemas = result.uriSchemas;

      return stringJoin.newlineFiltered(
        `${index + 1}. **${result.name}**:`,
        `  "usePatternFlyDocs" resource parameter "name" and "URLs"`,
        `    - **Name**: ${result.name}`,
        urlList.length ? `    - **URLs**:` : undefined,
        urlList.length ? urlList.join('\n') : undefined,
        uri || uriSchemas ? `    - **Resources**:` : undefined,
        uri ? `      - **URI**: ${uri}` : undefined,
        uriSchemas ? `      - **JSON Schemas**: ${uriSchemas}` : undefined
      ) + '\n';
    });

    return {
      content: [{
        type: 'text',
        text: stringJoin.newline(
          searchTitle,
          ...results,
          options.separator,
          '**Important**:',
          '  - Use the "usePatternFlyDocs" tool with the above names and URLs to fetch resource content.',
          '  - Use a search all ("*") to find all available resources.'
        )
      }]
    };
  };

  return [
    'searchPatternFlyDocs',
    {
      description: `Search PatternFly resources and get component names with documentation and guidance URLs. Supports case-insensitive partial and all ("*") matches.

      **Usage**:
        1. Input a "searchQuery" to find PatternFly documentation and guideline URLs, and component names.
        2. Use the returned resource names OR URLs OR version with the "usePatternFlyDocs" tool to get markdown documentation, guidelines, and component JSON schemas.

      **Returns**:
        - Component and resource names that can be used with "usePatternFlyDocs"
        - Documentation and guideline URLs that can be used with "usePatternFlyDocs"
      `,
      inputSchema: {
        searchQuery: z.string()
          .min(options.minMax.inputStrings.min)
          .max(options.minMax.inputStrings.max)
          .describe('Full or partial resource or component name to search for (e.g., "button", "react", "*")'),
        version: z.enum(options.patternflyOptions.availableSearchVersions)
          .optional()
          .describe(`Filter results by a specific PatternFly version (e.g. ${options.patternflyOptions.availableSearchVersions.map(value => `"${value}"`).join(', ')})`)
      }
    },
    callback
  ];
};

searchPatternFlyDocsTool.toolName = 'searchPatternFlyDocs';

export { searchPatternFlyDocsTool };

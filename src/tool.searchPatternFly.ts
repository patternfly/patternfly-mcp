import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { type McpTool } from './mcpSdk';
import { stringJoin } from './server.helpers';
import { assertInput, assertInputStringLength, assertInputStringNumberEnumLike } from './server.assertions';
import { findClosest } from './server.search';
import { getOptions } from './options.context';
import { searchPatternFly } from './patternFly.search';
import { getPatternFlyMcpResources } from './patternFly.getResources';
import { normalizeEnumeratedPatternFlyVersion } from './patternFly.helpers';

/**
 * searchPatternFly tool function
 *
 * Searches for PatternFly resources. Returns MCP Resource Links for
 * specific documents, JSON schemas, and collections.
 *
 * @note This is the initial update to confirm concepts for a larger set of
 * updates that tie into the concepts of `collections` and `records`. The full
 * optimizations include API work, skills-as-tools, refactoring getResources
 * search, and MCP resources. See documentation for experimental settings.
 *
 * @param options - Optional configuration options (defaults to OPTIONS)
 * @returns MCP tool tuple [name, schema, callback]
 */
const searchPatternFlyTool = (options = getOptions()): McpTool => {
  const callback = async (args: any = {}) => {
    const { query: searchQuery, version } = args;
    const isVersion = typeof version === 'string' && version.length > 0;

    assertInputStringLength(searchQuery, {
      ...options.minMax.inputStrings,
      inputDisplayName: 'query'
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

    const { keywordsIndex, latestVersion } = await getPatternFlyMcpResources.memo();
    const normalizedVersion = await normalizeEnumeratedPatternFlyVersion(version);
    const updatedVersion = normalizedVersion || latestVersion;

    const { isSearchWildCardAll, exactMatches, remainingMatches, searchResults, totalPotentialMatches } = await searchPatternFly.memo(
      searchQuery,
      { version: updatedVersion },
      { allowWildCardAll: true, dynamicFilter: true, maxResults: options.minMax.toolSearches.max }
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
      const hint = findClosest.memo(searchQuery, keywordsIndex.toReversed(), { maxDistance: 5 });

      return {
        content: [{
          type: 'text',
          text: stringJoin.filtered(
            `No PatternFly resources found matching "${searchQuery}".`,
            hint && `Try a search for "${hint}".`
          )
        }]
      };
    }

    // Default to parsing all remainingMatches
    let parseResults = remainingMatches;

    if (isSearchWildCardAll || exactMatches.length > 0) {
      parseResults = exactMatches;
    } else if (searchResults.some(result => result.distance === 1)) {
      parseResults = searchResults.filter(result => result.distance === 1);
    }

    const results = new Map<string, Record<string, unknown>>();
    const groupSortNames = new Map<string, string>();
    let numberCollections = 0;
    let numberRecords = 0;

    parseResults.forEach(result => {
      if (results.has(result.groupId)) {
        return;
      }

      numberCollections += 1;

      const recordNames = new Set<string>();

      result.entries.forEach(record => {
        if (record.uriId && record.path && !results.has(record.uriId)) {
          numberRecords += 1;
          recordNames.add(record.displayName);

          results.set(record.uriId, {
            type: 'resource_link',
            uri: record.uriId,
            name: `${record.displayName} - ${record.displayCategory} (${record.version})`,
            description: record.description,
            mimeType: 'text/markdown',
            groupId: result.groupId
          });
        }

        if (record.uriSchemasId && !results.has(record.uriSchemasId)) {
          numberRecords += 1;
          recordNames.add(record.displayName);

          results.set(record.uriSchemasId, {
            type: 'resource_link',
            uri: record.uriSchemasId,
            name: `${record.displayName} - JSON Schema (${record.version})`,
            description: `Component JSON schema with property definitions for ${record.displayName}.`,
            mimeType: 'text/markdown',
            groupId: result.groupId
          });
        }
      });

      if (!result.entries.length) {
        return;
      }

      const collectionName = (recordNames.size === 1 ? [...recordNames][0] : result.name) as string;
      const collectionNames =
        `${[...recordNames].slice(0, 3).join(', ')}${(recordNames.size > 3 && ', and more') || ''}`.trim() || result.name;

      // Track the name used for sorting this entire group
      groupSortNames.set(result.groupId, collectionName.toLowerCase());

      results.set(result.groupId, {
        type: 'resource_link',
        uri: `patternfly://docs/${result.groupId}`,
        name: `${collectionName} (Collection)`,
        description: `A resource collection series for ${collectionNames}`,
        mimeType: 'text/markdown',
        groupId: result.groupId
      });
    });

    const resultValues = Array.from(results.values()).sort((a, b) => {
      const gidA = a.groupId as string;
      const gidB = b.groupId as string;

      // 1. Sort by Group (using the Collection's name)
      if (gidA !== gidB) {
        const nameA = groupSortNames.get(gidA) || '';
        const nameB = groupSortNames.get(gidB) || '';

        return nameA.localeCompare(nameB);
      }

      // 2. Define Priority within the same group
      const getPriority = (item: string) => {
        const name = item.toLowerCase();

        if (name.endsWith('(collection)')) {
          return 0;
        }
        if (name.includes('json schema')) {
          return 2;
        }

        return 1;
      };

      const priorityA = getPriority(a.name as string);
      const priorityB = getPriority(b.name as string);

      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }

      // 3. Fallback to name comparison within the same priority level
      return (a.name as string).localeCompare(b.name as string);
    });

    const summaryTitlePatternFly = updatedVersion
      ? `Search results for PatternFly version "${updatedVersion}" and`
      : `Search results for`;

    const totalCollectionsRecords = numberCollections + numberRecords;
    const basePluralResource = totalCollectionsRecords === 1 ? 'resource' : 'resources';

    const baseSummaryTitle = stringJoin.filtered(
      `Found ${totalCollectionsRecords} related ${basePluralResource}.`,
      totalCollectionsRecords > 0 ? `Use the attached ${basePluralResource} to access and read full content.` : ''
    );

    let summaryTitle = stringJoin.newline(
      `# ${summaryTitlePatternFly} "${searchQuery}".`,
      baseSummaryTitle
    );

    if (isSearchWildCardAll) {
      summaryTitle = stringJoin.newline(
        `# ${summaryTitlePatternFly} "all" resources.`,
        `Only showing ${totalCollectionsRecords} ${basePluralResource} out of ${totalPotentialMatches} potential matches. Use a more specific query.`
      );
    } else if (exactMatches.length > 0) {
      summaryTitle = stringJoin.newlineFiltered(
        `# ${summaryTitlePatternFly} "${searchQuery}".`,
        stringJoin.filtered(
          numberCollections > 0 && `Found ${numberCollections} ${numberCollections === 1 ? 'collection' : 'collections'} with ${numberRecords} related resources.`,
          numberCollections === 0 && `Found ${totalCollectionsRecords} exact ${basePluralResource}.`,
          `Use the attached ${basePluralResource} to access and read full content.`
        )
      );
    }

    return {
      content: [
        {
          type: 'text',
          text: summaryTitle
        },
        ...resultValues
      ]
    };
  };

  return [
    'searchPatternFly',
    {
      description: `Search PatternFly components, documentation, guidelines, and resource links by keywords or '*' for all.`,
      inputSchema: {
        query: z.string()
          .min(options.minMax.inputStrings.min)
          .max(options.minMax.inputStrings.max)
          .describe('Case-insensitive, full or partial keyword query (e.g., "button", "react", "*")'),
        version: z.enum(options.patternflyOptions.availableSearchVersions)
          .optional()
          .describe(`Filter results by a specific PatternFly version (e.g. ${options.patternflyOptions.availableSearchVersions.map(value => `"${value}"`).join(', ')})`)
      }
    },
    callback,
    {
      shouldRegister: opts => opts.contextManagement === true
    }
  ];
};

searchPatternFlyTool.toolName = 'searchPatternFly';

export { searchPatternFlyTool };

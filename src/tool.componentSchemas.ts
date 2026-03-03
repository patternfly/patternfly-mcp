import { z } from 'zod';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { type McpTool } from './server';
import { getOptions } from './options.context';
import { getComponentList } from './api.client';
import { fetchComponentData } from './api.fetcher';
import { fuzzySearch } from './server.search';

/**
 * componentSchemas tool function
 *
 * Creates an MCP tool that retrieves prop schemas for PatternFly React components.
 * Uses fuzzy search to handle typos and case variations, with related fallback suggestions.
 *
 * @param options - Optional configuration options (defaults to OPTIONS)
 * @returns MCP tool tuple [name, schema, callback]
 */
const componentSchemasTool = (options = getOptions()): McpTool => {
  const callback = async (args: any = {}) => {
    const { componentName } = args;

    if (typeof componentName !== 'string') {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Missing required parameter: componentName must be a string: ${componentName}`
      );
    }

    if (componentName.length > options.maxSearchLength) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Component name exceeds maximum length of ${options.maxSearchLength} characters.`
      );
    }

    const componentNames = await getComponentList.memo(options);

    const { results } = fuzzySearch(componentName, componentNames, {
      maxDistance: 3,
      maxResults: 5,
      isFuzzyMatch: true,
      deduplicateByNormalized: true
    });

    const exact = results.find(result => result.matchType === 'exact');

    if (exact) {
      const data = await fetchComponentData.memo(exact.item, ['props'], options);

      if (!data?.props) {
        throw new McpError(
          ErrorCode.InternalError,
          `Component "${exact.item}" found but prop schema is not available.`
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: data.props
          }
        ]
      };
    }

    const suggestions = results.map(result => result.item).slice(0, 3);
    const suggestionMessage = suggestions.length
      ? `Did you mean ${suggestions.map(suggestion => `"${suggestion}"`).join(', ')}?`
      : 'No similar components found.';

    throw new McpError(
      ErrorCode.InvalidParams,
      `Component "${componentName.trim()}" not found. ${suggestionMessage}`
    );
  };

  return [
    'componentSchemas',
    {
      description: `[Deprecated: Use "usePatternFlyDocs" to retrieve component schemas from PatternFly documentation URLs.]

      Get prop schema for a PatternFly React component.

      Returns prop definitions, types, and validation rules. Use this for structured component metadata, not documentation.`,
      inputSchema: {
        componentName: z.string().max(options.maxSearchLength).describe('Name of the PatternFly component (e.g., "Button", "Table")')
      }
    },
    callback
  ];
};

/**
 * A tool name, typically the first entry in the tuple. Used in logging and deduplication.
 */
componentSchemasTool.toolName = 'componentSchemas';

export { componentSchemasTool };

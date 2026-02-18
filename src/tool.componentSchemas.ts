import { z } from 'zod';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { type McpTool } from './server';
import { fuzzySearch } from './server.search';
import { getOptions } from './options.context';
import {
  getPatternFlyComponentSchema,
  getPatternFlyReactComponentNames,
  type PatternFlyComponentSchema
} from './patternFly.getResources';

/**
 * componentSchemas tool function
 *
 * Creates an MCP tool that retrieves JSON Schema for PatternFly React components.
 * Uses fuzzy search to handle typos and case variations, with related fallback suggestions.
 *
 * @param options - Optional configuration options (defaults to OPTIONS)
 * @returns MCP tool tuple [name, schema, callback]
 */
const componentSchemasTool = (options = getOptions()): McpTool => {
  const callback = async (args: any = {}) => {
    const { componentName } = args;
    const { componentNamesWithSchemasIndex: componentNames } = await getPatternFlyReactComponentNames.memo();

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

    // Use fuzzySearch with `isFuzzyMatch` to handle exact and intentional suggestions in one pass
    const results = fuzzySearch(componentName, componentNames, {
      maxDistance: 3,
      maxResults: 5,
      isFuzzyMatch: true,
      deduplicateByNormalized: true
    });

    const exact = results.find(result => result.matchType === 'exact');

    if (exact) {
      let componentSchema: PatternFlyComponentSchema | undefined;

      try {
        componentSchema = await getPatternFlyComponentSchema.memo(exact.item);

        if (componentSchema === undefined) {
          throw new Error(`Component schema for "${exact.item}" doesn't exist.`);
        }
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to fetch component schema: ${error}`
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(componentSchema, null, 2)
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

      Get JSON Schema for a PatternFly React component.

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

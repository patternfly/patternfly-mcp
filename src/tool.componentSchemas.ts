import { z } from 'zod';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { type McpTool } from './server';
import { getOptions } from './options.context';
import {
  getPatternFlyComponentSchema,
  getPatternFlyMcpResources,
  type PatternFlyComponentSchema
} from './patternFly.getResources';
import { searchPatternFly } from './patternFly.search';

/**
 * componentSchemas tool function
 *
 * @deprecated
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

    if (typeof componentName !== 'string') {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Missing required parameter: componentName must be a string: ${componentName}`
      );
    }

    if (componentName.length > options.minMax.inputStrings.max) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Component name exceeds maximum length of ${options.minMax.inputStrings.max} characters.`
      );
    }

    const { latestVersion } = await getPatternFlyMcpResources.memo();
    const { exactMatches, remainingMatches } = await searchPatternFly.memo(
      componentName,
      { version: latestVersion, section: 'components' },
      { maxDistance: 3, maxResults: 5 }
    );

    const exact = exactMatches.find(match => match.isSchemasAvailable === true);

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

    const suggestions = remainingMatches.map(result => result.item).slice(0, 3);
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
        componentName: z.string().max(options.minMax.inputStrings.max).describe('Name of the PatternFly component (e.g., "Button", "Table")')
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

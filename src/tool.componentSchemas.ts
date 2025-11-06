import { z } from 'zod';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { componentNames, getComponentSchema } from '@patternfly/patternfly-component-schemas/json';
import { type McpTool } from './server';
import { OPTIONS } from './options';
import { memo } from './server.caching';
import { fuzzySearch } from './server.search';

/**
 * Component schema type from @patternfly/patternfly-component-schemas
 * This is the JSON Schema object returned directly from getComponentSchema
 */
type ComponentSchema = {
  $schema: string;
  type: string;
  title: string;
  description: string;
  properties: Record<string, any>;
  additionalProperties?: boolean;
  required?: string[];
};

/**
 * componentSchemas tool function (tuple pattern)
 *
 * @param options
 */
const componentSchemasTool = (options = OPTIONS): McpTool => {
  const memoGetComponentSchema = memo(
    async (componentName: string): Promise<ComponentSchema> => getComponentSchema(componentName),
    options.toolMemoOptions.fetchDocs // Use the same memo options as fetchDocs
  );

  const callback = async (args: any = {}) => {
    const { componentName } = args;

    if (typeof componentName !== 'string') {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Missing required parameter: componentName (must be a string): ${componentName}`
      );
    }

    // Use fuzzySearch with `isFuzzyMatch` to handle exact and intentional suggestions in one pass
    const results = fuzzySearch(componentName, componentNames, {
      maxDistance: 3,
      maxResults: 5,
      isFuzzyMatch: true,
      deduplicateByNormalized: true
    });

    const exact = results.find(r => r.matchType === 'exact');

    if (exact) {
      let componentSchema: ComponentSchema;

      try {
        componentSchema = await memoGetComponentSchema(exact.item);
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

    const suggestions = results.map(r => r.item).slice(0, 3);
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
      description: 'Get JSON Schema for a PatternFly React component. Returns prop definitions, types, and validation rules. Use this for structured component metadata, not documentation.',
      inputSchema: {
        componentName: z.string().describe('Name of the PatternFly component (e.g., "Button", "Table")')
      }
    },
    callback
  ];
};

export { componentSchemasTool };

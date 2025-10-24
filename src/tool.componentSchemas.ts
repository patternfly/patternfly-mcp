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

    // Trim componentName (user input) to handle accidental spaces, but don't trim componentNames
    // (authoritative data) to preserve them as-is
    const trimmedComponentName = componentName.trim();

    // Try an exact match first (case-insensitive)
    const exactMatch = componentNames.find(name => name.toLowerCase() === trimmedComponentName.toLowerCase());

    if (exactMatch === undefined) {
      const fuzzyResults = fuzzySearch(trimmedComponentName, componentNames, {
        maxDistance: 3,
        maxResults: 5
      });

      const suggestions = fuzzyResults.map(result => result.item);

      const suggestionMessage = suggestions.length > 0
        ? `Did you mean "${suggestions.shift()}"?`
        : 'No similar components found.';

      throw new McpError(
        ErrorCode.InvalidParams,
        `Component "${trimmedComponentName}" not found. ${suggestionMessage}`
      );
    }

    // Get schema using a memoized function
    let componentSchema: ComponentSchema;

    try {
      componentSchema = await memoGetComponentSchema(exactMatch);
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to fetch component schema: ${error}`
      );
    }

    // Return schema as JSON string (schema is already the JSON Schema object)
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(componentSchema, null, 2)
        }
      ]
    };
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

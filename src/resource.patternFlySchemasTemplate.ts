import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { componentNames as pfComponentNames } from '@patternfly/patternfly-component-schemas/json';
import { type McpResource } from './server';
import { getOptions } from './options.context';
import { getComponentSchema } from './tool.patternFlyDocs';
import { searchComponents } from './tool.searchPatternFlyDocs';

/**
 * Derive the component schema type from @patternfly/patternfly-component-schemas
 */
type ComponentSchema = Awaited<ReturnType<typeof getComponentSchema>>;

/**
 * Name of the resource template.
 */
const NAME = 'patternfly-schemas-template';

/**
 * URI template for the resource.
 */
const URI_TEMPLATE = new ResourceTemplate('patternfly://schemas/{name}', { list: undefined });

/**
 * Resource configuration.
 */
const CONFIG = {
  title: 'PatternFly Component Schema',
  description: 'Retrieve the JSON Schema for a specific PatternFly component by name',
  mimeType: 'application/json'
};

/**
 * Resource creator for the component schemas template.
 *
 * @param options - Global options
 * @returns {McpResource} The resource definition tuple
 */
const patternFlySchemasTemplateResource = (options = getOptions()): McpResource => [
  NAME,
  URI_TEMPLATE,
  CONFIG,
  async (uri: URL, variables: Record<string, string>) => {
    const { name } = variables || {};

    if (!name || typeof name !== 'string') {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Missing required parameter: name must be a string: ${name}`
      );
    }

    if (name.length > options.maxSearchLength) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Resource name exceeds maximum length of ${options.maxSearchLength} characters.`
      );
    }

    const { exactMatches, searchResults } = searchComponents.memo(name, { names: pfComponentNames });
    let result: ComponentSchema | undefined = undefined;

    if (exactMatches.length > 0) {
      for (const match of exactMatches) {
        const schema = await getComponentSchema.memo(match.item);

        if (schema) {
          result = schema;
          break;
        }
      }
    }

    if (result === undefined) {
      const suggestions = searchResults.map(searchResult => searchResult.item).slice(0, 3);
      const suggestionMessage = suggestions.length
        ? `Did you mean ${suggestions.map(suggestion => `"${suggestion}"`).join(', ')}?`
        : 'No similar components found.';
      const foundNotFound = exactMatches.length ? 'found but JSON schema not available.' : 'not found.';

      throw new McpError(
        ErrorCode.InvalidParams,
        `Component "${name.trim()}" ${foundNotFound} ${suggestionMessage}`
      );
    }

    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  }
];

export { patternFlySchemasTemplateResource, NAME, URI_TEMPLATE, CONFIG };

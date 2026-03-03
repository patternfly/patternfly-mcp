import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { type McpResource } from './server';
import { getOptions } from './options.context';
import { fetchComponentData } from './api.fetcher';
import { searchComponents } from './tool.searchPatternFlyDocs';
import { stringJoin } from './server.helpers';

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
  description: 'Retrieve the prop schema for a specific PatternFly component by name',
  mimeType: 'text/markdown'
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

    const data = await fetchComponentData.memo(name, ['props'], options);

    if (!data || !data.props) {
      const { searchResults } = await searchComponents.memo(name, {}, options);
      const suggestions = searchResults.map(result => result.item).slice(0, 3);
      const suggestionMessage = suggestions.length
        ? `Did you mean ${suggestions.map(suggestion => `"${suggestion}"`).join(', ')}?`
        : 'No similar components found.';
      const foundNotFound = data ? 'found but prop schema not available.' : 'not found.';

      throw new McpError(
        ErrorCode.InvalidParams,
        `Component "${name.trim()}" ${foundNotFound} ${suggestionMessage}`
      );
    }

    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'text/markdown',
          text: stringJoin.newline(
            `# Props for ${data.name}`,
            '',
            data.props
          )
        }
      ]
    };
  }
];

export { patternFlySchemasTemplateResource, NAME, URI_TEMPLATE, CONFIG };

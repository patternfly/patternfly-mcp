import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { type McpResource } from './server';
import { fetchComponentData } from './api.fetcher';
import { searchComponents } from './tool.searchPatternFlyDocs';
import { getOptions } from './options.context';
import { stringJoin } from './server.helpers';

/**
 * Name of the resource template.
 */
const NAME = 'patternfly-docs-template';

/**
 * URI template for the resource.
 */
const URI_TEMPLATE = new ResourceTemplate('patternfly://docs/{name}', { list: undefined });

/**
 * Resource configuration.
 */
const CONFIG = {
  title: 'PatternFly Documentation Page',
  description: 'Retrieve specific PatternFly documentation by name or path',
  mimeType: 'text/markdown'
};

/**
 * Resource creator for the documentation template.
 *
 * @param options - Global options
 * @returns {McpResource} The resource definition tuple
 */
const patternFlyDocsTemplateResource = (options = getOptions()): McpResource => [
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

    const data = await fetchComponentData.memo(name, ['docs'], options);

    if (!data || !data.docs) {
      const { searchResults } = await searchComponents.memo(name, {}, options);
      const suggestions = searchResults.map(result => result.item).slice(0, 3);
      const suggestionMessage = suggestions.length
        ? `Did you mean ${suggestions.map(suggestion => `"${suggestion}"`).join(', ')}?`
        : 'No similar components found.';

      throw new McpError(
        ErrorCode.InvalidParams,
        `No documentation found for component "${name.trim()}". ${suggestionMessage}`
      );
    }

    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'text/markdown',
          text: stringJoin.newline(
            `# Documentation for ${data.name}`,
            '',
            data.docs
          )
        }
      ]
    };
  }
];

export { patternFlyDocsTemplateResource, NAME, URI_TEMPLATE, CONFIG };

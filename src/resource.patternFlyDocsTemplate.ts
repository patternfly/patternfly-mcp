import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { type McpResource } from './server';
import { processDocsFunction } from './server.getResources';
import { searchComponents } from './tool.searchPatternFlyDocs';
import { getOptions } from './options.context';
import { memo } from './server.caching';
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
const patternFlyDocsTemplateResource = (options = getOptions()): McpResource => {
  const memoProcess = memo(processDocsFunction, options?.toolMemoOptions?.usePatternFlyDocs);

  return [
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

      const docResults = [];
      const docs = [];
      const { exactMatches, searchResults } = searchComponents.memo(name);

      if (exactMatches.length === 0 || exactMatches.every(match => match.urls.length === 0)) {
        const suggestions = searchResults.map(searchResult => searchResult.item).slice(0, 3);
        const suggestionMessage = suggestions.length
          ? `Did you mean ${suggestions.map(suggestion => `"${suggestion}"`).join(', ')}?`
          : 'No similar components found.';

        throw new McpError(
          ErrorCode.InvalidParams,
          `No documentation found for component "${name.trim()}". ${suggestionMessage}`
        );
      }

      try {
        const exactMatchesUrls = exactMatches.flatMap(match => match.urls);

        if (exactMatchesUrls.length > 0) {
          const processedDocs = await memoProcess(exactMatchesUrls);

          docs.push(...processedDocs);
        }
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to fetch documentation: ${error}`
        );
      }

      // Redundancy check, technically this should never happen, future proofing
      if (docs.length === 0) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Component "${name.trim()}" was found, but no documentation URLs are available for it.`
        );
      }

      for (const doc of docs) {
        docResults.push(stringJoin.newline(
          `# Documentation from ${doc.resolvedPath || doc.path}`,
          '',
          doc.content
        ));
      }

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'text/markdown',
            text: docResults.join(options.separator)
          }
        ]
      };
    }
  ];
};

export { patternFlyDocsTemplateResource, NAME, URI_TEMPLATE, CONFIG };

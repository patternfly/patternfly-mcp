import { z } from 'zod';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { type McpTool } from './server';
import { getOptions } from './options.context';
import { fetchComponentData } from './api.fetcher';
import { searchComponents } from './tool.searchPatternFlyDocs';
import { stringJoin } from './server.helpers';
import { log } from './logger';

/**
 * usePatternFlyDocs tool function
 *
 * @param options
 * @returns MCP tool tuple [name, schema, callback]
 */
const usePatternFlyDocsTool = (options = getOptions()): McpTool => {
  const callback = async (args: any = {}) => {
    const { name } = args;
    const isName = typeof name === 'string' && name.trim().length > 0;
    const hasUri = isName && new RegExp('patternfly://', 'i').test(name);

    if (hasUri) {
      throw new McpError(
        ErrorCode.InvalidParams,
        stringJoin.basic(
          'Direct "patternfly://" URIs are not supported as tool inputs, and are intended to be used directly.',
          'Use a component "name" to fetch documentation.'
        )
      );
    }

    if (!isName) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Provide a string "name" of a PatternFly component (e.g., "Button", "Alert").`
      );
    }

    if (name.length > options.maxSearchLength) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `String "name" exceeds maximum length of ${options.maxSearchLength} characters.`
      );
    }

    const data = await fetchComponentData.memo(name, ['docs', 'props'], options);

    if (!data) {
      // Component not found — try fuzzy search for suggestions
      const { searchResults } = await searchComponents.memo(name, {}, options);
      const suggestions = searchResults.map(result => result.item).slice(0, 3);
      const suggestionMessage = suggestions.length
        ? `Did you mean ${suggestions.map(suggestion => `"${suggestion}"`).join(', ')}?`
        : 'No similar components found.';

      throw new McpError(
        ErrorCode.InvalidParams,
        `Component "${name.trim()}" not found. ${suggestionMessage}`
      );
    }

    const sections: string[] = [];

    if (data.docs) {
      sections.push(stringJoin.newline(
        `# Documentation for ${data.name}`,
        '',
        data.docs
      ));
    }

    if (data.props) {
      sections.push(stringJoin.newline(
        `# Props for ${data.name}`,
        '',
        data.props
      ));
    }

    if (data.examples && data.examples.length > 0) {
      sections.push(stringJoin.newline(
        `# Examples for ${data.name}`,
        '',
        ...data.examples
      ));
    }

    if (data.css) {
      sections.push(stringJoin.newline(
        `# CSS Variables for ${data.name}`,
        '',
        data.css
      ));
    }

    if (sections.length === 0) {
      log.warn(`usePatternFlyDocs: component "${name}" found but no content available`);

      return {
        content: [{
          type: 'text',
          text: `Component "${name}" was found but no documentation content is available.`
        }]
      };
    }

    return {
      content: [{
        type: 'text',
        text: sections.join(options.separator)
      }]
    };
  };

  return [
    'usePatternFlyDocs',
    {
      description: `Get markdown documentation and component props for PatternFly components.

      **Usage**:
        1. Input a component name (e.g., "Button", "Alert") to fetch its documentation and props.

      **Returns**:
        - Markdown documentation
        - Component props as a formatted table
      `,
      inputSchema: {
        name: z.string().max(options.maxSearchLength).describe('The name of a PatternFly component to fetch documentation for (e.g., "Button", "Table")')
      }
    },
    callback
  ];
};

/**
 * A tool name, typically the first entry in the tuple. Used in logging and deduplication.
 */
usePatternFlyDocsTool.toolName = 'usePatternFlyDocs';

export { usePatternFlyDocsTool };

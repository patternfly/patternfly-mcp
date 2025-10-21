import { z } from 'zod';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { type McpTool } from './server';
import { processDocsFunction } from './server.getResources';
import { OPTIONS } from './options';
import { memo } from './server.caching';

/**
 * fetchDocs tool function (tuple pattern)
 *
 * @param options
 */
const fetchDocsTool = (options = OPTIONS): McpTool => {
  const memoProcess = memo(processDocsFunction, options.toolMemoOptions.fetchDocs);

  const callback = async (args: any = {}) => {
    const { urlList } = args;

    if (!urlList || !Array.isArray(urlList)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Missing required parameter: urlList (must be an array of strings): ${urlList}`
      );
    }

    let result: string;

    try {
      result = await memoProcess(urlList);
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to fetch documentation: ${error}`
      );
    }

    return {
      content: [
        {
          type: 'text',
          text: result
        }
      ]
    };
  };

  return [
    'fetchDocs',
    {
      description: 'Fetch documentation for one or more URLs extracted from previous tool calls responses. The URLs should be passed as an array in the "urlList" argument.',
      inputSchema: {
        urlList: z.array(z.string()).describe('The list of URLs to fetch documentation from')
      }
    },
    callback
  ];
};

export { fetchDocsTool };

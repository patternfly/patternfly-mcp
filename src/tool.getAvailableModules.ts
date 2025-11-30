import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { type McpTool } from './server';
import { memo } from './server.caching';
import { getLocalModulesMap } from './utils.getLocalModulesMap';

export const getAvailableModulesTool = (): McpTool => {
  const memoGetModulesMap = memo(
    getLocalModulesMap
  );

  const callback = async (args: any = {}) => {
    const { packageName } = args;

    if (typeof packageName !== 'string') {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Missing required parameter: packageName (must be a string): ${packageName}`
      );
    }
    let modulesList : string[] = [];

    try {
      // should be extended for other packages in the future
      const modulesMap = await memoGetModulesMap(packageName);

      // no need to return paths, just the module names, reduce the context size
      modulesList = Object.keys(modulesMap);
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to retrieve available modules: ${error}`
      );
    }

    return {
      content: [
        {
          type: 'text',
          // Modules separated by semicolons to save context space
          text: modulesList.join(';')
        }
      ]
    };
  };

  return [
    'getAvailableModules',
    {
      description: 'Retrieves a list of available Patternfly react-core modules in the current environment.',
      inputSchema: {
        packageName: z.enum(['@patternfly/react-core', '@patternfly/react-icons', '@patternfly/react-table', '@patternfly/react-data-view', '@patternfly/react-component-groups']).describe('Name of the patternfly package to get modules for. For tables its always better to use the @patternfly/react-data-view package.').default('@patternfly/react-core')
      }
    },
    callback
  ];
};

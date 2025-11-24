import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

import { type McpTool } from './server';
import { memo } from './server.caching';
import { getLocalModulesMap } from './utils.getLocalModulesMap';

export const getAvailableModulesTool = (): McpTool => {
  const memoGetModulesMap = memo(
    getLocalModulesMap
  );

  const callback = async () => {
    let modulesList : string[] = [];

    try {
      // should be extended for other packages in the future
      const modulesMap = await memoGetModulesMap('@patternfly/react-core');

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
      inputSchema: {}
    },
    callback
  ];
};

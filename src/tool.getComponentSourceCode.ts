import path from 'node:path';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { type McpTool } from './server';
import { memo } from './server.caching';
import { getLocalModulesMap } from './utils.getLocalModulesMap';
import { verifyLocalPackage } from './utils.verifyLocalPackage';
import { readFileAsync } from './utils.readFile';

export const getComponentSourceCode = (): McpTool => {
  const memoGetModulesMap = memo(
    getLocalModulesMap
  );

  const callback = async (args: any = {}) => {
    const { componentName, packageName: packageNameArg } = args;
    let fileContent: string;
    const packageName = packageNameArg || '@patternfly/react-core';

    if (typeof componentName !== 'string') {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Missing required parameter: componentName (must be a string): ${componentName}`
      );
    }

    // should be extended for other packages in the future
    const status = await verifyLocalPackage(packageName);

    if (!status.exists) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Package "${packageName}" not found locally. ${status.error ? status.error.message : ''}`
      );
    }
    const modulesMap = await memoGetModulesMap(packageName);
    const componentPath = modulesMap[componentName]?.replace(/^dist\/dynamic/, 'src');

    if (!componentPath) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `No valid path to "${componentName}" found in available modules.`
      );
    }

    const componentDir = `${status.packageRoot}/${componentPath}`;
    // TODO: We can also try to get directly to the component file first before checking re-exports
    const indexFile = path.join(componentDir, 'index.ts');

    const indexSource = await readFileAsync(`${componentDir}/index.ts`, 'utf-8');

    if (!indexSource) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to read index.ts for component "${componentName}".`
      );
    }

    const lines = indexSource.split('\n');
    // TODO: the modules map does not provide paths for everything, need to improve that
    const searchPattern = new RegExp(`'\\./${componentName}';?$`);
    const importPartial = lines.find(line => searchPattern.test(line));

    if (typeof importPartial === 'undefined' || !importPartial) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to find source code for component "${componentName}".`
      );
    }

    const importPath = importPartial.split('from')[1]?.trim().replace(/['";]/g, '');

    if (!importPath) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to parse import path for component "${componentName}".`
      );
    }

    const absolutePath = path.resolve(indexFile.replace('/index.ts', ''), importPath + '.ts');
    const absolutePathX = path.resolve(indexFile.replace('/index.ts', ''), importPath + '.tsx');

    try {
      fileContent = await readFileAsync(absolutePath, 'utf-8');
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      try {
        fileContent = await readFileAsync(absolutePathX, 'utf-8');
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to read source code file for component "${componentName}": ${error}`
        );
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: fileContent
        }
      ]
    };
  };

  return [
    'getComponentSourceCode',
    {
      description: 'Retrieve a source code of a specified Patternfly react-core module in the current environment.',
      inputSchema: {
        componentName: z.string().describe('Name of the PatternFly component (e.g., "Button", "Table")'),
        packageName: z.enum(['@patternfly/react-core', '@patternfly/react-table', '@patternfly/react-data-view', '@patternfly/react-component-groups']).optional().describe('Name of the patternfly package to get component from. For tables its always better to use the @patternfly/react-data-view package.').default('@patternfly/react-core')
      }
    },
    callback
  ];
};

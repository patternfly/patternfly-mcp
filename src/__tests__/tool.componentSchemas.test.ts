import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { componentSchemasTool } from '../tool.componentSchemas';
import { isPlainObject } from '../server.helpers';

// Mock dependencies
jest.mock('../server.caching', () => ({
  memo: jest.fn(fn => fn)
}));

describe('componentSchemasTool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should have a consistent return structure', () => {
    const tool = componentSchemasTool();

    expect({
      name: tool[0],
      schema: isPlainObject(tool[1]),
      callback: tool[2]
    }).toMatchSnapshot('structure');
  });
});

describe('componentSchemasTool, callback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    {
      description: 'default',
      componentName: 'Button'
    },
    {
      description: 'with trimmed componentName',
      componentName: ' Button  '
    },
    {
      description: 'with lower case componentName',
      componentName: 'button'
    },
    {
      description: 'with upper case componentName',
      componentName: 'BUTTON'
    }
  ])('should parse parameters, $description', async ({ componentName }) => {
    const [_name, _schema, callback] = componentSchemasTool();
    const result = await callback({ componentName });

    expect(result).toMatchSnapshot();
  });

  it.each([
    {
      description: 'with missing or undefined componentName',
      error: 'Missing required parameter: componentName',
      componentName: undefined
    },
    {
      description: 'with null componentName',
      error: 'Missing required parameter: componentName',
      componentName: null
    },
    {
      description: 'with empty componentName',
      error: 'No similar components found',
      componentName: ''
    },
    {
      description: 'with non-string componentName',
      error: 'Missing required parameter: componentName',
      componentName: 123
    },
    {
      description: 'with non-existent component',
      error: 'Component "NonExistentComponent" not found',
      componentName: 'NonExistentComponent'
    }
  ])('should handle errors, $description', async ({ error, componentName }) => {
    const [_name, _schema, callback] = componentSchemasTool();

    await expect(callback({ componentName })).rejects.toThrow(McpError);
    await expect(callback({ componentName })).rejects.toThrow(error);
  });
});

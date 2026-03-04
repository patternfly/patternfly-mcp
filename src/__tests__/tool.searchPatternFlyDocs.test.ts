import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { searchPatternFlyDocsTool } from '../tool.searchPatternFlyDocs';
import { isPlainObject } from '../server.helpers';

// Mock dependencies
jest.mock('../server.caching', () => ({
  memo: jest.fn(fn => fn)
}));

describe('searchPatternFlyDocsTool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should have a consistent return structure', () => {
    const tool = searchPatternFlyDocsTool();

    expect({
      name: tool[0],
      schema: isPlainObject(tool[1]),
      callback: tool[2]
    }).toMatchSnapshot('structure');
  });
});

describe('searchPatternFlyDocsTool, callback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    {
      description: 'default',
      searchQuery: 'Button'
    },
    {
      description: 'with trimmed componentName',
      searchQuery: ' Button  '
    },
    {
      description: 'with lower case componentName',
      searchQuery: 'button'
    },
    {
      description: 'with upper case componentName',
      searchQuery: 'BUTTON'
    },
    {
      description: 'with explicit valid version',
      searchQuery: 'Button',
      version: 'v6'
    },
    {
      description: 'with partial componentName',
      searchQuery: 'ton'
    },
    {
      description: 'with multiple words',
      searchQuery: 'Button Card Table'
    },
    {
      description: 'with made up componentName',
      searchQuery: 'lorem ipsum dolor sit amet'
    },
    {
      description: 'with "*" searchQuery all',
      searchQuery: '*'
    },
    {
      description: 'with "all" searchQuery all',
      searchQuery: 'ALL'
    }
  ])('should parse parameters, $description', async ({ searchQuery }) => {
    const [_name, _schema, callback] = searchPatternFlyDocsTool();
    const result = await callback({ searchQuery });

    expect(result.content[0].text.split('\n')[0]).toMatchSnapshot('search');
  });

  it.each([
    {
      description: 'with empty searchQuery',
      error: '"searchQuery" must be a string from',
      searchQuery: ''
    },
    {
      description: 'with missing or undefined searchQuery',
      error: '"searchQuery" must be a string from',
      searchQuery: undefined
    },
    {
      description: 'with null searchQuery',
      error: '"searchQuery" must be a string from',
      searchQuery: null
    },
    {
      description: 'with non-string searchQuery',
      error: '"searchQuery" must be a string from',
      searchQuery: 123
    }
  ])('should handle errors, $description', async ({ error, searchQuery }) => {
    const [_name, _schema, callback] = searchPatternFlyDocsTool();

    await expect(callback({ searchQuery })).rejects.toThrow(McpError);
    await expect(callback({ searchQuery })).rejects.toThrow(error);
  });
});

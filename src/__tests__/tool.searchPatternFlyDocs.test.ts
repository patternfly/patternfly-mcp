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
      searchQuery: 'Button',
      expected: '# Search results for PatternFly version "v6" and "Button". Showing'
    },
    {
      description: 'with trimmed componentName',
      searchQuery: ' Button  ',
      expected: '# Search results for PatternFly version "v6" and " Button  ". Showing'
    },
    {
      description: 'with lower case componentName',
      searchQuery: 'button',
      expected: '# Search results for PatternFly version "v6" and "button". Showing'
    },
    {
      description: 'with upper case componentName',
      searchQuery: 'BUTTON',
      expected: '# Search results for PatternFly version "v6" and "BUTTON". Showing'
    },
    {
      description: 'with explicit valid version',
      searchQuery: 'Button',
      version: 'v6',
      expected: '# Search results for PatternFly version "v6" and "Button". Showing'
    },
    {
      description: 'with partial componentName',
      searchQuery: 'ton',
      expected: '# Search results for PatternFly version "v6" and "ton". Showing'
    },
    {
      description: 'with multiple words',
      searchQuery: 'Button Card Table',
      expected: '# Search results for PatternFly version "v6" and "Button Card Table". Showing'
    },
    {
      description: 'with made up componentName',
      searchQuery: 'lorem ipsum dolor sit amet',
      expected: 'No PatternFly resources found matching'
    },
    {
      description: 'with "*" searchQuery all',
      searchQuery: '*',
      expected: '# Search results for PatternFly version "v6" and "all" resources. Only showing the first'
    },
    {
      description: 'with "all" searchQuery all',
      searchQuery: 'ALL',
      expected: '# Search results for PatternFly version "v6" and "all" resources. Only showing the first'
    }
  ])('should parse parameters, $description', async ({ searchQuery, version, expected }) => {
    const [_name, _schema, callback] = searchPatternFlyDocsTool();
    const updatedParams = version ? { searchQuery, version } : { searchQuery };
    const result = await callback(updatedParams);
    const firstLine = result.content[0].text.split('\n')[0];

    expect(firstLine).toContain(expected);
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
    },
    {
      description: 'with a non-existent version',
      error: '"version" must be one of the following values',
      searchQuery: 'button',
      version: 'v01'
    }
  ])('should handle errors, $description', async ({ error, searchQuery, version }) => {
    const [_name, _schema, callback] = searchPatternFlyDocsTool();
    const updatedParams = version ? { searchQuery, version } : { searchQuery };

    await expect(callback(updatedParams)).rejects.toThrow(McpError);
    await expect(callback(updatedParams)).rejects.toThrow(error);
  });

  it('should have a specific markdown format', async () => {
    const [_name, _schema, callback] = searchPatternFlyDocsTool();
    const result = await callback({ searchQuery: 'button' });

    expect(result.content).toMatchSnapshot('tooltip');
  });
});

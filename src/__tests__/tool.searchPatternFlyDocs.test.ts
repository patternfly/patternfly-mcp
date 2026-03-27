import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { searchPatternFly } from '../patternFly.search';
import { getPatternFlyMcpResources } from '../patternFly.getResources';
import { isPlainObject } from '../server.helpers';
import { searchPatternFlyDocsTool } from '../tool.searchPatternFlyDocs';

// Mock dependencies
jest.mock('../patternFly.search');
jest.mock('../patternFly.getResources');
jest.mock('../server.caching', () => ({
  memo: jest.fn(fn => fn)
}));

const mockSearch = searchPatternFly as jest.MockedFunction<typeof searchPatternFly>;
const mockGetResources = getPatternFlyMcpResources as jest.MockedFunction<typeof getPatternFlyMcpResources>;

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

    mockGetResources.mockResolvedValue({
      latestVersion: 'v6'
    } as any);

    mockSearch.mockResolvedValue({
      isSearchWildCardAll: false,
      exactMatches: [],
      remainingMatches: [],
      searchResults: [],
      totalPotentialMatches: 0
    } as any);
  });

  it.each([
    {
      description: 'exact match',
      searchQuery: 'button',
      searchValue: {
        totalPotentialMatches: 1
      }
    },
    {
      description: 'wildcard search',
      searchQuery: '*',
      searchValue: {
        isSearchWildCardAll: true,
        totalPotentialMatches: 50
      }
    }
  ])('should parse parameters, $description', async ({ searchValue, searchQuery }) => {
    mockSearch.mockResolvedValue({
      isSearchWildCardAll: false,
      exactMatches: [{
        name: 'button',
        entries: [{ displayName: 'Button', version: 'v6', description: 'Docs', path: 'pf/button.md' }],
        uri: 'patternfly://docs/button?version=v6',
        uriSchemas: 'patternfly://schemas/button?version=v6'
      }],
      remainingMatches: [],
      searchResults: [{ displayName: 'Button', version: 'v6', description: 'Docs', path: 'pf/button.md' }],
      ...searchValue
    } as any);

    const [_name, _schema, callback] = searchPatternFlyDocsTool();
    const result = await callback({ searchQuery });

    expect(mockSearch).toHaveBeenCalledTimes(1);
    expect(result.content[0].text).toBeDefined();
    expect(result.content[0].text.split('\n')[0]).toMatchSnapshot();
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
    mockSearch.mockResolvedValue({
      isSearchWildCardAll: false,
      exactMatches: [{
        name: 'button',
        entries: [{
          displayName: 'Button',
          version: 'v6',
          description: 'Design Guidelines',
          path: 'https://pf.org/button.md'
        }],
        uri: 'patternfly://docs/button?version=v6',
        uriSchemas: 'patternfly://schemas/button?version=v6'
      }],
      remainingMatches: [],
      searchResults: [{ displayName: 'Button', version: 'v6', description: 'Docs', path: 'pf/button.md' }],
      totalPotentialMatches: 1
    } as any);

    const [_name, _schema, callback] = searchPatternFlyDocsTool();
    const result = await callback({ searchQuery: 'button' });

    expect(result.content).toMatchSnapshot('Button');
  });
});

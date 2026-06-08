import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { searchPatternFly } from '../patternFly.search';
import { getPatternFlyMcpResources } from '../patternFly.getResources';
import { isPlainObject } from '../server.helpers';
import { searchPatternFlyTool } from '../tool.searchPatternFly';

// Mock dependencies
jest.mock('../patternFly.search');
jest.mock('../patternFly.getResources');
jest.mock('../server.caching', () => ({
  memo: jest.fn(fn => fn)
}));

const mockSearch = searchPatternFly as jest.MockedFunction<typeof searchPatternFly>;
const mockGetResources = getPatternFlyMcpResources as jest.MockedFunction<typeof getPatternFlyMcpResources>;

describe('searchPatternFlyTool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should have a consistent return structure', () => {
    const tool = searchPatternFlyTool();

    expect({
      name: tool[0],
      schema: isPlainObject(tool[1]),
      callback: tool[2]
    }).toMatchSnapshot('structure');
  });
});

describe('searchPatternFlyTool, callback', () => {
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
      query: 'button',
      searchValue: {
        totalPotentialMatches: 1
      }
    },
    {
      description: 'wildcard search',
      query: '*',
      searchValue: {
        isSearchWildCardAll: true,
        totalPotentialMatches: 50
      }
    }
  ])('should parse parameters, $description', async ({ searchValue, query }) => {
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

    const [_name, _schema, callback] = searchPatternFlyTool();
    const result = await callback({ query });

    expect(mockSearch).toHaveBeenCalledTimes(1);
    expect(result.content[0].text).toBeDefined();
    expect(result.content[0].text.split('\n')[0]).toMatchSnapshot();
  });

  it.each([
    {
      description: 'with empty query',
      error: '"query" must be a string from',
      query: ''
    },
    {
      description: 'with missing or undefined query',
      error: '"query" must be a string from',
      query: undefined
    },
    {
      description: 'with null query',
      error: '"query" must be a string from',
      query: null
    },
    {
      description: 'with non-string query',
      error: '"query" must be a string from',
      query: 123
    },
    {
      description: 'with a non-existent version',
      error: '"version" must be one of the following values',
      query: 'button',
      version: 'v01'
    }
  ])('should handle errors, $description', async ({ error, query, version }) => {
    const [_name, _schema, callback] = searchPatternFlyTool();
    const updatedParams = version ? { query, version } : { query };

    await expect(callback(updatedParams)).rejects.toThrow(McpError);
    await expect(callback(updatedParams)).rejects.toThrow(error);
  });

  it('should have a specific markdown format', async () => {
    mockSearch.mockResolvedValue({
      isSearchWildCardAll: false,
      exactMatches: [
        {
          name: 'LoremButton',
          groupId: '654321',
          entries: [
            {
              displayName: 'Lorem Button',
              displayCategory: 'Guidelines',
              version: 'v6',
              description: 'Design Guidelines',
              path: 'https://pf.org/button.md',
              uriId: 'patternfly://docs/34567',
              uriSchemasId: 'patternfly://schemas/678e90'
            }, {
              displayName: 'Lorem Button',
              displayCategory: 'Design',
              version: 'v6',
              description: 'Design Guidelines',
              path: 'https://pf.org/button.md',
              uriId: 'patternfly://docs/e34567',
              uriSchemasId: 'patternfly://schemas/678e90'
            }
          ]
        },
        {
          name: 'Button',
          groupId: '123456',
          entries: [{
            displayName: 'Button',
            displayCategory: 'Design',
            version: 'v6',
            description: 'Design Guidelines',
            path: 'https://pf.org/button.md',
            uriId: 'patternfly://docs/34567b',
            uriSchemasId: 'patternfly://schemas/67b890'
          }]
        }
      ],
      remainingMatches: [],
      searchResults: [{ displayName: 'Button', version: 'v6', description: 'Docs', path: 'pf/button.md' }],
      totalPotentialMatches: 5
    } as any);

    const [_name, _schema, callback] = searchPatternFlyTool();
    const result = await callback({ query: 'button' });

    expect(result.content).toMatchSnapshot('Button');
  });
});

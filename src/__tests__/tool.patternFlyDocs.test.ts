import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { processDocsFunction } from '../server.getResources';
import { getPatternFlyComponentSchema, getPatternFlyMcpResources, setCategoryDisplayLabel } from '../patternFly.getResources';
import { searchPatternFly } from '../patternFly.search';
import { isPlainObject } from '../server.helpers';
import { usePatternFlyDocsTool } from '../tool.patternFlyDocs';

// Mock dependencies
jest.mock('../server.getResources');
jest.mock('../patternFly.getResources');
jest.mock('../patternFly.search');
jest.mock('../server.caching', () => ({
  memo: jest.fn(fn => fn)
}));

const mockProcessDocs = processDocsFunction as jest.MockedFunction<typeof processDocsFunction>;
const mockComponentSchema = getPatternFlyComponentSchema as jest.MockedFunction<typeof getPatternFlyComponentSchema>;
const mockGetResources = getPatternFlyMcpResources as jest.MockedFunction<typeof getPatternFlyMcpResources>;
const mockSearch = searchPatternFly as jest.MockedFunction<typeof searchPatternFly>;
const mockSetCategoryLabel = setCategoryDisplayLabel as jest.MockedFunction<typeof setCategoryDisplayLabel>;

describe('usePatternFlyDocsTool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should have a consistent return structure', () => {
    const tool = usePatternFlyDocsTool();

    expect({
      name: tool[0],
      schema: isPlainObject(tool[1]),
      callback: tool[2]
    }).toMatchSnapshot('structure');
  });
});

describe('usePatternFlyDocsTool, callback', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockGetResources.mockResolvedValue({
      latestVersion: 'v6',
      latestSchemasVersion: 'v6',
      byPath: {
        'components/loremButton.md': { name: 'button', version: 'v6', displayName: 'Button' }
      }
    } as any);

    mockSearch.mockResolvedValue({
      exactMatches: [{ entries: [{ path: 'components/loremButton.md' }] }],
      searchResults: []
    } as any);

    mockSetCategoryLabel.mockImplementation(entry => entry?.category || 'Documentation');
  });

  it.each([
    {
      description: 'single file, mock path',
      processedValue: {
        path: 'components/button.md',
        content: 'single documentation content'
      },
      urlList: ['components/button.md']
    },
    {
      description: 'multiple files, mock paths',
      processedValue: {
        path: 'components/button.md',
        content: 'combined documentation content'
      },
      urlList: ['components/button.md', 'components/card.md', 'components/table.md']
    },
    {
      description: 'with invalid urlList',
      processedValue: {
        path: 'invalid-path',
        content: 'Failed to load'
      },
      urlList: ['invalid-url']
    },
    {
      description: 'with name and actual path',
      processedValue: {
        path: 'documentation:chatbot/README.md',
        content: 'chatbot documentation content'
      },
      name: 'chatbot'
    }
  ])('should attempt to parse parameters, $description', async ({ processedValue, urlList, name }) => {
    mockProcessDocs.mockResolvedValue([processedValue] as any);
    const [_name, _schema, callback] = usePatternFlyDocsTool();
    const result = await callback({ urlList, name });

    expect(mockProcessDocs).toHaveBeenCalledTimes(1);
    expect(result.content[0].text).toBeDefined();
    expect(result.content[0].text.split('\n')[0]).toMatchSnapshot();
  });

  it.each([
    {
      description: 'with missing or undefined urlList',
      error: 'Provide either a string',
      urlList: undefined
    },
    {
      description: 'with null urlList',
      error: 'Provide either a string',
      urlList: null
    },
    {
      description: 'when urlList is not an array',
      error: 'Provide either a string',
      urlList: 'not-an-array'
    },
    {
      description: 'with empty files',
      error: 'array must contain strings',
      urlList: ['components/button.md', '', '   ', 'components/card.md', 'components/table.md']
    },
    {
      description: 'with empty urlList',
      error: 'Provide either a string',
      urlList: []
    },
    {
      description: 'with empty strings in a urlList',
      error: 'array must contain strings',
      urlList: ['', ' ']
    },
    {
      description: 'with both urlList and name',
      error: 'Provide either a string',
      urlList: ['components/button.md'],
      name: 'lorem ipsum'
    }
  ])('should handle errors, $description', async ({ error, urlList, name }) => {
    const [_name, _schema, callback] = usePatternFlyDocsTool();

    await expect(callback({ urlList, name })).rejects.toThrow(McpError);
    await expect(callback({ urlList, name })).rejects.toThrow(error);
  });

  it('should handle processing errors', async () => {
    mockProcessDocs.mockRejectedValue(new Error('File not found'));
    const [_name, _schema, callback] = usePatternFlyDocsTool();

    await expect(callback({ urlList: ['https://www.patternfly.org//missing.md'] })).rejects.toThrow(McpError);
    await expect(callback({ urlList: ['https://www.patternfly.org/missing.md'] })).rejects.toThrow('Failed to fetch documentation');
  });

  it('should have a specific markdown format', async () => {
    mockProcessDocs.mockResolvedValue([
      {
        path: 'components/loremButton.md',
        content: 'lorem documentation content'
      },
      {
        path: 'components/ipsumButton.md',
        content: 'ipsum documentation content'
      }
    ] as any);

    mockComponentSchema.mockResolvedValue({
      $schema: 'http://json-schema.org/draft-07/schema#',
      title: 'Button',
      type: 'object',
      properties: {
        variant: { type: 'string' }
      }
    } as any);

    const [_name, _schema, callback] = usePatternFlyDocsTool();
    const result = await callback({ name: 'button' });

    expect(result.content).toMatchSnapshot('Button');
  });
});

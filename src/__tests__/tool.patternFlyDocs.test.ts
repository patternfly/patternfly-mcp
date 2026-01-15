import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { usePatternFlyDocsTool } from '../tool.patternFlyDocs';
import { processDocsFunction } from '../server.getResources';
import { isPlainObject } from '../server.helpers';

// Mock dependencies
jest.mock('../server.getResources');
jest.mock('../server.caching', () => ({
  memo: jest.fn(fn => fn)
}));

const mockProcessDocs = processDocsFunction as jest.MockedFunction<typeof processDocsFunction>;

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
  });

  it.each([
    {
      description: 'default',
      value: 'components/button.md',
      urlList: ['components/button.md']
    },
    {
      description: 'multiple files',
      value: 'combined docs content',
      urlList: ['components/button.md', 'components/card.md', 'components/table.md']
    },
    {
      description: 'with invalid urlList',
      value: 'invalid path',
      urlList: ['invalid-url']
    },
    {
      description: 'with name',
      value: 'button content',
      name: 'button'
    }
  ])('should parse parameters, $description', async ({ value, urlList, name }) => {
    mockProcessDocs.mockResolvedValue([{ content: value }] as any);
    const [_name, _schema, callback] = usePatternFlyDocsTool();
    const result = await callback({ urlList, name });

    expect(mockProcessDocs).toHaveBeenCalledTimes(1);
    expect(result.content[0].text).toBeDefined();
    expect(result.content[0].text.startsWith('# Documentation from')).toBe(true);
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
      error: 'Provide either a string',
      urlList: ['components/button.md', '', '   ', 'components/card.md', 'components/table.md']
    },
    {
      description: 'with empty urlList',
      error: 'Provide either a string',
      urlList: []
    },
    {
      description: 'with empty strings in a urlList',
      error: 'Provide either a string',
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

    await expect(callback({ urlList: ['missing.md'] })).rejects.toThrow(McpError);
    await expect(callback({ urlList: ['missing.md'] })).rejects.toThrow('Failed to fetch documentation');
  });
});

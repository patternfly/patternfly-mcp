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
      description: 'with empty files',
      value: 'trimmed content',
      urlList: ['components/button.md', '', '   ', 'components/card.md', 'components/table.md']
    },
    {
      description: 'with empty urlList',
      value: 'empty content',
      urlList: []
    },
    {
      description: 'with empty strings in a urlList',
      value: 'trimmed and empty content',
      urlList: ['', ' ']
    },
    {
      description: 'with invalid urlList',
      value: 'invalid path',
      urlList: ['invalid-url']
    }
  ])('should parse parameters, $description', async ({ value, urlList }) => {
    mockProcessDocs.mockResolvedValue(value);
    const [_name, _schema, callback] = usePatternFlyDocsTool();
    const result = await callback({ urlList });

    expect(mockProcessDocs).toHaveBeenCalledWith(urlList);
    expect(result).toMatchSnapshot();
  });

  it.each([
    {
      description: 'with missing or undefined urlList',
      error: 'Missing required parameter: urlList',
      urlList: undefined
    },
    {
      description: 'with null urlList',
      error: 'Missing required parameter: urlList',
      urlList: null
    },
    {
      description: 'when urlList is not an array',
      error: 'must be an array of strings',
      urlList: 'not-an-array'
    }
  ])('should handle errors, $description', async ({ error, urlList }) => {
    const [_name, _schema, callback] = usePatternFlyDocsTool();

    await expect(callback({ urlList })).rejects.toThrow(McpError);
    await expect(callback({ urlList })).rejects.toThrow(error);
  });

  it('should handle processing errors', async () => {
    mockProcessDocs.mockRejectedValue(new Error('File not found'));
    const [_name, _schema, callback] = usePatternFlyDocsTool();

    await expect(callback({ urlList: ['missing.md'] })).rejects.toThrow(McpError);
    await expect(callback({ urlList: ['missing.md'] })).rejects.toThrow('Failed to fetch documentation');
  });
});

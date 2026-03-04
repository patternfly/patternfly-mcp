import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { usePatternFlyDocsTool } from '../tool.patternFlyDocs';
import { fetchComponentData } from '../api.fetcher';
import { searchComponents } from '../tool.searchPatternFlyDocs';
import { isPlainObject } from '../server.helpers';

jest.mock('../api.fetcher');
jest.mock('../tool.searchPatternFlyDocs');
jest.mock('../server.caching', () => ({
  memo: jest.fn(fn => fn)
}));

const mockFetchComponentData = fetchComponentData as jest.MockedFunction<typeof fetchComponentData>;
const mockSearchComponents = searchComponents as jest.MockedFunction<typeof searchComponents>;

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
      description: 'with docs only',
      name: 'Button',
      data: { name: 'Button', info: {} as any, docs: '# Button docs' }
    },
    {
      description: 'with docs and props',
      name: 'Alert',
      data: { name: 'Alert', info: {} as any, docs: '# Alert docs', props: '| Prop | Type |\n|---|---|' }
    },
    {
      description: 'with docs, props, and examples',
      name: 'Card',
      data: { name: 'Card', info: {} as any, docs: '# Card docs', props: '| Prop | Type |', examples: ['### Example: Basic\n\n```tsx\ncode\n```'] }
    },
    {
      description: 'with all data types',
      name: 'Table',
      data: { name: 'Table', info: {} as any, docs: '# Table docs', props: '| Prop | Type |', examples: ['example'], css: '| Variable | Value |' }
    }
  ])('should return documentation, $description', async ({ name, data }) => {
    mockFetchComponentData.mockResolvedValue(data);
    const [_name, _schema, callback] = usePatternFlyDocsTool();
    const result = await callback({ name });

    expect(result.content[0].text).toBeDefined();
    expect(result.content[0].text).toContain(name);
  });

  it('should suggest alternatives when component not found', async () => {
    mockFetchComponentData.mockResolvedValue(undefined);
    mockSearchComponents.mockResolvedValue({
      isSearchWildCardAll: false,
      firstExactMatch: undefined,
      exactMatches: [],
      searchResults: [{ item: 'Button', matchType: 'fuzzy', distance: 2 } as any]
    });

    const [_name, _schema, callback] = usePatternFlyDocsTool();

    await expect(callback({ name: 'Buttn' })).rejects.toThrow(McpError);
    await expect(callback({ name: 'Buttn' })).rejects.toThrow('Component "Buttn" not found');
  });

  it.each([
    {
      description: 'with missing or undefined name',
      error: 'Provide a string "name"',
      name: undefined
    },
    {
      description: 'with null name',
      error: 'Provide a string "name"',
      name: null
    },
    {
      description: 'with empty name',
      error: 'Provide a string "name"',
      name: '   '
    },
    {
      description: 'with non-string name',
      error: 'Provide a string "name"',
      name: 123
    }
  ])('should handle errors, $description', async ({ error, name }) => {
    const [_name, _schema, callback] = usePatternFlyDocsTool();

    await expect(callback({ name })).rejects.toThrow(McpError);
    await expect(callback({ name })).rejects.toThrow(error);
  });

  it('should handle patternfly:// URI input', async () => {
    const [_name, _schema, callback] = usePatternFlyDocsTool();

    await expect(callback({ name: 'patternfly://docs/Button' })).rejects.toThrow(McpError);
    await expect(callback({ name: 'patternfly://docs/Button' })).rejects.toThrow('Direct "patternfly://" URIs are not supported');
  });

  it('should return message when component found but no content available', async () => {
    mockFetchComponentData.mockResolvedValue({ name: 'Empty', info: {} as any });
    const [_name, _schema, callback] = usePatternFlyDocsTool();
    const result = await callback({ name: 'Empty' });

    expect(result.content[0].text).toContain('no documentation content is available');
  });
});

import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { patternFlySchemasTemplateResource } from '../resource.patternFlySchemasTemplate';
import { fetchComponentData } from '../api.fetcher';
import { searchComponents } from '../tool.searchPatternFlyDocs';
import { isPlainObject } from '../server.helpers';

jest.mock('../api.fetcher');
jest.mock('../tool.searchPatternFlyDocs');
jest.mock('../server.caching', () => ({
  memo: jest.fn(fn => fn)
}));
jest.mock('../options.context', () => ({
  getOptions: jest.fn(() => ({}))
}));

const mockFetchComponentData = fetchComponentData as jest.MockedFunction<typeof fetchComponentData>;
const mockSearchComponents = searchComponents as jest.MockedFunction<typeof searchComponents>;

describe('patternFlySchemasTemplateResource', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should have a consistent return structure', () => {
    const resource = patternFlySchemasTemplateResource();

    expect({
      name: resource[0],
      uri: resource[1],
      config: isPlainObject(resource[2]),
      handler: resource[3]
    }).toMatchSnapshot('structure');
  });
});

describe('patternFlySchemasTemplateResource, callback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    {
      description: 'with missing or undefined name',
      error: 'Missing required parameter: name must be a string',
      variables: {}
    },
    {
      description: 'with null name',
      error: 'Missing required parameter: name must be a string',
      variables: { name: null }
    },
    {
      description: 'with empty name',
      error: 'Missing required parameter: name must be a string',
      variables: { name: '' }
    },
    {
      description: 'with non-string name',
      error: 'Missing required parameter: name must be a string',
      variables: { name: 123 }
    }
  ])('should handle variable errors, $description', async ({ error, variables }) => {
    const [_name, _uri, _config, callback] = patternFlySchemasTemplateResource();
    const uri = new URL('patternfly://schemas/test');

    await expect(callback(uri, variables)).rejects.toThrow(McpError);
    await expect(callback(uri, variables)).rejects.toThrow(error);
  });

  it('should return props when component found', async () => {
    mockFetchComponentData.mockResolvedValue({
      name: 'Button',
      info: {} as any,
      props: '| Prop | Type | Default |\n|---|---|---|\n| variant | string | primary |'
    });

    const [_name, _uri, _config, callback] = patternFlySchemasTemplateResource();
    const uri = new URL('patternfly://schemas/Button');
    const variables = { name: 'Button' };
    const result = await callback(uri, variables);

    expect(result.contents).toBeDefined();
    expect(result.contents[0].mimeType).toBe('text/markdown');
    expect(result.contents[0].text).toContain('# Props for Button');
    expect(result.contents[0].text).toContain('| Prop | Type | Default |');
  });

  it('should handle component not found', async () => {
    mockFetchComponentData.mockResolvedValue(undefined);
    mockSearchComponents.mockResolvedValue({
      isSearchWildCardAll: false,
      firstExactMatch: undefined,
      exactMatches: [],
      searchResults: []
    });

    const [_name, _uri, _config, handler] = patternFlySchemasTemplateResource();
    const uri = new URL('patternfly://schemas/DolorSitAmet');
    const variables = { name: 'DolorSitAmet' };

    await expect(handler(uri, variables)).rejects.toThrow(McpError);
    await expect(handler(uri, variables)).rejects.toThrow('Component "DolorSitAmet" not found');
  });

  it('should handle component found but props not available', async () => {
    mockFetchComponentData.mockResolvedValue({
      name: 'Button',
      info: {} as any
    });
    mockSearchComponents.mockResolvedValue({
      isSearchWildCardAll: false,
      firstExactMatch: undefined,
      exactMatches: [],
      searchResults: []
    });

    const [_name, _uri, _config, handler] = patternFlySchemasTemplateResource();
    const uri = new URL('patternfly://schemas/Button');
    const variables = { name: 'Button' };

    await expect(handler(uri, variables)).rejects.toThrow(McpError);
    await expect(handler(uri, variables)).rejects.toThrow('Component "Button" found but prop schema not available');
  });
});

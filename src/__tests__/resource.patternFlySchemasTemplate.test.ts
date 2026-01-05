import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { getComponentSchema } from '../tool.patternFlyDocs';
import { patternFlySchemasTemplateResource } from '../resource.patternFlySchemasTemplate';
import { searchComponents } from '../tool.searchPatternFlyDocs';
import { isPlainObject } from '../server.helpers';

// Mock dependencies
jest.mock('../tool.searchPatternFlyDocs');
jest.mock('../tool.patternFlyDocs');
jest.mock('../server.caching', () => ({
  memo: jest.fn(fn => fn)
}));
jest.mock('../options.context', () => ({
  getOptions: jest.fn(() => ({}))
}));

const mockGetComponentSchema = getComponentSchema as jest.MockedFunction<typeof getComponentSchema>;
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

  it('should handle missing exact match and missing schema errors', async () => {
    mockSearchComponents.mockReturnValue({
      isSearchWildCardAll: false,
      firstExactMatch: undefined,
      exactMatches: [],
      searchResults: []
    });
    mockGetComponentSchema.mockReturnValue(undefined as any);

    const [_name, _uri, _config, handler] = patternFlySchemasTemplateResource();
    const uri = new URL('patternfly://schemas/DolorSitAmet');
    const variables = { name: 'DolorSitAmet' };

    await expect(handler(uri, variables)).rejects.toThrow(McpError);
    await expect(handler(uri, variables)).rejects.toThrow('Component "DolorSitAmet" not found');
  });

  it('should handle exact match but missing schema errors', async () => {
    mockSearchComponents.mockReturnValue({
      isSearchWildCardAll: false,
      firstExactMatch: undefined,
      exactMatches: [{ item: 'Button', urls: [] } as any],
      searchResults: []
    });
    mockGetComponentSchema.mockReturnValue(undefined as any);

    const [_name, _uri, _config, handler] = patternFlySchemasTemplateResource();
    const uri = new URL('patternfly://schemas/DolorSitAmet');
    const variables = { name: 'Button' };

    await expect(handler(uri, variables)).rejects.toThrow(McpError);
    await expect(handler(uri, variables)).rejects.toThrow('Component "Button" found');
  });
});

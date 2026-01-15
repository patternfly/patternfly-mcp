import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { patternFlyDocsTemplateResource } from '../resource.patternFlyDocsTemplate';
import { processDocsFunction } from '../server.getResources';
import { searchComponents } from '../tool.searchPatternFlyDocs';
import { isPlainObject } from '../server.helpers';

// Mock dependencies
jest.mock('../server.getResources');
jest.mock('../tool.searchPatternFlyDocs');
jest.mock('../server.caching', () => ({
  memo: jest.fn(fn => fn)
}));
jest.mock('../options.context', () => ({
  getOptions: jest.fn(() => ({}))
}));

const mockProcessDocs = processDocsFunction as jest.MockedFunction<typeof processDocsFunction>;
const mockSearchComponents = searchComponents as jest.MockedFunction<typeof searchComponents>;

describe('patternFlyDocsTemplateResource', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should have a consistent return structure', () => {
    const resource = patternFlyDocsTemplateResource();

    expect({
      name: resource[0],
      uri: resource[1],
      config: isPlainObject(resource[2]),
      handler: resource[3]
    }).toMatchSnapshot('structure');
  });
});

describe('patternFlyDocsTemplateResource, callback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    {
      description: 'default',
      name: 'Button',
      urls: ['components/button.md'],
      result: 'Button documentation content'
    },
    {
      description: 'with multiple matched URLs',
      name: 'Card',
      urls: ['components/card.md', 'components/card-examples.md'],
      result: 'Card documentation content'
    },
    {
      description: 'with trimmed name',
      name: '  Table  ',
      urls: ['components/table.md'],
      result: 'Table documentation content'
    },
    {
      description: 'with lower case name',
      name: 'button',
      urls: ['components/button.md'],
      result: 'Button documentation content'
    }
  ])('should parse parameters and return documentation, $description', async ({ name, urls, result: mockResult }) => {
    mockSearchComponents.mockReturnValue({
      isSearchWildCardAll: false,
      firstExactMatch: undefined,
      exactMatches: [{ urls } as any],
      searchResults: []
    });
    mockProcessDocs.mockResolvedValue([{ content: mockResult }] as any);

    const [_name, _uri, _config, callback] = patternFlyDocsTemplateResource();
    const uri = new URL('patternfly://docs/Button');
    const variables = { name };
    const result = await callback(uri, variables);

    expect(mockSearchComponents).toHaveBeenCalledWith(name);
    expect(mockProcessDocs).toHaveBeenCalledWith(urls);

    expect(result.contents).toBeDefined();
    expect(Object.keys(result.contents[0])).toEqual(['uri', 'mimeType', 'text']);
    expect(result.contents[0].text).toContain(mockResult);
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
    const [_name, _uri, _config, callback] = patternFlyDocsTemplateResource();
    const uri = new URL('patternfly://docs/test');

    await expect(callback(uri, variables)).rejects.toThrow(McpError);
    await expect(callback(uri, variables)).rejects.toThrow(error);
  });

  it('should handle documentation loading errors', async () => {
    mockSearchComponents.mockReturnValue({
      isSearchWildCardAll: false,
      firstExactMatch: undefined,
      exactMatches: [],
      searchResults: []
    });
    mockProcessDocs.mockRejectedValue(new Error('File not found'));

    const [_name, _uri, _config, handler] = patternFlyDocsTemplateResource();
    const uri = new URL('patternfly://docs/Button');
    const variables = { name: 'Button' };

    await expect(handler(uri, variables)).rejects.toThrow(McpError);
    await expect(handler(uri, variables)).rejects.toThrow('No documentation found');
  });
});

import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { patternFlySchemasTemplateResource, uriNameComplete, resourceCallback } from '../resource.patternFlySchemasTemplate';
import { isPlainObject } from '../server.helpers';

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

describe('uriNameComplete', () => {
  it.each([
    {
      description: 'with empty string',
      value: '',
      expected: 5
    },
    {
      description: 'with lowercased name',
      value: 'button',
      expected: 1
    },
    {
      description: 'with uppercased name',
      value: 'BUTTON',
      expected: 1
    },
    {
      description: 'with mixed case name',
      value: 'bUTTON',
      expected: 1
    },
    {
      description: 'with empty space and name',
      value: '  BUTTON  ',
      expected: 1
    }
  ])('should attempt to return PatternFly component names, $description', async ({ value, expected }) => {
    const result = await uriNameComplete(value);

    expect(result.length).toBeGreaterThanOrEqual(expected);
  });
});

describe('resourceCallback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    {
      description: 'default',
      variables: {
        name: 'Button'
      }
    },
    {
      description: 'with lowercased name',
      variables: {
        name: 'button'
      }
    }
  ])('should attempt to return resource content, $description', async ({ variables }) => {
    const mockContent = '$schema';

    const result = await resourceCallback(
      { href: `patternfly://schemas/v6/${variables.name}` } as any,
      variables
    );

    expect(result.contents).toBeDefined();
    expect(Object.keys(result.contents[0] as any)).toEqual(['uri', 'mimeType', 'text']);
    expect(result.contents[0]?.text).toContain(mockContent);
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
    },
    {
      description: 'non-existent name',
      error: 'not found',
      variables: { name: 'loremIpsum' }
    },
    {
      description: 'found but no schema',
      error: 'found but JSON schema not available',
      variables: { name: 'table' }
    }
  ])('should handle variable errors, $description', async ({ error, variables }) => {
    const uri = new URL('patternfly://schemas/v6');

    await expect(resourceCallback(uri, variables as any)).rejects.toThrow(McpError);
    await expect(resourceCallback(uri, variables as any)).rejects.toThrow(error);
  });
});

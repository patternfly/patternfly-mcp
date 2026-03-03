import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { patternFlySchemasTemplateResource, resourceCallback } from '../resource.patternFlySchemasTemplate';
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

describe('resourceCallback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    { description: 'no version', variables: { name: 'Button' } },
    {
      description: 'default',
      variables: {
        name: 'Button',
        version: 'v6'
      }
    },
    {
      description: 'with lowercased name',
      variables: {
        name: 'button',
        version: 'v6'
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
      description: 'invalid version',
      error: 'Invalid PatternFly version',
      variables: {
        name: 'Button',
        version: 'v5'
      }
    },
    {
      description: 'with missing or undefined name',
      error: 'must be a string',
      variables: {}
    },
    {
      description: 'with null name',
      error: 'must be a string',
      variables: {
        name: null
      }
    },
    {
      description: 'with empty name',
      error: 'must be a string',
      variables: {
        name: ''
      }
    },
    {
      description: 'with non-string name',
      error: 'must be a string',
      variables: {
        name: 123
      }
    },
    {
      description: 'non-existent name',
      error: 'No component JSON schemas found',
      variables: {
        name: 'loremIpsum',
        version: 'v6'
      }
    },
    {
      description: 'found but no schema',
      error: 'No component JSON schemas found',
      variables: {
        name: 'table',
        version: 'v6'
      }
    }
  ])('should handle variable errors, $description', async ({ error, variables }) => {
    await expect(resourceCallback(undefined as any, variables as any)).rejects.toThrow(McpError);
    await expect(resourceCallback(undefined as any, variables as any)).rejects.toThrow(error);
  });
});

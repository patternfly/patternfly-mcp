import { McpError } from '@modelcontextprotocol/sdk/types.js';
import {
  patternFlyComponentsIndexResource,
  resourceCallback
} from '../resource.patternFlyComponentsIndex';
import { isPlainObject } from '../server.helpers';

describe('patternFlyComponentsIndexResource', () => {
  it('should have a consistent return structure', () => {
    const resource = patternFlyComponentsIndexResource();

    expect({
      name: resource[0],
      uri: resource[1],
      config: isPlainObject(resource[2]),
      handler: resource[3]
    }).toMatchSnapshot('structure');
  });
});

describe('resourceCallback', () => {
  it.each([
    {
      description: 'default',
      variables: {},
      expected: '# PatternFly Component Names Index for "v6"'
    },
    {
      description: 'explicit valid version',
      variables: {
        version: 'v6'
      },
      expected: '# PatternFly Component Names Index for "v6"'
    },
    {
      description: 'category',
      variables: {
        category: 'accessibility'
      },
      expected: '?category=accessibility'
    }
  ])('should return context content, $description', async ({ variables, expected }) => {
    const result = await resourceCallback(undefined as any, variables);

    expect(result.contents).toBeDefined();
    expect(Object.keys(result.contents[0] as any)).toEqual(['uri', 'mimeType', 'text']);
    expect(result.contents[0]?.text).toContain(expected);
  });

  it.each([
    {
      description: 'available version',
      variables: {
        version: 'v5'
      },
      error: 'Invalid PatternFly version'
    }
  ])('should handle variable errors, $description', async ({ error, variables }) => {
    await expect(resourceCallback(undefined as any, variables as any)).rejects.toThrow(McpError);
    await expect(resourceCallback(undefined as any, variables as any)).rejects.toThrow(error);
  });
});

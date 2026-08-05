import { McpError } from '@modelcontextprotocol/sdk/types.js';
import {
  patternFlySchemasTemplateResource,
  uriNameComplete,
  resourceCallback
} from '../resource.patternFlySchemasTemplate';
import { isPlainObject } from '../server.helpers';
import { getPatternFlyComponentSchema } from '../patternFly.getResources';
import { paramCompletion } from '../resource.helpers';
import { filterPatternFly } from '../patternFly.search';

jest.mock('../resource.helpers', () => ({
  ...jest.requireActual('../resource.helpers'),
  paramCompletion: jest.fn()
}));

jest.mock('../patternFly.getResources', () => ({
  ...jest.requireActual('../patternFly.getResources'),
  getPatternFlyComponentSchema: { memo: jest.fn() }
}));

jest.mock('../patternFly.search', () => ({
  ...jest.requireActual('../patternFly.search'),
  filterPatternFly: { memo: jest.fn() }
}));

const MockParamCompletion = paramCompletion as jest.MockedFunction<typeof paramCompletion>;
const MockGetSchema = getPatternFlyComponentSchema.memo as jest.MockedFunction<typeof getPatternFlyComponentSchema.memo>;
const MockFilter = filterPatternFly.memo as jest.MockedFunction<typeof filterPatternFly.memo>;

describe('patternFlySchemasTemplateResource', () => {
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
  it('should attempt to return PatternFly component names on completion', async () => {
    MockParamCompletion.mockResolvedValue({ names: [] } as any);

    const value = 'BUTTON';

    await uriNameComplete(value);

    expect(MockParamCompletion).toHaveBeenCalledWith(expect.objectContaining({ name: value }));
  });
});

describe('resourceCallback', () => {
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
    },
    {
      description: 'with hashed button name',
      variables: {
        name: 'ffcfb1b9b852a17ccb5b2adc12e3edd4a4ee41cb',
        version: 'v6'
      }
    }
  ])('should attempt to return resource content, $description', async ({ variables }) => {
    const resource = {
      name: 'button',
      isSchemasAvailable: true,
      uriSchemasId: `patternfly://schemas/${variables.version}/${variables.name}`
    };

    MockFilter.mockResolvedValue({
      byResource: new Map([['button', resource]])
    } as any);
    MockGetSchema.mockResolvedValue({ $schema: 'https://json-schema.org/draft-07' } as any);

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
    },
    {
      description: 'wrong version',
      error: 'Invalid PatternFly version',
      variables: {
        name: 'button',
        version: 'v5'
      }
    }
  ])('should handle variable errors, $description', async ({ error, variables }) => {
    MockFilter.mockResolvedValue({ byResource: new Map() } as any);
    MockGetSchema.mockResolvedValue(undefined);

    await expect(resourceCallback(undefined as any, variables as any)).rejects.toThrow(McpError);
    await expect(resourceCallback(undefined as any, variables as any)).rejects.toThrow(error);
  });
});

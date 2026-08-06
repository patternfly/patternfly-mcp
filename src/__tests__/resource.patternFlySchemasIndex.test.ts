import { McpError } from '@modelcontextprotocol/sdk/types.js';
import {
  patternFlySchemasIndexResource,
  listResources,
  resourceCallback
} from '../resource.patternFlySchemasIndex';
import { isPlainObject } from '../server.helpers';
import { getPatternFlyMcpResources } from '../patternFly.getResources';
import { filterPatternFly } from '../patternFly.search';

jest.mock('../patternFly.getResources', () => ({
  ...jest.requireActual('../patternFly.getResources'),
  getPatternFlyMcpResources: { memo: jest.fn() }
}));

jest.mock('../patternFly.search', () => ({
  ...jest.requireActual('../patternFly.search'),
  filterPatternFly: { memo: jest.fn() }
}));

const MockMcpResources = getPatternFlyMcpResources.memo as jest.MockedFunction<typeof getPatternFlyMcpResources.memo>;
const MockFilter = filterPatternFly.memo as jest.MockedFunction<typeof filterPatternFly.memo>;

describe('patternFlySchemasIndexResource', () => {
  it('should have a consistent return structure', () => {
    const resource = patternFlySchemasIndexResource();

    expect({
      name: resource[0],
      uri: resource[1],
      config: isPlainObject(resource[2]),
      handler: resource[3]
    }).toMatchSnapshot('structure');
  });
});

describe('listResources', () => {
  it('should return a list of resources', async () => {
    MockMcpResources.mockResolvedValue({
      availableSchemasVersions: ['v6'],
      byVersionComponentNames: new Map([['v6', ['button', 'table']]])
    } as any);

    const resources = await listResources();

    expect(resources.resources).toBeDefined();

    const everyResourceSameProperties = resources.resources.every((obj: any) =>
      Boolean(obj.uri) &&
      /^patternfly:\/\/schemas\//.test(obj.uri) &&
      Boolean(obj.name) &&
      Boolean(obj.mimeType) &&
      Boolean(obj.description));

    expect(everyResourceSameProperties).toBe(true);
  });
});

describe('resourceCallback', () => {
  it.each([
    {
      description: 'default',
      variables: {},
      expected: '# PatternFly Component JSON Schemas Index for "v6"'
    },
    {
      description: 'explicit valid version',
      variables: {
        version: 'v6'
      },
      expected: '# PatternFly Component JSON Schemas Index for "v6"'
    }
  ])('should return component schemas index, $description', async ({ variables, expected }) => {
    MockMcpResources.mockResolvedValue({ availableSchemasVersions: ['v6'], latestSchemasVersion: 'v6' } as any);
    MockFilter.mockResolvedValue({
      byResource: new Map([
        ['button', {
          name: 'Button',
          uriSchemas: 'patternfly://schemas/v6/button'
        }]
      ])
    } as any);

    const result = await resourceCallback(undefined as any, variables);

    expect(result.contents).toBeDefined();
    expect(Object.keys(result.contents[0] as any)).toEqual(['uri', 'mimeType', 'text']);
    expect(result.contents[0]?.text).toContain(expected);
  });

  it.each([
    {
      description: 'version',
      variables: {
        version: 'v5'
      },
      error: 'Invalid PatternFly version'
    }
  ])('should handle variable errors, $description', async ({ error, variables }) => {
    MockMcpResources.mockResolvedValue({ availableSchemasVersions: ['v6'], latestSchemasVersion: 'v6' } as any);
    MockFilter.mockResolvedValue({ byResource: new Map() } as any);

    await expect(resourceCallback(undefined as any, variables as any)).rejects.toThrow(McpError);
    await expect(resourceCallback(undefined as any, variables as any)).rejects.toThrow(error);
  });
});

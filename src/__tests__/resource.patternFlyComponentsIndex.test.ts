import { McpError } from '@modelcontextprotocol/sdk/types.js';
import {
  patternFlyComponentsIndexResource,
  listResources,
  resourceCallback
} from '../resource.patternFlyComponentsIndex';
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

describe('listResources', () => {
  it('should return a list of resources', async () => {
    MockMcpResources.mockResolvedValue({
      availableVersions: ['v6'],
      byVersionComponentNames: new Map([['v6', ['button', 'table']]])
    } as any);

    const resources = await listResources();

    expect(resources.resources).toBeDefined();

    const everyResourceSameProperties = resources.resources.every((obj: any) =>
      Boolean(obj.uri) &&
      /^patternfly:\/\/components\//.test(obj.uri) &&
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
      expected: '# PatternFly Components Index for "v6"'
    },
    {
      description: 'explicit valid version',
      variables: {
        version: 'v6'
      },
      expected: '# PatternFly Components Index for "v6"'
    },
    {
      description: 'category',
      variables: {
        category: 'accessibility'
      },
      expected: 'category=accessibility'
    }
  ])('should return context content, $description', async ({ variables, expected }) => {
    MockMcpResources.mockResolvedValue({ availableVersions: ['v6'], latestVersion: 'v6' } as any);
    MockFilter.mockResolvedValue({
      byResource: new Map([
        ['button', { name: 'Button', uri: 'patternfly://components/button' }]
      ])
    } as any);

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
    MockMcpResources.mockResolvedValue({ availableVersions: ['v6'], latestVersion: 'v6' } as any);
    MockFilter.mockResolvedValue({ byResource: new Map() } as any);

    await expect(resourceCallback(undefined as any, variables as any)).rejects.toThrow(McpError);
    await expect(resourceCallback(undefined as any, variables as any)).rejects.toThrow(error);
  });
});

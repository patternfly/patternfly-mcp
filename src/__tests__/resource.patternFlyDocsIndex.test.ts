import { McpError } from '@modelcontextprotocol/sdk/types.js';
import {
  patternFlyDocsIndexResource,
  listResources,
  uriNameComplete,
  uriCategoryComplete,
  uriSectionComplete,
  uriVersionComplete,
  resourceCallback
} from '../resource.patternFlyDocsIndex';
import { isPlainObject } from '../server.helpers';
import { getPatternFlyMcpResources } from '../patternFly.getResources';
import { filterPatternFly } from '../patternFly.search';
import { paramCompletion } from '../resource.helpers';

jest.mock('../patternFly.getResources', () => ({
  ...jest.requireActual('../patternFly.getResources'),
  getPatternFlyMcpResources: { memo: jest.fn() }
}));

jest.mock('../patternFly.search', () => ({
  ...jest.requireActual('../patternFly.search'),
  filterPatternFly: { memo: jest.fn() }
}));

jest.mock('../resource.helpers', () => ({
  ...jest.requireActual('../resource.helpers'),
  paramCompletion: jest.fn()
}));

const MockMcpResources = getPatternFlyMcpResources.memo as jest.MockedFunction<typeof getPatternFlyMcpResources.memo>;
const MockFilter = filterPatternFly.memo as jest.MockedFunction<typeof filterPatternFly.memo>;
const MockParamCompletion = paramCompletion as jest.MockedFunction<typeof paramCompletion>;

describe('patternFlyDocsIndexResource', () => {
  it('should have a consistent return structure', () => {
    const resource = patternFlyDocsIndexResource();

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
    MockMcpResources.mockResolvedValue({ availableVersions: ['v6'], byVersion: { v6: [] } } as any);

    const resources = await listResources();

    expect(resources.resources).toBeDefined();

    const everyResourceSameProperties = resources.resources.every((obj: any) =>
      Boolean(obj.uri) &&
      /^patternfly:\/\/docs\//.test(obj.uri) &&
      Boolean(obj.name) &&
      Boolean(obj.mimeType) &&
      Boolean(obj.description));

    expect(everyResourceSameProperties).toBe(true);
  });
});

describe('uriNameComplete', () => {
  it('should attempt to return PatternFly component names on completion', async () => {
    MockParamCompletion.mockResolvedValue({ names: ['Button'] } as any);

    const result = await uriNameComplete('button');

    expect(MockParamCompletion).toHaveBeenCalledWith(expect.objectContaining({ name: 'button' }));
    expect(result).toEqual(['Button']);
  });
});

describe('uriCategoryComplete', () => {
  it('should attempt to return categories on completion', async () => {
    MockParamCompletion.mockResolvedValue({ categories: ['accessibility'] } as any);

    const result = await uriCategoryComplete('ac');

    expect(MockParamCompletion).toHaveBeenCalledWith(expect.objectContaining({ category: 'ac' }));
    expect(result).toEqual(['accessibility']);
  });
});

describe('uriSectionComplete', () => {
  it('should attempt to return sections on completion', async () => {
    MockParamCompletion.mockResolvedValue({ sections: ['components'] } as any);

    const result = await uriSectionComplete('co');

    expect(MockParamCompletion).toHaveBeenCalledWith(expect.objectContaining({ section: 'co' }));
    expect(result).toEqual(['components']);
  });
});

describe('uriVersionComplete', () => {
  it('should attempt to return versions on completion', async () => {
    MockParamCompletion.mockResolvedValue({ versions: ['v6'] } as any);

    const result = await uriVersionComplete('v6');

    expect(MockParamCompletion).toHaveBeenCalledWith(expect.objectContaining({ version: 'v6' }));
    expect(result).toEqual(['v6']);
  });
});

describe('resourceCallback', () => {
  it.each([
    {
      description: 'default',
      variables: {},
      expected: '# PatternFly Documentation Index for "v6"'
    },
    {
      description: 'explicit valid version',
      variables: {
        version: 'v6'
      },
      expected: '# PatternFly Documentation Index for "v6"'
    },
    {
      description: 'category',
      variables: {
        category: 'accessibility'
      },
      expected: 'category=accessibility'
    },
    {
      description: 'section',
      variables: {
        section: 'components'
      },
      expected: 'section=components'
    },
    {
      description: 'category and section',
      variables: {
        category: 'accessibility',
        section: 'components'
      },
      expected: 'category=accessibility&section=components'
    }
  ])('should return context content, $description', async ({ variables, expected }) => {
    MockMcpResources.mockResolvedValue({ availableVersions: ['v6'], latestVersion: 'v6' } as any);
    MockFilter.mockResolvedValue({
      byResource: new Map([
        ['button', {
          name: 'Button',
          uri: 'patternfly://docs/v6/button',
          entries: [{ version: 'v6', displayCategory: 'accessibility' }]
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

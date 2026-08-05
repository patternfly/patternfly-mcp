import { readFile } from 'node:fs/promises';
import { ReadableStream } from 'node:stream/web';
import { McpError } from '@modelcontextprotocol/sdk/types.js';
import {
  patternFlyDocsTemplateResource,
  resourceCallback
} from '../resource.patternFlyDocsTemplate';
import { isPlainObject } from '../server.helpers';
import { getPatternFlyMcpResources } from '../patternFly.getResources';
import { filterPatternFly } from '../patternFly.search';

jest.mock('node:fs/promises', () => ({
  ...jest.requireActual('node:fs/promises'),
  readFile: jest.fn()
}));

jest.mock('../patternFly.getResources', () => ({
  ...jest.requireActual('../patternFly.getResources'),
  getPatternFlyMcpResources: { memo: jest.fn() }
}));

jest.mock('../patternFly.search', () => ({
  ...jest.requireActual('../patternFly.search'),
  filterPatternFly: { memo: jest.fn() }
}));

const mockReadFile = readFile as jest.MockedFunction<typeof readFile>;
const MockMcpResources = getPatternFlyMcpResources.memo as jest.MockedFunction<typeof getPatternFlyMcpResources.memo>;
const MockFilter = filterPatternFly.memo as jest.MockedFunction<typeof filterPatternFly.memo>;

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

describe('resourceCallback', () => {
  let mockFetch: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue('markdown content'),
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('markdown content'));
          controller.close();
        }
      })
    } as any);
  });

  afterEach(() => {
    mockFetch.mockRestore();
  });

  it.each([
    {
      description: 'no version',
      variables: {
        name: 'Button'
      }
    },
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
      description: 'with local documentation',
      variables: {
        name: 'chatbot',
        version: 'v6'
      }
    }
  ])('should attempt to return resource content, $description', async ({ variables }) => {
    MockMcpResources.mockResolvedValue({
      availableVersions: ['v6'],
      latestVersion: 'v6'
    } as any);

    MockFilter.mockResolvedValue({
      byEntry: [{
        path: `docs/${variables.name}.md`,
        uriId: `patternfly://docs/v6/${variables.name}`,
        uriSchemasId: undefined,
        displayName: variables.name
      }]
    } as any);

    const mockContent = `Mock content for ${variables.name}`;

    mockReadFile.mockResolvedValue(mockContent);
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: {
        get: (name: string) => (name === 'content-type' ? 'text/plain' : null)
      },
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(mockContent));
          controller.close();
        }
      })
    } as any);

    const result = await resourceCallback(
      { href: `patternfly://docs/${variables.version}/${variables.name}` } as any,
      variables
    );

    expect(result.contents).toBeDefined();
    expect(Object.keys(result.contents[0] as any)).toEqual(['uri', 'mimeType', 'text']);
    expect(result.contents[0]?.text).toMatch(new RegExp(mockContent, 'i'));
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
      variables: {
        version: 'v6'
      }
    },
    {
      description: 'with null name',
      error: 'must be a string',
      variables: {
        name: null,
        version: 'v6'
      }
    },
    {
      description: 'with empty name',
      error: 'must be a string',
      variables: {
        name: '',
        version: 'v6'
      }
    },
    {
      description: 'with non-string name',
      error: 'must be a string',
      variables: {
        name: 123,
        version: 'v6'
      }
    },
    {
      description: 'non-existent name, missing version',
      error: 'No documentation found for "loremIpsum". Try using different parameters',
      variables: {
        name: 'loremIpsum',
        category: 'react'
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
    MockMcpResources.mockResolvedValue({ availableVersions: ['v6'], latestVersion: 'v6' } as any);
    MockFilter.mockResolvedValue({ byEntry: [] } as any);

    const mockContent = `Mock content for ${variables.name}`;

    mockReadFile.mockResolvedValue(mockContent);
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: {
        get: (name: string) => (name === 'content-type' ? 'text/plain' : null)
      },
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(mockContent));
          controller.close();
        }
      })
    } as any);

    const uri = new URL('patternfly://docs/test');

    await expect(resourceCallback(uri, variables as any)).rejects.toThrow(McpError);
    await expect(resourceCallback(uri, variables as any)).rejects.toThrow(error);
  });
});

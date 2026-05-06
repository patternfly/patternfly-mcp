import { readFile } from 'node:fs/promises';
import { McpError } from '@modelcontextprotocol/sdk/types.js';
import {
  patternFlyDocsTemplateResource,
  resourceCallback
} from '../resource.patternFlyDocsTemplate';
import { isPlainObject } from '../server.helpers';
import { GITHUB_AI_GUIDELINES_DIRECTORY_FIXTURE } from './fixtures/githubAiGuidelinesDirectory';

const getFetchUrl = (input: RequestInfo | URL): string => {
  if (typeof input === 'string') {
    return input;
  }

  if (input instanceof URL) {
    return input.href;
  }

  if (typeof input === 'object' && input !== null && 'url' in input && typeof (input as Request).url === 'string') {
    return (input as Request).url;
  }

  return String(input);
};

jest.mock('node:fs/promises', () => ({
  ...jest.requireActual('node:fs/promises'),
  readFile: jest.fn()
}));

const mockReadFile = readFile as jest.MockedFunction<typeof readFile>;

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
    mockFetch = jest.spyOn(global, 'fetch');
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
    const mockContent = `Mock content for ${variables.name}`;

    mockReadFile.mockResolvedValue(mockContent);
    mockFetch.mockImplementation(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const urlStr = getFetchUrl(input);

      if (urlStr.includes('api.github.com/repos/project-felt/ai-guidelines')) {
        return new Response(JSON.stringify(GITHUB_AI_GUIDELINES_DIRECTORY_FIXTURE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return {
        ok: true,
        text: async () => mockContent
      } as Response;
    });

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
    const mockContent = `Mock content for ${variables.name}`;

    mockReadFile.mockResolvedValue(mockContent);
    mockFetch.mockImplementation(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const urlStr = getFetchUrl(input);

      if (urlStr.includes('api.github.com/repos/project-felt/ai-guidelines')) {
        return new Response(JSON.stringify(GITHUB_AI_GUIDELINES_DIRECTORY_FIXTURE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return {
        ok: true,
        text: async () => mockContent
      } as Response;
    });

    const uri = new URL('patternfly://docs/test');

    await expect(resourceCallback(uri, variables as any)).rejects.toThrow(McpError);
    await expect(resourceCallback(uri, variables as any)).rejects.toThrow(error);
  });
});

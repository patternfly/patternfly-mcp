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
  it.each([
    {
      description: 'with empty string',
      value: '',
      expected: 10
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

describe('uriCategoryComplete', () => {
  it.each([
    {
      description: 'all',
      value: ''
    },
    {
      description: 'prefix',
      value: 'ac'
    },
    {
      description: 'suffix',
      value: 'es'
    },
    {
      description: 'exact',
      value: 'accessibility'
    }
  ])('should attempt to return a category, $description', async ({ value }) => {
    const result = await uriCategoryComplete(value);

    expect(result.length).toBeGreaterThan(0);
    expect(result.join(', ')).toEqual(expect.stringContaining(value));
  });

  it('should not return any values for non-existant categories', async () => {
    const result = await uriCategoryComplete('lorem');

    expect(result.length).toBe(0);
  });
});

describe('uriSectionComplete', () => {
  it.each([
    {
      description: 'all',
      value: ''
    },
    {
      description: 'prefix',
      value: 'co'
    },
    {
      description: 'suffix',
      value: 'ts'
    },
    {
      description: 'exact',
      value: 'components'
    }
  ])('should attempt to return a section, $description', async ({ value }) => {
    const result = await uriSectionComplete(value);

    expect(result.length).toBeGreaterThan(0);
    expect(result.join(', ')).toEqual(expect.stringContaining(value));
  });

  it('should not return any values for non-existent section', async () => {
    const result = await uriSectionComplete('lorem');

    expect(result.length).toBe(0);
  });
});

describe('uriVersionComplete', () => {
  it.each([
    {
      description: 'all',
      value: '',
      expected: 'v6'
    },
    {
      description: 'exact',
      value: 'v6',
      expected: 'v6'
    },
    {
      description: 'exact, casing',
      value: 'V6',
      expected: 'v6'
    },
    {
      description: 'enumerated, current',
      value: 'current',
      expected: 'v6'
    },
    {
      description: 'enumerated, latest',
      value: 'latest',
      expected: 'v6'
    }
  ])('should attempt to return a version, $description', async ({ value, expected }) => {
    const result = await uriVersionComplete(value);

    expect(result.length).toBeGreaterThan(0);
    expect(result.join(', ')).toEqual(expect.stringContaining(expected));
  });

  it.each([
    {
      description: 'prefix',
      value: 'v'
    },
    {
      description: 'suffix',
      value: '6'
    },
    {
      description: 'non-existent',
      value: 'lorem'
    }
  ])('should not return any values, $description', async ({ value }) => {
    const result = await uriVersionComplete(value);

    expect(result.length).toBe(0);
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
      expected: '?category=accessibility'
    },
    {
      description: 'section',
      variables: {
        section: 'components'
      },
      expected: '?section=components'
    },
    {
      description: 'category and section',
      variables: {
        category: 'accessibility',
        section: 'components'
      },
      expected: '?category=accessibility&section=components'
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

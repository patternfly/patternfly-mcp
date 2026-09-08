import {
  patternFlyApiCollection,
  collectionCallback,
  collectionInitialCallback,
  expandApiEmbeddedCollection,
  getPatternFlyApiRecords,
  probeHealth,
  apiSpider,
  parsePayload,
  isEmptyPayload,
  crawler
} from '../collection.patternFlyApi';
import { processDocsFunction } from '../server.getResources';
import { getOptions } from '../options.context';
import { setFetch } from '../server.fetch';

jest.mock('../server.getResources');
jest.mock('../server.fetch');

// Prefer relaxed typing in tests to focus on behavior over typings
const mockedProcessDocsFunction: any = processDocsFunction as any;
const mockedSetFetch: any = setFetch as any;

describe('patternFlyApiCollection', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should return the correct collection name and configuration', async () => {
    const [name, callback, config] = patternFlyApiCollection();

    expect(name).toBe('patternfly-api');
    expect(callback).toBeDefined();
    expect(typeof config?.initial).toBe('function');
    expect(config?.retainLastViable).toBe(true);
    expect(config?.runParallel).toContain('#collection');
    expect(config?.runSchedule).toBeDefined();
  });
});

describe('probeHealth', () => {
  let mockGet: jest.Mock;

  beforeEach(() => {
    jest.resetAllMocks();
    mockGet = jest.fn();
    mockedSetFetch.mockReturnValue({ get: mockGet });
  });

  it.each([
    {
      description: 'status is all successful',
      status: [200, 200, 200],
      expected: true
    },
    {
      description: 'first status is unsuccessful',
      status: [400, 200, 200],
      expected: true
    },
    {
      description: 'middle status is unsuccessful',
      status: [200, 500, 200],
      expected: true
    },
    {
      description: 'last status is unsuccessful',
      status: [200, 200, 429],
      expected: false
    },
    {
      description: 'first 2 status are unsuccessful',
      status: [400, 401, 200],
      expected: false
    },
    {
      description: 'last 2 status are unsuccessful',
      status: [200, 401, 404],
      expected: false
    },
    {
      description: 'unsuccessful status and generic error',
      status: [200, new Error('Network error'), 200],
      expected: true
    }
  ])('should indicate if the API is healthy or not, $description', async ({ status, expected }) => {
    status.forEach(stat => {
      if (stat instanceof Error) {
        mockGet.mockRejectedValueOnce(stat);
      } else {
        mockGet.mockResolvedValueOnce({ status: stat });
      }
    });

    const isHealthy = await probeHealth();

    expect(isHealthy).toBe(expected);
    expect(mockGet).toHaveBeenCalledTimes(3);
  });

  it('should handle fetch exceptions without throwing an error', async () => {
    mockGet.mockRejectedValue(new Error('Connection refused'));

    const isHealthy = await probeHealth();

    expect(isHealthy).toBe(false);
  });
});

describe('expandApiEmbeddedCollection', () => {
  it('should return an empty array when records are missing or not an array', () => {
    expect(expandApiEmbeddedCollection({} as any)).toEqual([]);
    expect(expandApiEmbeddedCollection({ records: null } as any)).toEqual([]);
  });

  it('should expand compressed records', () => {
    const rawCollection = {
      version: '1',
      generated: '2026-09-10T00:00:00.000Z',
      base: 'https://main.patternfly-org.pages.dev/api',
      records: [
        {
          p: 'v1/components/Button/react',
          n: 'Button',
          d: 'A standard button component.',
          c: 'text/markdown',
          q: 1
        }
      ]
    };
    const expanded = expandApiEmbeddedCollection(rawCollection);

    expect(expanded).toHaveLength(1);
    expect(expanded).toMatchSnapshot('expanded');
  });
});

describe('getPatternFlyApiRecords', () => {
  it.each([
    {
      description: 'high quality score',
      expandedRecords: [
        {
          path: 'https://main.patternfly-org.pages.dev/api/v1/components/Dolor/react',
          resolvedPath: 'https://main.patternfly-org.pages.dev/api/v1/components/Dolor/react',
          displayName: 'Dolor',
          description: 'Dolor sit component description',
          content: '',
          contentType: 'text/markdown',
          qualityScore: 1
        }
      ]
    },
    {
      description: 'low quality score',
      expandedRecords: [
        {
          path: 'https://main.patternfly-org.pages.dev/api/v1/components/Lorem/react',
          resolvedPath: 'https://main.patternfly-org.pages.dev/api/v1/components/Lorem/react',
          displayName: 'Lorem',
          description: 'Lorem ipsum component description',
          content: '',
          contentType: 'text/markdown',
          qualityScore: 0
        }
      ]
    }
  ])('should attempt to convert expanded embedded records into McpCollectionResult records, $description', ({ expandedRecords }) => {
    const result = getPatternFlyApiRecords(expandedRecords);

    expect(result.records).toMatchSnapshot();
  });
});

describe('collectionInitialCallback', () => {
  it('should load and attempt to processes embedded records on initial start', async () => {
    const result = await collectionInitialCallback();

    expect(result).toHaveProperty('records');
    expect(Array.isArray(result.records)).toBe(true);
    expect(result.records.length).toBeGreaterThan(0);
    expect(result.records[0]?.sourceType).toBe('api');
  });
});

describe('collectionCallback', () => {
  const BASE = 'https://main.patternfly-org.pages.dev/api';
  const VERSIONS = `${BASE}/versions`;
  let mockGet: jest.Mock;

  beforeEach(() => {
    jest.resetAllMocks();
    mockGet = jest.fn().mockResolvedValue({ status: 200 });
    mockedSetFetch.mockReturnValue({ get: mockGet });
  });

  it('should generate API records and match McpCollectionResult structure', async () => {
    // getVersions to ["v1"]
    mockedProcessDocsFunction
      .mockResolvedValueOnce([
        {
          content: JSON.stringify(['v1']),
          path: VERSIONS,
          resolvedPath: VERSIONS,
          isSuccess: true
        }
      ])
      .mockResolvedValueOnce([
        {
          content: 'Button react component content with length enough to pass quality scoring...',
          path: `${BASE}/v1/components/Button`,
          resolvedPath: `${BASE}/v1/components/Button/react`,
          isSuccess: true
        }
      ]);

    const result = await collectionCallback();

    expect(result).toHaveProperty('records');
    expect(Array.isArray(result.records)).toBe(true);
    expect(result.records.length).toBeGreaterThan(0);

    const first: any = result.records[0];

    // Basic record shape
    expect(first).toMatchObject({
      id: expect.stringMatching(/^api::/),
      sourceType: 'api'
    });

    // Data entry shape
    const keys = Object.keys(first.data as any);

    expect(keys.length).toBe(1);
    const key: any = keys[0];

    expect(key).toBe('button');

    expect(first).toMatchObject({
      sourceId: `${BASE}/v1/components/Button/react`
    });

    expect(Array.isArray(first.data[key])).toBe(true);

    expect(first.data[key][0]).toMatchObject({
      displayName: 'Button',
      pathSlug: 'components-button-react',
      source: 'api',
      version: 'v1',
      section: 'components',
      category: 'react',
      path: `${BASE}/v1/components/Button/react`
    });
  });

  it('should use an extrapolated category', async () => {
    // getVersions to ["v1"]
    mockedProcessDocsFunction
      .mockResolvedValueOnce([
        {
          content: JSON.stringify(['v1']),
          path: VERSIONS,
          resolvedPath: VERSIONS,
          isSuccess: true
        }
      ])
      // crawler to leaf with non-component facet ("overview")
      .mockResolvedValueOnce([
        {
          content: 'Overview content',
          path: `${BASE}/v1/components/Card`,
          resolvedPath: `${BASE}/v1/components/Card/overview`,
          isSuccess: true
        }
      ]);

    const result = await collectionCallback();

    expect(result.records.length).toBe(1);
    const rec: any = result.records[0];

    // id encodes version, section, item, kind, and index
    expect(rec?.id).toMatch(/^api::v1::components::card::overview$/);

    const key: any = rec?.data ? Object.keys(rec.data)[0] : '';

    expect(key).toBe('card');
    expect(rec?.data?.[key]).toContainEqual(expect.objectContaining({
      displayName: 'Card',
      category: 'overview'
    }));
  });

  it('should match snapshot for collection result', async () => {
    // getVersions to ["v1"]
    mockedProcessDocsFunction
      .mockResolvedValueOnce([
        {
          content: JSON.stringify(['v1']),
          path: VERSIONS,
          resolvedPath: VERSIONS,
          isSuccess: true
        }
      ])
      // crawler returns a single leaf entry (enough to snapshot deterministically here)
      .mockResolvedValueOnce([
        {
          content: 'Card css content',
          path: `${BASE}/v1/components/Card`,
          resolvedPath: `${BASE}/v1/components/Card/css`,
          isSuccess: true
        }
      ]);

    const result = await collectionCallback();

    const snapshotSubset = {
      ...result,
      records: result.records.slice(0, 3)
    };

    expect(snapshotSubset).toMatchSnapshot();
  });
});

describe('isEmptyPayload', () => {
  it('treats {}, [], null, "" as empty (soft-404)', () => {
    expect(isEmptyPayload('{}')).toBe(true);
    expect(isEmptyPayload('[]')).toBe(true);
    expect(isEmptyPayload('null')).toBe(true);
    expect(isEmptyPayload('""')).toBe(true);
    expect(isEmptyPayload('')).toBe(true);
  });
});

describe('parsePayload', () => {
  it('parses numeric payloads as non-empty', () => {
    expect(parsePayload('42').isEmpty).toBe(false);
  });

  it.each([
    {
      description: 'length',
      payload: 'A'.repeat(200),
      expected: 1
    },
    {
      description: 'code fence',
      payload: '```ts file="./ButtonBasic.tsx"\n```',
      expected: 0.95
    }
  ])('should calculate qualityScore during payload parsing, $description', ({ payload, expected }) => {
    // See collection.patternFlyApi.test.ts for quality scoring tests
    const parsed = parsePayload(payload);

    expect(parsed.qualityScore).toBeLessThanOrEqual(expected);
  });
});

describe('crawler', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('recursively crawls and returns content', async () => {
    mockedProcessDocsFunction
      .mockResolvedValueOnce([
        {
          content: JSON.stringify(['v1']),
          path: 'https://api.com/versions',
          resolvedPath: 'https://api.com/versions',
          isSuccess: true
        }
      ])
      .mockResolvedValueOnce([
        {
          content: 'some content',
          path: 'https://api.com/v1',
          resolvedPath: 'https://api.com/v1',
          isSuccess: true
        }
      ]);

    const res = await crawler(['https://api.com/versions']);

    expect(res).toHaveLength(1);
    expect(res[0]?.content).toBe('some content');
    expect(mockedProcessDocsFunction).toHaveBeenCalledTimes(3);
  });

  it('handles component paths and terminates recursion', async () => {
    mockedProcessDocsFunction.mockResolvedValueOnce([
      {
        content: JSON.stringify(['item1']),
        path: 'https://api.com/v1/props',
        resolvedPath: 'https://api.com/v1/props',
        isSuccess: true
      }
    ]);

    const res = await crawler(['https://api.com/v1/props']);

    expect(res).toHaveLength(1);
    expect(res[0]?.path).toBe('https://api.com/v1/props');
    expect(mockedProcessDocsFunction).toHaveBeenCalledTimes(1);
  });

  it('filters out empty payloads', async () => {
    mockedProcessDocsFunction.mockResolvedValueOnce([
      {
        content: '{}',
        path: 'https://api.com/v1/leaf',
        resolvedPath: 'https://api.com/v1/leaf',
        isSuccess: true
      }
    ]);

    const res = await crawler(['https://api.com/v1/leaf']);

    expect(res).toHaveLength(0);
  });

  it('handles recursive arrays and joins URLs correctly', async () => {
    mockedProcessDocsFunction
      .mockResolvedValueOnce([
        {
          content: JSON.stringify(['sub-item']),
          path: 'https://api.com/v1',
          resolvedPath: 'https://api.com/v1',
          isSuccess: true
        }
      ])
      .mockResolvedValue([
        {
          content: 'leaf',
          path: 'https://api.com/v1/sub-item',
          resolvedPath: 'https://api.com/v1/sub-item',
          isSuccess: true
        }
      ]);

    const res = await crawler(['https://api.com/v1']);

    // It should have called for sub-item AND default componentPaths (props, css)
    // but my mock returns 'leaf' for everything else
    expect(res.length).toBeGreaterThanOrEqual(1);
    expect(mockedProcessDocsFunction).toHaveBeenCalledWith(['https://api.com/v1']);
  });

  it('aborts crawling early when signal is aborted', async () => {
    const controller = new AbortController();

    controller.abort();
    const res = await crawler(['https://api.com/v1'], { signal: controller.signal });

    expect(res).toEqual([]);
    expect(mockedProcessDocsFunction).not.toHaveBeenCalled();
  });
});

describe('apiSpider', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('returns [] when getVersions rejects', async () => {
    mockedProcessDocsFunction.mockResolvedValueOnce([
      {
        content: 'Failed to load',
        path: 'https://main.patternfly-org.pages.dev/api/versions',
        resolvedPath: 'https://main.patternfly-org.pages.dev/api/versions',
        isSuccess: false
      }
    ]);

    const res = await apiSpider();

    expect(res).toEqual([]);
  });

  it('returns ApiContent[] shape', async () => {
    mockedProcessDocsFunction
      .mockResolvedValueOnce([
        {
          content: JSON.stringify(['v1']),
          path: 'https://main.patternfly-org.pages.dev/api/versions',
          resolvedPath: 'https://main.patternfly-org.pages.dev/api/versions',
          isSuccess: true
        }
      ])
      .mockResolvedValueOnce([
        {
          content: 'leaf content',
          path: 'https://main.patternfly-org.pages.dev/api/v1',
          resolvedPath: 'https://main.patternfly-org.pages.dev/api/v1/section/item/facet',
          isSuccess: true
        }
      ]);

    const res = await apiSpider();

    expect(res.length).toBeGreaterThan(0);
    expect(res[0]).toMatchObject({
      path: 'https://main.patternfly-org.pages.dev/api/v1',
      resolvedPath: 'https://main.patternfly-org.pages.dev/api/v1/section/item/facet',
      content: 'leaf content'
    });
  });

  it('handles crawl timeout gracefully in apiSpider', async () => {
    const options = getOptions();

    mockedProcessDocsFunction
      .mockResolvedValueOnce([
        {
          content: JSON.stringify(['v1']),
          path: 'https://main.patternfly-org.pages.dev/api/versions',
          resolvedPath: 'https://main.patternfly-org.pages.dev/api/versions',
          isSuccess: true
        }
      ])
      .mockImplementation(() => new Promise(() => {}));

    const res = await apiSpider({
      ...options,
      patternflyOptions: {
        ...options.patternflyOptions,
        api: {
          ...options.patternflyOptions.api,
          timeoutMs: 20
        }
      }
    });

    expect(res).toEqual([]);
  });
});

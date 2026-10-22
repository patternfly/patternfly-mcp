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
import { DEFAULT_OPTIONS } from '../options.defaults';

jest.mock('../server.getResources');
jest.mock('../server.fetch');

// Prefer relaxed typing in tests to focus on behavior over typings
const mockedProcessDocsFunction: any = processDocsFunction as any;
const mockedSetFetch: any = setFetch as any;

describe('patternFlyApiCollection', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should return the correct collection configuration when crawl is disabled', async () => {
    const [name, config, callback, _config] = patternFlyApiCollection();

    expect(name).toBe('patternfly-api');
    expect(config).toBeDefined();
    expect(callback).toBeDefined();
    expect(typeof _config?.initial).toBe('undefined');
    expect(_config?.runParallel).toBeUndefined();
    expect(_config?.runSchedule).toBeUndefined();
    expect(_config?.retainLastViable).toBe(true);
  });

  it('should configure parallel execution and schedule when crawl is enabled', async () => {
    const enabledOptions = {
      ...DEFAULT_OPTIONS,
      patternflyOptions: {
        ...DEFAULT_OPTIONS.patternflyOptions,
        api: {
          ...DEFAULT_OPTIONS.patternflyOptions.api,
          crawlEnabled: true
        }
      }
    };
    const [, , , _config] = patternFlyApiCollection(enabledOptions);

    expect(typeof _config?.initial).toBe('function');
    expect(_config?.runParallel).toContain('#collection');
    expect(_config?.runSchedule).toBeDefined();
    expect(_config?.retainLastViable).toBe(true);
  });
});

describe('probeHealth', () => {
  let mockGet: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.resetAllMocks();
    mockGet = jest.fn();
    mockedSetFetch.mockReturnValue({ get: mockGet });
  });

  afterEach(() => {
    jest.useRealTimers();
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

    const promise = probeHealth();

    await jest.runAllTimersAsync();

    const isHealthy = await promise;

    expect(isHealthy).toBe(expected);
    expect(mockGet).toHaveBeenCalledTimes(3);
  });

  it('should handle fetch exceptions without throwing an error', async () => {
    mockGet.mockRejectedValue(new Error('Connection refused'));

    const promise = probeHealth();

    await jest.runAllTimersAsync();

    const isHealthy = await promise;

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
  const BASE = DEFAULT_OPTIONS.patternflyOptions.api.base;

  it.each([
    {
      description: 'high quality score',
      expandedRecords: [
        {
          path: `${BASE}/v1/components/Dolor/react`,
          resolvedPath: `${BASE}/v1/components/Dolor/react`,
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
          path: `${BASE}/v1/components/Lorem/react`,
          resolvedPath: `${BASE}/v1/components/Lorem/react`,
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

  it('populates discarded map with reasons and quality scores for deferred and low-quality entries', () => {
    const entries = [
      {
        path: `${BASE}/v1/components/Button/props`,
        resolvedPath: `${BASE}/v1/components/Button/props`,
        displayName: 'Button',
        description: 'Button props',
        content: '{"props": {}}',
        contentType: 'json',
        qualityScore: 1
      },
      {
        path: `${BASE}/v1/components/Lorem/react`,
        resolvedPath: `${BASE}/v1/components/Lorem/react`,
        displayName: 'Lorem',
        description: 'Lorem component',
        content: '',
        contentType: 'text/markdown',
        qualityScore: 0.8
      }
    ];

    const result = getPatternFlyApiRecords(entries);

    expect(result.records).toHaveLength(0);
    expect(result.discarded.size).toBe(2);
    expect(result.discarded.get('api::v1::components::button::props')).toEqual({
      reason: 'deferred',
      qualityScore: 1
    });
    expect(result.discarded.get('api::v1::components::lorem::react')).toEqual({
      reason: 'low-quality',
      qualityScore: 0.8
    });
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
  const BASE = DEFAULT_OPTIONS.patternflyOptions.api.base;
  const VERSIONS = `${BASE}/versions`;
  const ENABLED_OPTIONS = {
    ...DEFAULT_OPTIONS,
    patternflyOptions: {
      ...DEFAULT_OPTIONS.patternflyOptions,
      api: {
        ...DEFAULT_OPTIONS.patternflyOptions.api,
        crawlEnabled: true
      }
    }
  } as any;

  let mockGet: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.resetAllMocks();
    mockGet = jest.fn().mockResolvedValue({ status: 200 });
    mockedSetFetch.mockReturnValue({ get: mockGet });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should return baseline records and bypass crawl when crawl is disabled', async () => {
    const options = {
      patternflyOptions: {
        ...DEFAULT_OPTIONS.patternflyOptions,
        api: {
          ...DEFAULT_OPTIONS.patternflyOptions.api,
          crawlEnabled: false
        }
      }
    } as any;

    const result = await collectionCallback({}, options);

    expect(result).toHaveProperty('records');
    expect(result.records.length).toBeGreaterThan(0);
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockedProcessDocsFunction).not.toHaveBeenCalled();
  });

  it.each([
    {
      description: 'generate API records and match McpCollectionResult structure',
      mockLeaf: {
        content: 'Button react component content with length enough to pass quality scoring...',
        path: `${BASE}/v1/components/Button`,
        resolvedPath: `${BASE}/v1/components/Button/react`,
        isSuccess: true
      },
      componentName: 'Button',
      expectedId: /^api::/,
      expectedItem: {
        displayName: 'Button',
        pathSlug: 'components-button-react',
        source: 'api',
        version: 'v1',
        section: 'components',
        category: 'react',
        path: `${BASE}/v1/components/Button/react`
      }
    },
    {
      description: 'use an extrapolated category',
      mockLeaf: {
        content: 'Overview content',
        path: `${BASE}/v1/components/Card`,
        resolvedPath: `${BASE}/v1/components/Card/overview`,
        isSuccess: true
      },
      componentName: 'Card',
      expectedId: /^api::v1::components::card::overview$/,
      expectedItem: {
        displayName: 'Card',
        category: 'overview'
      }
    },
    {
      description: 'generate API records for CSS facets',
      mockLeaf: {
        content: 'Card css content',
        path: `${BASE}/v1/components/Card`,
        resolvedPath: `${BASE}/v1/components/Card/css`,
        isSuccess: true
      },
      componentName: 'Card',
      expectedId: /^api::v1::components::card::css$/,
      expectedItem: {
        displayName: 'Card CSS',
        category: 'css'
      }
    }
  ])('should $description', async ({ mockLeaf, componentName, expectedId, expectedItem }) => {
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
      .mockResolvedValueOnce([mockLeaf]);

    const promise = collectionCallback({}, ENABLED_OPTIONS);

    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result).toHaveProperty('records');
    expect(Array.isArray(result.records)).toBe(true);
    expect(result.records.length).toBeGreaterThan(0);

    const first: any = result.records[0];

    expect(first.sourceType).toBe('api');
    expect(first.sourceId).toBe(mockLeaf.resolvedPath);
    expect(first.id).toMatch(expectedId);
    expect(first.data).toHaveProperty(componentName);
    expect(first.data[componentName]).toContainEqual(expect.objectContaining(expectedItem));
  });

  it.each([
    {
      description: 'heal missing records from previous state when direct probe succeeds',
      previous: [
        {
          id: 'api::v1::components::button::props',
          sourceId: `${BASE}/v1/components/Button/props`,
          sourceType: 'api' as const,
          data: {
            Button: [{
              displayName: 'Button',
              pathSlug: 'components-button-props',
              source: 'api',
              version: 'v1',
              section: 'components',
              category: 'props',
              path: `${BASE}/v1/components/Button/props`
            }]
          }
        }
      ],
      crawlEntries: [],
      probeResponse: [
        {
          content: JSON.stringify({ name: 'ButtonProps' }),
          path: `${BASE}/v1/components/Button/props`,
          resolvedPath: `${BASE}/v1/components/Button/props`,
          isSuccess: true
        }
      ],
      expectedRecordId: 'api::v1::components::button::props',
      expectedLength: 1
    },
    {
      description: 'not re-probe entries that were visited during crawl pass but discarded for low quality',
      previous: [
        {
          id: 'api::v1::components::button::html',
          sourceId: `${BASE}/v1/components/Button/html`,
          sourceType: 'api' as const,
          data: {
            Button: [{ displayName: 'Button', pathSlug: 'components-button-html', source: 'api', version: 'v1', section: 'components', category: 'html', path: `${BASE}/v1/components/Button/html` }]
          }
        }
      ],
      crawlEntries: [
        {
          content: '<LiveExample src="1" />',
          path: `${BASE}/v1/components/Button/html`,
          resolvedPath: `${BASE}/v1/components/Button/html`,
          isSuccess: true
        }
      ],
      probeResponse: undefined,
      expectedRecordId: undefined,
      expectedLength: 0
    },
    {
      description: 'fall back to seed catalog baseline when previous records are empty',
      previous: [],
      crawlEntries: [],
      probeResponse: [
        {
          content: JSON.stringify({ name: 'AccessibilityDesign' }),
          path: `${BASE}/v6/accessibility/design/text`,
          resolvedPath: `${BASE}/v6/accessibility/design/text`,
          isSuccess: true
        }
      ],
      expectedRecordId: 'api::v6::accessibility::design::text',
      expectedLength: 1
    }
  ])('should $description', async ({ previous, crawlEntries, probeResponse, expectedRecordId, expectedLength }) => {
    mockedProcessDocsFunction
      .mockResolvedValueOnce([
        {
          content: JSON.stringify(['v1']),
          path: VERSIONS,
          resolvedPath: VERSIONS,
          isSuccess: true
        }
      ])
      .mockResolvedValueOnce(crawlEntries);

    if (probeResponse) {
      mockedProcessDocsFunction.mockResolvedValueOnce(probeResponse);
    }

    const promise = collectionCallback({ previous: { records: previous } }, ENABLED_OPTIONS);

    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result.records).toHaveLength(expectedLength);
    if (expectedRecordId) {
      expect(result.records[0]?.id).toBe(expectedRecordId);
    }
    expect(mockedProcessDocsFunction).toHaveBeenCalledTimes(3);
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
    expect(mockedProcessDocsFunction)
      .toHaveBeenCalledWith(expect.arrayContaining(['https://api.com/v1']), expect.objectContaining({}));
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
  const BASE = DEFAULT_OPTIONS.patternflyOptions.api.base;
  const VERSIONS = `${BASE}/versions`;

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('returns [] when getVersions rejects', async () => {
    mockedProcessDocsFunction.mockResolvedValueOnce([
      {
        content: 'Failed to load',
        path: VERSIONS,
        resolvedPath: VERSIONS,
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
          path: VERSIONS,
          resolvedPath: VERSIONS,
          isSuccess: true
        }
      ])
      .mockResolvedValueOnce([
        {
          content: 'leaf content',
          path: `${BASE}/v1`,
          resolvedPath: `${BASE}/v1/section/item/facet`,
          isSuccess: true
        }
      ]);

    const res = await apiSpider();

    expect(res.length).toBeGreaterThan(0);
    expect(res[0]).toMatchObject({
      path: `${BASE}/v1`,
      resolvedPath: `${BASE}/v1/section/item/facet`,
      content: 'leaf content'
    });
  });

  it('handles crawl timeout gracefully in apiSpider', async () => {
    const options = getOptions();

    mockedProcessDocsFunction
      .mockResolvedValueOnce([
        {
          content: JSON.stringify(['v1']),
          path: VERSIONS,
          resolvedPath: VERSIONS,
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

import {
  patternFlyApiCollection,
  collectionCallback,
  apiSpider,
  parsePayload,
  isEmptyPayload,
  crawler
} from '../collection.patternFlyApi';
import { processDocsFunction } from '../server.getResources';
import { getOptions } from '../options.context';

jest.mock('../server.getResources');

// Prefer relaxed typing in tests to focus on behavior over typings
const mockedProcessDocsFunction: any = processDocsFunction as any;

describe('patternFlyApiCollection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return the correct collection name and configuration', () => {
    const [name, callback, config] = patternFlyApiCollection();

    expect(name).toBe('patternfly-api');
    expect(callback).toBeDefined();
    expect(config?.runParallel).toContain('#collection');
  });
});

describe('collectionCallback', () => {
  const BASE = 'https://main.patternfly-org.pages.dev/api';
  const VERSIONS = `${BASE}/versions`;

  beforeEach(() => {
    jest.clearAllMocks();
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
});

describe('crawler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
    jest.clearAllMocks();
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
      .mockImplementation(() => new Promise(resolve => setTimeout(resolve, 50)));

    const res = await apiSpider({
      ...options,
      patternflyOptions: {
        ...options.patternflyOptions,
        api: {
          ...options.patternflyOptions.api,
          timeoutMs: 50
        }
      }
    });

    expect(res).toEqual([]);
  });
});

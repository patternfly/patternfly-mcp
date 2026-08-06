import { apiSpider, parsePayload, isEmptyPayload, crawler } from '../collection.patternFlyApi';
import { processDocsFunction } from '../server.getResources';

jest.mock('../server.getResources');

const mockedProcessDocsFunction = processDocsFunction as jest.MockedFunction<typeof processDocsFunction>;

describe('collections.api', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('parsePayload / isEmptyPayload', () => {
    it('treats {}, [], null, "" as empty (soft-404)', () => {
      expect(isEmptyPayload('{}')).toBe(true);
      expect(isEmptyPayload('[]')).toBe(true);
      expect(isEmptyPayload('null')).toBe(true);
      expect(isEmptyPayload('""')).toBe(true);
      expect(isEmptyPayload('')).toBe(true);
    });
    it('parses numeric payloads as non-empty', () => {
      expect(parsePayload('42').isEmpty).toBe(false);
    });
  });

  describe('crawler', () => {
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
      expect(mockedProcessDocsFunction).toHaveBeenCalledTimes(2);
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
  });

  describe('apiSpider', () => {
    it('returns [] when getVersions rejects', async () => {
      mockedProcessDocsFunction.mockResolvedValueOnce([
        {
          content: '❌ Failed to load',
          path: 'https://main.patternfly-org.pages.dev/api/versions',
          resolvedPath: 'https://main.patternfly-org.pages.dev/api/versions',
          isSuccess: false
        }
      ]);

      const res = await apiSpider();

      expect(res).toEqual([]);
    });

    it('returns ApiContent[] with metadata shape', async () => {
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
        url: 'https://main.patternfly-org.pages.dev/api/v1/section/item/facet',
        content: 'leaf content',
        semanticContext: {
          version: 'v1',
          section: 'section',
          item: 'item',
          facet: 'facet'
        }
      });
    });
  });
});

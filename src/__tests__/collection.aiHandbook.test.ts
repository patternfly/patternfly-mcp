import { aiHandbookCollection, collectionCallback } from '../collection.aiHandbook';
import { processDocsFunction } from '../server.getResources';

jest.mock('../server.getResources');

const mockedProcessDocsFunction: any = processDocsFunction as any;

describe('aiHandbookCollection', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should return the correct collection name and configuration', () => {
    const [name, config, callback, _config] = aiHandbookCollection();

    expect(name).toBe('ai-handbook');
    expect(config).toEqual({
      title: 'AI Handbook'
    });
    expect(typeof callback).toBe('function');
    expect(_config).toBeDefined();
    expect(_config?.isRequired).toBe(true);
    expect(_config?.retainLastViable).toBe(true);
    expect(_config?.initial).toBeUndefined();
  });

  it('should execute callback and return collection results', async () => {
    mockedProcessDocsFunction.mockResolvedValueOnce([
      {
        content: JSON.stringify({
          docs: {
            guidelines: [
              {
                displayName: 'AI Guidelines',
                description: 'Guidelines for AI development',
                path: 'https://github.com/rh-uxd/ai-handbook/blob/main/guidelines.md'
              }
            ]
          }
        }),
        path: 'https://raw.githubusercontent.com/rh-uxd/ai-handbook/refs/heads/main/docs.json',
        resolvedPath: 'https://raw.githubusercontent.com/rh-uxd/ai-handbook/refs/heads/main/docs.json',
        isSuccess: true
      }
    ]);

    const [, , callback] = aiHandbookCollection();
    const result = await callback();

    expect(result).toHaveProperty('records');
    expect(Array.isArray(result.records)).toBe(true);
    expect(result.records.length).toBe(1);
    expect(result.records[0]).toMatchObject({
      id: 'docs::ai-handbook::guidelines',
      sourceId: 'guidelines',
      sourceType: 'local',
      data: {
        guidelines: [
          {
            displayName: 'AI Guidelines',
            description: 'Guidelines for AI development',
            collection: 'ai-handbook'
          }
        ]
      }
    });
  });
});

describe('collectionCallback', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should process docs catalog successfully and inject collection property', async () => {
    mockedProcessDocsFunction.mockResolvedValueOnce([
      {
        content: JSON.stringify({
          docs: {
            Prompting: [
              {
                displayName: 'Prompting Guide',
                description: 'How to write prompts',
                category: 'design'
              },
              'invalid-non-object'
            ],
            invalidEntry: 'not-an-array'
          }
        }),
        path: 'https://raw.githubusercontent.com/rh-uxd/ai-handbook/refs/heads/main/docs.json',
        resolvedPath: 'https://raw.githubusercontent.com/rh-uxd/ai-handbook/refs/heads/main/docs.json',
        isSuccess: true
      }
    ]);

    const result = await collectionCallback();

    expect(result.records.length).toBe(1);
    expect(result.records[0]).toEqual({
      id: 'docs::ai-handbook::prompting',
      sourceId: 'prompting',
      sourceType: 'local',
      data: {
        prompting: [
          {
            displayName: 'Prompting Guide',
            description: 'How to write prompts',
            category: 'design',
            collection: 'ai-handbook'
          }
        ]
      }
    });
  });

  it('should handle pre-parsed JSON objects in content', async () => {
    mockedProcessDocsFunction.mockResolvedValueOnce([
      {
        content: {
          docs: {
            ethics: [
              {
                displayName: 'AI Ethics',
                description: 'Ethical considerations'
              }
            ]
          }
        },
        path: 'https://raw.githubusercontent.com/rh-uxd/ai-handbook/refs/heads/main/docs.json',
        resolvedPath: 'https://raw.githubusercontent.com/rh-uxd/ai-handbook/refs/heads/main/docs.json',
        isSuccess: true
      }
    ]);

    const result = await collectionCallback();

    expect(result.records.length).toBe(1);
    expect(result.records[0]?.id).toBe('docs::ai-handbook::ethics');
  });

  it('should return empty records when fetch fails or is unsuccessful', async () => {
    mockedProcessDocsFunction.mockResolvedValueOnce([
      {
        content: 'Not Found',
        path: 'https://raw.githubusercontent.com/rh-uxd/ai-handbook/refs/heads/main/docs.json',
        resolvedPath: 'https://raw.githubusercontent.com/rh-uxd/ai-handbook/refs/heads/main/docs.json',
        isSuccess: false
      }
    ]);

    const result = await collectionCallback();

    expect(result).toEqual({ records: [] });
  });

  it('should return empty records when processDocsFunction returns null/empty', async () => {
    mockedProcessDocsFunction.mockResolvedValueOnce(null);

    const result = await collectionCallback();

    expect(result).toEqual({ records: [] });
  });

  it('should handle malformed JSON gracefully without throwing', async () => {
    mockedProcessDocsFunction.mockResolvedValueOnce([
      {
        content: '{ invalid json',
        path: 'https://raw.githubusercontent.com/rh-uxd/ai-handbook/refs/heads/main/docs.json',
        resolvedPath: 'https://raw.githubusercontent.com/rh-uxd/ai-handbook/refs/heads/main/docs.json',
        isSuccess: true
      }
    ]);

    const result = await collectionCallback();

    expect(result).toEqual({ records: [] });
  });
});

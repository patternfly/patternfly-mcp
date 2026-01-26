import { readFile } from 'node:fs/promises';
import {
  readLocalFileFunction,
  fetchUrlFunction,
  processDocsFunction,
  promiseQueue,
  loadFileFetch,
  resolveLocalPathFunction
} from '../server.getResources';
import { type GlobalOptions } from '../options';

// Mock dependencies
jest.mock('node:fs/promises');
jest.mock('../server.caching', () => ({
  memo: jest.fn(fn => {
    const memoized = fn;

    memoized.clear = jest.fn();

    return memoized;
  })
}));

const mockReadFile = readFile as jest.MockedFunction<typeof readFile>;

describe('readLocalFileFunction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should attempt to read a file from disk', async () => {
    mockReadFile.mockResolvedValue('file content');

    const result = await readLocalFileFunction('/path/to/file.md');

    expect(mockReadFile).toHaveBeenCalledWith('/path/to/file.md', 'utf-8');
    expect(result).toBe('file content');
  });

  it('should have memo property', () => {
    expect(readLocalFileFunction.memo).toBeDefined();
  });
});

describe('fetchUrlFunction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it('should attempt to fetch a URL with correct headers', async () => {
    const mockResponse = {
      ok: true,
      text: jest.fn().mockResolvedValue('fetched content')
    };

    (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

    const result = await fetchUrlFunction('https://example.com/doc.md');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.com/doc.md',
      expect.objectContaining({
        headers: { Accept: 'text/plain, text/markdown, */*' }
      })
    );
    expect(result).toBe('fetched content');
  });

  it('should handle non-OK responses', async () => {
    const mockResponse = {
      ok: false,
      status: 404,
      statusText: 'Not Found'
    };

    (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

    await expect(fetchUrlFunction('https://example.com/missing.md'))
      .rejects
      .toThrow('Failed to fetch https://example.com/missing.md: 404 Not Found');
  });

  it('should have memo property', () => {
    expect(fetchUrlFunction.memo).toBeDefined();
  });
});

describe('resolveLocalPathFunction', () => {
  it.each([
    {
      description: 'basic',
      path: 'lorem-ipsum.md'
    },
    {
      description: 'url, http',
      path: 'http://example.com/dolor-sit.md'
    },
    {
      description: 'url, https',
      path: 'https://example.com/dolor-sit.md'
    },
    {
      description: 'url, file',
      path: 'file://someDirectory/dolor-sit.md'
    }
  ])('should return a consistent path, $description', ({ path }) => {
    const result = resolveLocalPathFunction(path);

    expect(result).toMatchSnapshot();
  });
});

describe('loadFileFetch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    {
      description: 'with local file',
      pathUrl: 'dolor-sit.md',
      expectedIsFetch: false
    },
    {
      description: 'with remote URL',
      pathUrl: 'https://example.com/remote.md',
      expectedIsFetch: true
    }
  ])('should attempt to load a file or fetch, $description', async ({ pathUrl, expectedIsFetch }) => {
    const mockFetchCall = jest.fn().mockResolvedValue('content');
    const mockReadCall = jest.fn().mockResolvedValue('content');

    readLocalFileFunction.memo = mockReadCall;
    fetchUrlFunction.memo = mockFetchCall;

    const result = await loadFileFetch(pathUrl);

    expect(mockFetchCall).toHaveBeenCalledTimes(expectedIsFetch ? 1 : 0);
    expect(mockReadCall).toHaveBeenCalledTimes(expectedIsFetch ? 0 : 1);
    expect(result).toEqual({
      content: 'content',
      resolvedPath: expect.any(String)
    });
  });
});

describe('promiseQueue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should execute promises in order', async () => {
    readLocalFileFunction.memo = jest.fn().mockImplementation(path => Promise.resolve(path));
    fetchUrlFunction.memo = jest.fn().mockImplementation(url => Promise.reject(url));

    const pathUrlQueue = ['dolor-sit.md', 'https://example.com/remote.md', 'lorem-ipsum.md'];

    await expect(promiseQueue(pathUrlQueue, 1)).resolves.toMatchSnapshot('allSettled');
  });
});

describe('processDocsFunction', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Mock the memo functions
    readLocalFileFunction.memo = jest.fn().mockResolvedValue('local file content');
    fetchUrlFunction.memo = jest.fn().mockResolvedValue('fetched content');
  });

  it.each([
    {
      description: 'files and URLS',
      inputs: [
        'local-file.md',
        'https://example.com/remote.md'
      ],
      options: {
        isHttp: false,
        urlRegex: /^(https?:)\/\//i,
        separator: '\n\n---\n\n'
      },
      fileMemoHits: 1,
      fetchMemoHits: 1
    },
    {
      description: 'duplicate files and URLS',
      inputs: [
        'file.md',
        'file.md',
        'file.md',
        'https://example.com/remote.md',
        'https://example.com/remote.md'
      ],
      options: {
        isHttp: false,
        urlRegex: /^(https?:)\/\//i,
        separator: '\n\n---\n\n'
      },
      fileMemoHits: 1,
      fetchMemoHits: 1
    },
    {
      description: 'filter empty strings',
      inputs: [
        'file.md',
        '',
        '   ',
        'file2.md'
      ],
      options: {
        isHttp: false,
        urlRegex: /^(https?:)\/\//i,
        separator: '\n\n---\n\n'
      },
      fileMemoHits: 2
    }
  ])('should process local and remote inputs, $description', async ({ inputs, options, fileMemoHits = 0, fetchMemoHits = 0 }) => {
    const result = await processDocsFunction(inputs, options as GlobalOptions);

    expect(result).toMatchSnapshot();
    expect(readLocalFileFunction.memo).toHaveBeenCalledTimes(fileMemoHits);
    expect(fetchUrlFunction.memo).toHaveBeenCalledTimes(fetchMemoHits);
  });

  it('should handle errors gracefully', async () => {
    const mockOptions = {
      isHttp: false,
      urlRegex: /^(https?:)\/\//i,
      separator: '\n\n---\n\n'
    };

    // Mock one success and one failure
    readLocalFileFunction.memo = jest.fn()
      .mockResolvedValueOnce('success content')
      .mockRejectedValueOnce(new Error('File not found'));

    const inputs = [
      'good-file.md',
      'bad-file.md'
    ];

    const result = await processDocsFunction(inputs, mockOptions as GlobalOptions);

    expect(result).toMatchSnapshot('errors');
  });
});

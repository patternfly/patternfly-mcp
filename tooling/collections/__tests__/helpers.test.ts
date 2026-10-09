import * as childProcess from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import {
  extractCommitHash,
  extractRepoInfo,
  extractTrackedReposFromCatalog,
  fetchCommitViaGitLsRemote,
  fetchRepoCommit,
  fetchLatestRepoHashes,
  runUpdateTask,
  verifyUrlReachability,
  writeJsonCollection
} from '../helpers';

jest.mock('node:fs/promises', () => ({
  ...jest.requireActual('node:fs/promises'),
  writeFile: jest.fn()
}));

jest.mock('node:child_process', () => ({
  ...jest.requireActual('node:child_process'),
  execSync: jest.fn()
}));

const mockWriteFile = writeFile as jest.MockedFunction<typeof writeFile>;

afterEach(() => {
  extractRepoInfo.memo.clear();
  fetchRepoCommit.memo.clear();
  verifyUrlReachability.memo.clear();
});

describe('extractTrackedReposFromCatalog', () => {
  it('should extract and deduplicate repositories across multiple categories', () => {
    const mockCatalog = {
      version: '1',
      generated: '2026-01-01',
      meta: { totalEntries: 2, totalDocs: 3, source: 'test' },
      docs: {
        components: [
          { displayName: 'Button', pathSlug: 'button', path: 'https://raw.githubusercontent.com/patternfly/patternfly-react/sha1/pkg/button.md' },
          { displayName: 'Card', pathSlug: 'card', path: 'https://raw.githubusercontent.com/patternfly/patternfly-react/sha2/pkg/card.md' }
        ],
        guidelines: [
          { displayName: 'AI Guidelines', pathSlug: 'ai', path: 'https://raw.githubusercontent.com/rh-uxd/ai-helpers/sha3/docs/ai.md' },
          { displayName: 'Invalid Path', pathSlug: 'invalid', path: 'https://example.com/invalid.md' }
        ]
      }
    };

    const result = extractTrackedReposFromCatalog(mockCatalog as any);

    expect(result).toHaveLength(2);
    expect(result).toEqual([
      { owner: 'patternfly', repo: 'patternfly-react', branch: undefined },
      { owner: 'rh-uxd', repo: 'ai-helpers', branch: undefined }
    ]);
  });

  it('should return an empty array when catalog contains no valid docs', () => {
    expect(extractTrackedReposFromCatalog({} as any)).toEqual([]);
    expect(extractTrackedReposFromCatalog({ docs: {} } as any)).toEqual([]);
  });

  it('should apply branch override when supplied', () => {
    const catalog = { docs: { c: [{ path: 'https://raw.githubusercontent.com/org/repo/sha/file.md' }] } };
    const result = extractTrackedReposFromCatalog(catalog as any, 'develop');

    expect(result[0]?.branch).toBe('develop');
  });
});

describe('extractCommitHash', () => {
  it.each([
    {
      description: 'full 40-character SHA raw GitHub URL',
      url: 'https://raw.githubusercontent.com/patternfly/patternfly-org/540bb0d31cb18670dd02857f80aa8b444fed9be9/packages/documentation-site/patternfly-docs/content/AI/ai.md',
      expected: '540bb0d31cb18670dd02857f80aa8b444fed9be9'
    },
    {
      description: 'branch ref raw GitHub URL',
      url: 'https://raw.githubusercontent.com/rh-uxd/ai-helpers/main/docs/components/data-display/table.md',
      expected: 'main'
    },
    {
      description: 'non-raw GitHub URL',
      url: 'https://github.com/patternfly/patternfly-org/blob/main/README.md',
      expected: undefined
    },
    {
      description: 'non-GitHub URL',
      url: 'https://example.com/invalid',
      expected: undefined
    },
    {
      description: 'empty string URL',
      url: '',
      expected: undefined
    },
    {
      description: 'null input',
      url: null as unknown as string,
      expected: undefined
    },
    {
      description: 'undefined input',
      url: undefined as unknown as string,
      expected: undefined
    }
  ])('should extract commit hash or return undefined, $description', ({ url, expected }) => {
    expect(extractCommitHash(url)).toBe(expected);
  });
});

describe('extractRepoInfo', () => {
  it.each([
    {
      description: 'valid raw GitHub URL with subpath',
      url: 'https://raw.githubusercontent.com/patternfly/patternfly-org/540bb0d31359c381c8152331575ca2481e3fe1ff/packages/v4/src/content/components/button.md',
      expected: {
        owner: 'patternfly',
        repo: 'patternfly-org',
        ref: '540bb0d31359c381c8152331575ca2481e3fe1ff',
        filePath: 'packages/v4/src/content/components/button.md'
      }
    },
    {
      description: 'plain invalid URL string',
      url: 'invalid-url',
      expected: undefined
    },
    {
      description: 'incomplete GitHub path structure',
      url: 'https://raw.githubusercontent.com/incomplete',
      expected: undefined
    },
    {
      description: 'empty string input',
      url: '',
      expected: undefined
    },
    {
      description: 'null input',
      url: null as unknown as string,
      expected: undefined
    },
    {
      description: 'undefined input',
      url: undefined as unknown as string,
      expected: undefined
    }
  ])('should extract repository metadata or return undefined, $description', ({ url, expected }) => {
    expect(extractRepoInfo(url)).toEqual(expected);
  });
});

describe('verifyUrlReachability', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should return true when HEAD request succeeds', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200 } as Response);

    const reachable = await verifyUrlReachability('https://raw.githubusercontent.com/test/file.md');

    expect(reachable).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/test/file.md',
      expect.objectContaining({ method: 'HEAD' })
    );
  });

  it('should fall back to GET when HEAD returns 405 or 403', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({ ok: false, status: 405 } as Response)
      .mockResolvedValueOnce({ ok: true, status: 200 } as Response);

    const reachable = await verifyUrlReachability('https://raw.githubusercontent.com/test/file.md');

    expect(reachable).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenLastCalledWith(
      'https://raw.githubusercontent.com/test/file.md',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('should return false when fetch throws network error or times out', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'));

    const reachable = await verifyUrlReachability('https://raw.githubusercontent.com/test/file.md');

    expect(reachable).toBe(false);
  });
});

describe('fetchCommitViaGitLsRemote', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should return commit SHA when git ls-remote output contains SHA with HEAD', () => {
    jest.spyOn(childProcess, 'execSync').mockReturnValue(
      'ref: refs/heads/main\tHEAD\n8f4a382e783457a4128509789234857234895723\tHEAD\n'
    );

    const sha = fetchCommitViaGitLsRemote('patternfly', 'patternfly-react');

    expect(sha).toBe('8f4a382e783457a4128509789234857234895723');
  });

  it('should fallback to 40-character SHA if symref line is missing', () => {
    jest.spyOn(childProcess, 'execSync').mockReturnValue(
      '8f4a382e783457a4128509789234857234895723\trefs/heads/main\n'
    );

    const sha = fetchCommitViaGitLsRemote('patternfly', 'patternfly-react');

    expect(sha).toBe('8f4a382e783457a4128509789234857234895723');
  });

  it('should return undefined if command fails or throws', () => {
    jest.spyOn(childProcess, 'execSync').mockImplementation(() => {
      throw new Error('Command failed');
    });

    const sha = fetchCommitViaGitLsRemote('patternfly', 'patternfly-react');

    expect(sha).toBeUndefined();
  });
});

describe('fetchRepoCommit', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should resolve commit SHA for a specific branch from GitHub API', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ sha: 'mock-branch-sha' })
    } as Response);

    const sha = await fetchRepoCommit('patternfly', 'patternfly-react', 'main');

    expect(sha).toBe('mock-branch-sha');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/patternfly/patternfly-react/commits/main',
      expect.any(Object)
    );
  });

  it('should resolve commit SHA for default branch when branch is not specified', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [{ sha: 'mock-default-sha' }]
    } as Response);

    const sha = await fetchRepoCommit('patternfly', 'patternfly-react');

    expect(sha).toBe('mock-default-sha');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/patternfly/patternfly-react/commits',
      expect.any(Object)
    );
  });

  it('should fallback to git ls-remote when GitHub API fails', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'));
    jest.spyOn(childProcess, 'execSync').mockReturnValue(
      '0123456789abcdef0123456789abcdef01234567\tHEAD\n'
    );

    const sha = await fetchRepoCommit('patternfly', 'patternfly-org');

    expect(sha).toBe('0123456789abcdef0123456789abcdef01234567');
  });

  it('should return undefined when API fails and git ls-remote fails', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'));
    jest.spyOn(childProcess, 'execSync').mockImplementation(() => {
      throw new Error('git error');
    });

    const sha = await fetchRepoCommit('patternfly', 'patternfly-org');

    expect(sha).toBeUndefined();
  });
});

describe('fetchLatestRepoHashes', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('should fetch commit SHAs from GitHub API and index by owner/repo and repo name', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.includes('patternfly-react')) {
        return {
          ok: true,
          json: async () => ({ sha: 'mock-react-sha-123' })
        } as Response;
      }

      return { ok: false, status: 404 } as Response;
    });

    const repos = [
      { owner: 'patternfly', repo: 'patternfly-react', branch: 'main' },
      { owner: 'patternfly', repo: 'nonexistent', branch: 'main' }
    ];

    const hashes = await fetchLatestRepoHashes(repos);

    expect(hashes.get('patternfly/patternfly-react')).toBe('mock-react-sha-123');
    expect(hashes.get('patternfly-react')).toBe('mock-react-sha-123');
    expect(hashes.has('patternfly/nonexistent')).toBe(false);
  });

  it('should query commits list when branch is not specified and handle array response', async () => {
    let capturedUrl = '';

    jest.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      capturedUrl = typeof input === 'string' ? input : input.toString();

      return {
        ok: true,
        json: async () => [{ sha: 'mock-default-sha-456' }]
      } as Response;
    });

    const hashes = await fetchLatestRepoHashes([
      { owner: 'patternfly', repo: 'patternfly-elements' }
    ]);

    expect(capturedUrl).toBe('https://api.github.com/repos/patternfly/patternfly-elements/commits');
    expect(hashes.get('patternfly/patternfly-elements')).toBe('mock-default-sha-456');
    expect(hashes.get('patternfly-elements')).toBe('mock-default-sha-456');
  });

  it('should include Authorization header when GITHUB_TOKEN or GH_TOKEN is set', async () => {
    process.env.GITHUB_TOKEN = 'ghp_secret_token';
    let capturedHeaders: Record<string, string> = {};

    jest.spyOn(global, 'fetch').mockImplementation(async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedHeaders = (init?.headers as Record<string, string>) || {};

      return {
        ok: true,
        json: async () => ({ sha: 'mock-auth-sha' })
      } as Response;
    });

    await fetchLatestRepoHashes([
      { owner: 'patternfly', repo: 'patternfly-mcp', branch: 'main' }
    ]);

    expect(capturedHeaders.Authorization).toBe('Bearer ghp_secret_token');
  });

  it('should fall back to git ls-remote when GitHub API fails', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Rate limit exceeded'));
    jest.spyOn(childProcess, 'execSync').mockReturnValue(
      '0123456789abcdef0123456789abcdef01234567\tHEAD\n'
    );

    const hashes = await fetchLatestRepoHashes([
      { owner: 'patternfly', repo: 'patternfly-org', branch: 'main' }
    ]);

    expect(hashes.get('patternfly/patternfly-org')).toBe('0123456789abcdef0123456789abcdef01234567');
  });

  it('should handle fetch failures gracefully without throwing', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Rate limit exceeded'));
    jest.spyOn(childProcess, 'execSync').mockImplementation(() => {
      throw new Error('git command failed');
    });

    const hashes = await fetchLatestRepoHashes([
      { owner: 'patternfly', repo: 'patternfly-org', branch: 'main' }
    ]);

    expect(hashes.size).toBe(0);
  });
});

describe('writeJsonCollection', () => {
  let logSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    mockWriteFile.mockResolvedValue(undefined as never);
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should format JSON as pretty-printed by default with trailing newline', async () => {
    const targetPath = '/path/to/collection.json';
    const data = { key: 'value', count: 42 };

    const result = await writeJsonCollection(targetPath, data);

    const expectedJson = JSON.stringify(data, null, 2);

    expect(mockWriteFile).toHaveBeenCalledWith(targetPath, expectedJson + '\n', 'utf-8');
    expect(result.jsonContent).toBe(expectedJson);
    expect(logSpy).toHaveBeenCalledWith(`✅ Updated ${targetPath}:`);
    expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/File Size: \d+\.\d+ KB/));
  });

  it('should format JSON in compact format when isPrettyPrint is false', async () => {
    const targetPath = '/path/to/compact.json';
    const data = { a: 1, b: 2 };

    const result = await writeJsonCollection(targetPath, data, { isPrettyPrint: false });

    const expectedJson = JSON.stringify(data);

    expect(mockWriteFile).toHaveBeenCalledWith(targetPath, expectedJson + '\n', 'utf-8');
    expect(result.jsonContent).toBe(expectedJson);
  });

  it('should calculate elapsed time when startTime is supplied and log custom stats', async () => {
    const targetPath = '/path/to/stats.json';
    const data = { items: [1, 2, 3] };
    const startTime = Date.now() - 1500;

    const result = await writeJsonCollection(targetPath, data, {
      startTime,
      stats: [
        { label: 'Total Items', value: 3 },
        { label: 'Status', value: 'OK' }
      ]
    });

    expect(logSpy).toHaveBeenCalledWith('   - Total Items: 3');
    expect(logSpy).toHaveBeenCalledWith('   - Status: OK');
    expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/Time Elapsed: \d+\.\d+s/));
    expect(typeof result.durationSec).toBe('string');
    expect(typeof result.sizeKb).toBe('string');
  });
});

describe('runUpdateTask', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it.each([
    {
      description: 'default env var unset',
      env: {},
      options: undefined,
      shouldInvoke: false
    },
    {
      description: 'default UPDATE_COLLECTIONS set to true',
      env: { UPDATE_COLLECTIONS: 'true' },
      options: undefined,
      shouldInvoke: true
    },
    {
      description: 'custom env variable set to true',
      env: { CUSTOM_TRIGGER: 'true' },
      options: { envVar: 'CUSTOM_TRIGGER' },
      shouldInvoke: true
    }
  ])('should handle execution trigger condition, $description', async ({ env, options, shouldInvoke }) => {
    Object.assign(process.env, env);
    const taskFn = jest.fn().mockResolvedValue(undefined);

    await runUpdateTask('Test Task', taskFn, options);

    expect(taskFn).toHaveBeenCalledTimes(shouldInvoke ? 1 : 0);
  });

  it('should catch task errors, log failure message, and exit with status code 1', async () => {
    process.env.UPDATE_COLLECTIONS = 'true';
    const testError = new Error('Task execution failed');
    const taskFn = jest.fn().mockRejectedValue(testError);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {}) as any);

    await runUpdateTask('Failing Task', taskFn);

    expect(errorSpy).toHaveBeenCalledWith('❌ Failed to update Failing Task:', testError);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

describe('memo cleanup and caching', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should allow clearing memo caches without errors', () => {
    const url = 'https://raw.githubusercontent.com/patternfly/patternfly-react/main/packages/README.md';
    const first = extractRepoInfo.memo(url);
    const second = extractRepoInfo.memo(url);

    expect(first).toEqual(second);
    expect(extractRepoInfo.memo.clear()).toBe(true);
  });

  it('should cache fetchRepoCommit.memo calls and clear properly', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ sha: 'mock-memo-sha' })
    } as Response);

    const first = await fetchRepoCommit.memo('patternfly', 'patternfly-react', 'main');
    const second = await fetchRepoCommit.memo('patternfly', 'patternfly-react', 'main');

    expect(first).toBe('mock-memo-sha');
    expect(second).toBe('mock-memo-sha');
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    expect(fetchRepoCommit.memo.clear()).toBe(true);

    const third = await fetchRepoCommit.memo('patternfly', 'patternfly-react', 'main');

    expect(third).toBe('mock-memo-sha');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('should cache verifyUrlReachability.memo calls and clear properly', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200
    } as Response);

    const first = await verifyUrlReachability.memo('https://raw.githubusercontent.com/patternfly/test.md');
    const second = await verifyUrlReachability.memo('https://raw.githubusercontent.com/patternfly/test.md');

    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    expect(verifyUrlReachability.memo.clear()).toBe(true);

    const third = await verifyUrlReachability.memo('https://raw.githubusercontent.com/patternfly/test.md');

    expect(third).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

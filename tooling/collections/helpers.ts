import { execSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { memo } from '../../src/server.caching';
import { type PatternFlyMcpDocsCatalog } from '../../src/docs.embedded';

/**
 * Information extracted from a raw GitHub documentation URL.
 */
interface GitHubUrlInfo {
  owner: string;
  repo: string;
  ref: string;
  filePath: string;
}

/**
 * Repository tracking definition for upstream release queries.
 */
interface TrackedRepository {
  owner: string;
  repo: string;
  branch?: string | undefined;
}

/**
 * Extract commit hash or ref from a raw GitHub documentation URL.
 *
 * @param url - Raw GitHub URL
 * @returns Hash/ref string or undefined if not a recognized GitHub raw URL
 */
const extractCommitHash = (url: string): string | undefined => {
  if (!url || typeof url !== 'string') {
    return undefined;
  }

  const match = url.match(/^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/([^/]+)\//);

  return match && match[1] ? match[1] : undefined;
};

/**
 * Extract structured repository and path information from a raw GitHub URL.
 *
 * @param url - Raw GitHub URL
 * @returns GitHubUrlInfo or undefined if not a recognized raw URL
 */
const extractRepoInfo = (url: string): GitHubUrlInfo | undefined => {
  if (!url || typeof url !== 'string') {
    return undefined;
  }

  const match = url.match(/^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/);

  if (!match || !match[1] || !match[2] || !match[3] || !match[4]) {
    return undefined;
  }

  return {
    owner: match[1],
    repo: match[2],
    ref: match[3],
    filePath: match[4]
  };
};

/**
 * Memoized version of extractRepoInfo.
 */
extractRepoInfo.memo = memo(extractRepoInfo, {
  cacheLimit: 500,
  keyHash: args => args[0]
});

/**
 * Dynamically extract unique repositories referenced across all documents in a catalog.
 *
 * @param catalog - Documentation catalog to inspect
 * @param [defaultBranch] - Optional explicit tracking branch override
 * @returns Array of unique TrackedRepository definitions
 */
const extractTrackedReposFromCatalog = (
  catalog: PatternFlyMcpDocsCatalog,
  defaultBranch?: string
): TrackedRepository[] => {
  const uniqueRepos = new Map<string, TrackedRepository>();

  for (const entries of Object.values(catalog?.docs || {})) {
    for (const doc of entries) {
      if (!doc?.path || typeof doc.path !== 'string') {
        continue;
      }

      const info = extractRepoInfo(doc.path);

      if (info && info.owner && info.repo) {
        const key = `${info.owner}/${info.repo}`.toLowerCase();

        if (!uniqueRepos.has(key)) {
          uniqueRepos.set(key, { owner: info.owner, repo: info.repo, branch: defaultBranch });
        }
      }
    }
  }

  return Array.from(uniqueRepos.values());
};

/**
 * Fallback helper to query HEAD commit SHA using `git ls-remote --symref`.
 *
 * @param owner - Repository owner/organization
 * @param repo - Repository name
 * @returns Commit SHA or undefined if git is unavailable or command fails
 */
const fetchCommitViaGitLsRemote = (owner: string, repo: string): string | undefined => {
  try {
    const remoteUrl = `https://github.com/${owner}/${repo}.git`;
    const output = execSync(`git ls-remote --symref ${remoteUrl} HEAD`, {
      encoding: 'utf-8',
      timeout: 10_000,
      stdio: ['ignore', 'pipe', 'ignore']
    });

    const shaMatch = output.match(/^([0-9a-f]{40})\s+HEAD/m);

    if (shaMatch && shaMatch[1]) {
      return shaMatch[1];
    }

    const fallbackMatch = output.match(/([0-9a-f]{40})/);

    return fallbackMatch && fallbackMatch[1] ? fallbackMatch[1] : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Internal helper to perform a probe request with guaranteed timer cleanup.
 *
 * @param url - Target URL to probe
 * @param method - HTTP method to use ('HEAD' | 'GET')
 * @param timeoutMs - Timeout in milliseconds
 * @returns Promise resolving to Response
 */
const probeUrl = async (url: string, method: 'HEAD' | 'GET', timeoutMs: number): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(url, {
      method,
      headers: { 'User-Agent': 'patternfly-mcp-audit' },
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
  }
};

/**
 * Probe URL reachability using HTTP HEAD / GET request.
 *
 * @param url - Target URL to probe
 * @param [timeoutMs=5000] - Timeout in milliseconds
 * @returns Promise resolving to true if status is 2xx, false otherwise
 */
const verifyUrlReachability = async (url: string, timeoutMs = 5000): Promise<boolean> => {
  try {
    const response = await probeUrl(url, 'HEAD', timeoutMs);

    if (response.ok) {
      return true;
    }

    // Fallback to GET for hosts that reject HEAD requests
    if (response.status === 405 || response.status === 403) {
      const getResponse = await probeUrl(url, 'GET', timeoutMs);

      return getResponse.ok;
    }

    return false;
  } catch {
    return false;
  }
};

/**
 * Memoized version of verifyUrlReachability.
 */
verifyUrlReachability.memo = memo(verifyUrlReachability, {
  cacheLimit: 200,
  keyHash: args => `${args[0]}:${args[1] || 5000}`
});

/**
 * Resolve latest commit SHA for an individual repository via GitHub API or git ls-remote fallback.
 *
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param [branch] - Optional target branch
 * @returns Commit SHA or undefined if unresolved
 */
const fetchRepoCommit = async (
  owner: string,
  repo: string,
  branch?: string
): Promise<string | undefined> => {
  let sha: string | undefined = undefined;

  try {
    const url = branch
      ? `https://api.github.com/repos/${owner}/${repo}/commits/${branch}`
      : `https://api.github.com/repos/${owner}/${repo}/commits`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'patternfly-mcp',
        Accept: 'application/vnd.github.v3+json'
      }
    });

    if (response.ok) {
      const data = await response.json();

      if (Array.isArray(data) && data[0]?.sha) {
        sha = data[0].sha;
      } else if (data && typeof data === 'object' && 'sha' in data && typeof data.sha === 'string') {
        sha = data.sha;
      }
    }
  } catch {
    // Fallback on network/API failure
  }

  return sha || fetchCommitViaGitLsRemote(owner, repo);
};

/**
 * Memoized version of fetchRepoCommit.
 */
fetchRepoCommit.memo = memo(fetchRepoCommit, {
  cacheLimit: 50,
  expire: 60_000,
  keyHash: args => `${args[0]}/${args[1]}:${args[2] || 'default'}`
});

/**
 * Fetch latest commit hashes for tracked repositories via GitHub API with git ls-remote fallback.
 *
 * @param repos - Repositories to query
 * @returns Map of "owner/repo" and "repo" to commit SHA
 */
const fetchLatestRepoHashes = async (
  repos: TrackedRepository[] = []
): Promise<Map<string, string>> => {
  const hashes = new Map<string, string>();

  for (const { owner, repo, branch } of repos) {
    const key = `${owner}/${repo}`;
    const sha = await fetchRepoCommit.memo(owner, repo, branch);

    if (sha) {
      hashes.set(key, sha);
      hashes.set(repo, sha);
    }
  }

  return hashes;
};

/**
 * Options for writeJsonCollection.
 */
interface WriteJsonCollectionOptions {
  isPrettyPrint?: boolean;
  startTime?: number;
  stats?: Array<{ label: string; value: string | number }>;
}

/**
 * Serialize data to JSON, write to target path, and log file size and elapsed time.
 *
 * @param targetPath - Absolute or relative file path for JSON output
 * @param data - Data payload to serialize
 * @param [options={}] - Output and logging options
 * @returns Serialized JSON content and formatted metrics
 */
const writeJsonCollection = async <T>(
  targetPath: string,
  data: T,
  options: WriteJsonCollectionOptions = {}
): Promise<{ jsonContent: string; sizeKb: string; durationSec: string }> => {
  const isPretty = options.isPrettyPrint !== false;
  const jsonContent = isPretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);

  await writeFile(targetPath, jsonContent + '\n', 'utf-8');

  const durationSec = options.startTime ? ((Date.now() - options.startTime) / 1000).toFixed(1) : '0.0';
  const sizeKb = (Buffer.byteLength(jsonContent, 'utf-8') / 1024).toFixed(1);

  console.log(`✅ Updated ${targetPath}:`);
  if (options.stats) {
    for (const { label, value } of options.stats) {
      console.log(`   - ${label}: ${value}`);
    }
  }
  console.log(`   - File Size: ${sizeKb} KB`);
  if (options.startTime) {
    console.log(`   - Time Elapsed: ${durationSec}s`);
  }

  return { jsonContent, sizeKb, durationSec };
};

/**
 * Resolve the default absolute path for a JSON collection file in the src directory.
 *
 * @param filename - Collection JSON filename
 * @param [path] - Default optional path to prepend to the filename.
 * @returns Fully resolved filesystem path in the src directory
 */
const getSrcPath = (filename: string, path: string = '../../src'): string =>
  resolve(fileURLToPath(new URL(`${path}/${filename}`, import.meta.url)));

/**
 * Resolve the default absolute path for a report file in the reports directory.
 *
 * @param filename - Report filename
 * @param [path] - Default optional path to prepend to the filename.
 * @returns Fully resolved filesystem path in the reports directory
 */
const getReportsPath = (filename: string, path: string = '../../reports'): string =>
  getSrcPath(filename, path);

/**
 * Generic lifecycle runner for collection update tasks invoked via environment variables.
 *
 * @param taskName - Human-readable name of the task for logging
 * @param taskFn - Async task function to execute
 * @param [options={}] - Execution options
 * @param [options.envVar='UPDATE_COLLECTIONS'] - Environment variable trigger name
 */
const runUpdateTask = async (
  taskName: string,
  taskFn: () => Promise<unknown>,
  options: { envVar?: string } = { envVar: 'UPDATE_COLLECTIONS' }
): Promise<void> => {
  if (process.env[options.envVar || 'UPDATE_COLLECTIONS'] === 'true') {
    try {
      await taskFn();
    } catch (error) {
      console.error(`❌ Failed to update ${taskName}:`, error);
      process.exit(1);
    }
  }
};

export {
  extractCommitHash,
  extractRepoInfo,
  extractTrackedReposFromCatalog,
  fetchCommitViaGitLsRemote,
  fetchRepoCommit,
  fetchLatestRepoHashes,
  getReportsPath,
  getSrcPath,
  probeUrl,
  runUpdateTask,
  verifyUrlReachability,
  writeJsonCollection,
  type GitHubUrlInfo,
  type TrackedRepository,
  type WriteJsonCollectionOptions
};

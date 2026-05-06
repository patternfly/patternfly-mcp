import type {
  ExpandGithubDirectoryConfig,
  PatternFlyMcpDocsCatalog,
  PatternFlyMcpDocsCatalogDoc,
  PatternFlyMcpDocsCatalogDocStub,
  PatternFlyMcpDocsCatalogEntry,
  PatternFlyMcpDocsCatalogSource
} from './docs.embedded';
import { log } from './logger';

type GithubApiContentFile = {
  name: string;
  type: string;
  download_url: string | null;
};

const GITHUB_API_USER_AGENT = 'patternfly-mcp-catalog-expansion';

/** Repos allowed to use directory expansion (defense in depth). */
const EXPANSION_ALLOWLIST = new Set<string>(['project-felt/ai-guidelines']);

const assertExpansionAllowed = (owner: string, repo: string) => {
  const slug = `${owner}/${repo}`;

  if (!EXPANSION_ALLOWLIST.has(slug)) {
    throw new Error(`catalog: GitHub directory expansion is not enabled for ${slug}`);
  }
};

const buildGithubContentsApiUrl = (owner: string, repo: string, directoryPath: string, ref: string) => {
  const encodedPath = directoryPath.split('/').filter(Boolean).map(encodeURIComponent).join('/');
  const query = new URLSearchParams({ ref });

  return `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?${query.toString()}`;
};

const displayNameFromMarkdownFile = (filename: string, category: string) => {
  const base = filename.replace(/\.md$/i, '');
  const words = base.split('-').filter(Boolean).map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
  const title = words.join(' ');

  return category === 'ai' ? `AI ${title}` : title;
};

const pathSlugFromFilename = (filename: string) => filename.replace(/\.md$/i, '').replace(/[^a-zA-Z0-9-]+/g, '-').toLowerCase();

/**
 * List Markdown files (or files matching `includePattern`) in a GitHub directory via the Contents API.
 *
 * @param config - GitHub coordinates and optional filename pattern.
 */
const fetchGithubMarkdownFiles = async (config: ExpandGithubDirectoryConfig): Promise<GithubApiContentFile[]> => {
  assertExpansionAllowed(config.owner, config.repo);

  const url = buildGithubContentsApiUrl(config.owner, config.repo, config.directoryPath, config.ref);
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': GITHUB_API_USER_AGENT
  };

  if (process.env.GITHUB_TOKEN?.trim()) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN.trim()}`;
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    const body = await response.text();

    throw new Error(`catalog: GitHub API ${response.status} for ${url}: ${body.slice(0, 500)}`);
  }

  const bodyText = await response.text();
  const data = JSON.parse(bodyText) as unknown;

  if (!Array.isArray(data)) {
    throw new Error(`catalog: expected directory listing array from GitHub API for ${url}`);
  }

  const includeRe = new RegExp(config.includePattern ?? '\\.md$', 'i');

  return data.filter((item): item is GithubApiContentFile => {
    if (!item || typeof item !== 'object') {
      return false;
    }

    const file = item as GithubApiContentFile;

    return file.type === 'file' &&
      typeof file.name === 'string' &&
      includeRe.test(file.name) &&
      typeof file.download_url === 'string' &&
      Boolean(file.download_url);
  });
};

/**
 * Expand one stub row into concrete catalog docs (one per matched file).
 *
 * @param template - Catalog stub carrying shared metadata and `expandGithubDirectory`.
 * @param config - Same as `template.expandGithubDirectory` (explicit for clarity).
 */
const expandCatalogDoc = async (
  template: PatternFlyMcpDocsCatalogDocStub,
  config: ExpandGithubDirectoryConfig
): Promise<PatternFlyMcpDocsCatalogDoc[]> => {
  const files = await fetchGithubMarkdownFiles(config);

  if (files.length === 0) {
    log.warn(`catalog: GitHub directory expansion returned no matching files for ${config.owner}/${config.repo}/${config.directoryPath}`);

    return [];
  }

  return files.map(file => {
    const displayName = displayNameFromMarkdownFile(file.name, template.category);

    return {
      displayName,
      description: `${template.description} (${file.name})`,
      pathSlug: pathSlugFromFilename(file.name),
      section: template.section,
      category: template.category,
      source: template.source,
      version: template.version,
      path: file.download_url!
    };
  });
};

/**
 * Replace catalog rows that declare `expandGithubDirectory` with concrete per-file rows.
 * Updates `meta.totalDocs` and `meta.totalEntries` to match the expanded structure.
 *
 * @param catalog - Loaded catalog (e.g. from `docs.json`), possibly containing stubs.
 */
const expandGithubDirectoryInCatalog = async (catalog: PatternFlyMcpDocsCatalogSource): Promise<PatternFlyMcpDocsCatalog> => {
  const newDocs: PatternFlyMcpDocsCatalogEntry = {};

  for (const [resourceKey, entries] of Object.entries(catalog.docs)) {
    const expandedEntries: PatternFlyMcpDocsCatalogDoc[] = [];

    for (const entry of entries) {
      if (!('expandGithubDirectory' in entry)) {
        expandedEntries.push(entry);
        continue;
      }

      const nested = await expandCatalogDoc(entry, entry.expandGithubDirectory);

      expandedEntries.push(...nested);
    }

    newDocs[resourceKey] = expandedEntries;
  }

  const totalDocs = Object.values(newDocs).reduce((acc, list) => acc + list.length, 0);

  return {
    ...catalog,
    docs: newDocs,
    meta: {
      ...catalog.meta,
      totalDocs,
      totalEntries: Object.keys(newDocs).length
    }
  };
};

export { expandGithubDirectoryInCatalog };

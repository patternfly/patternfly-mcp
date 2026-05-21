import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { log, formatUnknownError, subscribeToChannel, type LogEvent } from './logger';
import { getOptions, getSessionOptions, runWithSession } from './options.context';
import { type GlobalOptions } from './options';
import { type PatternFlyMcpDocsCatalog, type PatternFlyMcpDocsCatalogDoc } from './docs.embedded';
import { toCamelCase, toDisplayName, joinUrl } from './server.helpers';
import { loadFileFetch } from './server.getResources';

/**
 * Statistics for the documentation build.
 */
interface DocsStats {
  generated: string;
  totalEntries: number;
  lastBuildRun: number;
}

/**
 * Interface for a documentation build instance.
 */
interface DocsInstance {
  stop(): Promise<void>;
  isRunning(): boolean;
  getStats(): Promise<DocsStats>;
  onLog(handler: (entry: LogEvent) => void): () => void;
}

/**
 * Recursively spider through documentation API segments.
 *
 * @param baseUrl - The current URL to spider
 * @param parts - Accumulated path parts (e.g., [version, section, page])
 * @param context - Shared context for the spider run
 * @param context.version
 * @param catalog - The catalog to populate
 * @returns A promise that resolves when the current segment and its children are processed
 */
const spiderSegments = async (
  baseUrl: string,
  parts: string[],
  context: { version: string },
  catalog: PatternFlyMcpDocsCatalog
): Promise<void> => {
  try {
    const { content, resolvedPath } = await loadFileFetch(baseUrl);
    let segments: unknown;

    try {
      segments = JSON.parse(content);
    } catch {
      // If not JSON, it's terminal content
      segments = null;
    }

    // Terminal Detection: Non-array or explicitly requested terminal path
    const isTerminal = !Array.isArray(segments) || resolvedPath.endsWith('/text');

    if (isTerminal) {
      const page = parts[parts.length - 2] || 'unknown';
      const section = parts[1] || 'other';
      const category = parts[parts.length - 1] || 'general';

      const unifiedName = toCamelCase(page);
      const entry: PatternFlyMcpDocsCatalogDoc = {
        displayName: `${toDisplayName(page)} (${toDisplayName(category)})`,
        description: `PatternFly ${toDisplayName(section)} documentation for ${page} (${category}).`,
        pathSlug: page.replace(/_/g, '-'),
        section,
        category,
        source: 'api',
        version: context.version,
        path: resolvedPath
      };

      /* eslint-disable no-param-reassign */
      catalog.docs[unifiedName] ??= [];
      catalog.docs[unifiedName].push(entry);
      catalog.meta.totalEntries += 1;
      catalog.meta.totalDocs += 1;

      log.info('Build docs', `  [${catalog.meta.totalDocs}] Added entry for ${page} (${category})`);

      return;
    }

    // If array, it's a directory: recurse
    const childSegments = segments as string[];

    for (const segment of childSegments) {
      await spiderSegments(joinUrl(baseUrl, segment), [...parts, segment], context, catalog);
    }
  } catch (error) {
    log.error(`Build docs`, `API spider failed for ${baseUrl}: ${formatUnknownError(error)}`);
  }
};

/**
 * Documentation builder for PatternFly MCP.
 * Consumes the PatternFly Astro API to generate a dynamic api.json catalog.
 *
 * @param options - Global options for the build
 * @returns A promise that resolves to a DocsInstance
 */
const buildPatternFlyDocs = async (options: GlobalOptions = getOptions()): Promise<DocsInstance> => {
  const session = getSessionOptions();
  let running = true;
  const startTime = Date.now();

  const stats: DocsStats = {
    generated: new Date().toISOString(),
    totalEntries: 0,
    lastBuildRun: 0
  };

  const catalog: PatternFlyMcpDocsCatalog = {
    version: '1',
    generated: stats.generated,
    meta: {
      totalEntries: 0,
      totalDocs: 0,
      source: 'api',
      lastBuildRun: startTime
    },
    docs: {}
  };

  const buildPromise = runWithSession(session, async () => {
    log.info('Build docs', 'Starting PatternFly documentation build...');

    const { patternflyOptions, contextPath } = options;
    const { endpoints } = patternflyOptions.api;

    for (const [version, apiBase] of Object.entries(endpoints)) {
      if (!apiBase) {
        continue;
      }

      log.info('Build docs', `Processing version ${version} from ${apiBase}`);

      const context = {
        version
      };

      // Ensure we don't double up on the version if it's already in the apiBase
      const rootUrl = apiBase.includes(version)
        ? apiBase
        : joinUrl(apiBase, version);

      // Recursively spider from the version root
      await spiderSegments(rootUrl, [version], context, catalog);
    }

    stats.totalEntries = catalog.meta.totalDocs;
    stats.lastBuildRun = Date.now() - startTime;
    catalog.meta.lastBuildRun = stats.lastBuildRun;

    const cacheDir = join(contextPath, 'cache');

    if (!existsSync(cacheDir)) {
      mkdirSync(cacheDir, { recursive: true });
    }

    const cachePath = join(cacheDir, 'api.dynamic.json');

    writeFileSync(cachePath, JSON.stringify(catalog, null, 2));

    log.info('Build docs', `Build complete. Generated ${catalog.meta.totalDocs} entries in ${stats.lastBuildRun}ms.`);
    log.info('Build docs', `Cache written to ${cachePath}`);

    running = false;
  });

  // Revisit this, blocking the output is counter to what we want. Firs round, for this mode, we wait for completion to satisfy the CLI
  await buildPromise;

  return {
    stop: async () => { running = false; },
    isRunning: () => running,
    getStats: async () => stats,
    onLog: handler => subscribeToChannel(handler)
  };
};

export {
  spiderSegments,
  buildPatternFlyDocs,
  type DocsStats,
  type DocsInstance
};

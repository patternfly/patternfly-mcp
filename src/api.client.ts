import { type ComponentIndex, type ComponentEntry, type ResolvedComponentInfo } from './api.types';
import { getOptions } from './options.context';
import { memo } from './server.caching';
import { DEFAULT_OPTIONS } from './options.defaults';
import { log } from './logger';
import { buildFallbackIndex } from './api.fallback';

/**
 * Fetch the component index from the doc-core API.
 *
 * @param options
 * @note This is a lightweight static file (~14KB) served from Cloudflare's edge network,
 * prerendered at build time. It only changes when doc-core deploys.
 */
const fetchComponentIndex = async (options = getOptions()): Promise<ComponentIndex> => {
  const baseUrl = options.apiBaseUrl;
  const url = `${baseUrl}/api/component-index.json`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.xhrFetch.timeoutMs);

  timeout.unref();

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch component index from ${url}: ${response.status} ${response.statusText}`);
    }

    const data: ComponentIndex = await response.json();

    if (!data.version || !data.components) {
      throw new Error(`Invalid component index shape from ${url}: missing "version" or "components"`);
    }

    log.info(`Loaded component index: ${Object.keys(data.components).length} components (version: ${data.version})`);

    return data;
  } catch (error) {
    log.warn(
      `PatternFly doc-core API error at "${baseUrl}": ${error instanceof Error ? error.message : error}. ` +
      `Building fallback index from patternfly.org sitemap. ` +
      `Component search and metadata will work, but documentation ` +
      `content will be unavailable until the API is reachable.`
    );

    return buildFallbackIndex(options);
  } finally {
    clearTimeout(timeout);
  }
};

fetchComponentIndex.memo = memo(fetchComponentIndex, {
  cacheLimit: 1,
  expire: 10 * 60 * 1000,
  cacheErrors: false
});

const getComponentList = async (options = getOptions()): Promise<string[]> => {
  const index = await fetchComponentIndex.memo(options);

  return Object.keys(index.components).sort((a, b) => a.localeCompare(b));
};

getComponentList.memo = memo(getComponentList, {
  cacheLimit: 1,
  expire: 10 * 60 * 1000,
  cacheErrors: false
});

const getComponentInfo = async (name: string, options = getOptions()): Promise<ResolvedComponentInfo | undefined> => {
  const index = await fetchComponentIndex.memo(options);
  const entry: ComponentEntry | undefined = index.components[name];

  if (!entry) {
    return undefined;
  }

  return {
    name,
    ...entry
  };
};

getComponentInfo.memo = memo(getComponentInfo, DEFAULT_OPTIONS.toolMemoOptions.searchPatternFlyDocs);

const getApiVersion = async (options = getOptions()): Promise<string> => {
  const index = await fetchComponentIndex.memo(options);

  return index.version;
};

getApiVersion.memo = memo(getApiVersion, {
  cacheLimit: 1,
  expire: 10 * 60 * 1000,
  cacheErrors: false
});

export {
  fetchComponentIndex,
  getComponentList,
  getComponentInfo,
  getApiVersion
};

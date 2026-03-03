import { type ResolvedComponentInfo, type DocIncludeType } from './api.types';
import { getApiVersion, getComponentInfo } from './api.client';
import { transformDocs, transformProps, transformCss } from './api.transforms';
import { getOptions } from './options.context';
import { memo } from './server.caching';
import { DEFAULT_OPTIONS } from './options.defaults';
import { log } from './logger';

interface FetchedComponentData {
  name: string;
  info: ResolvedComponentInfo;
  docs?: string;
  props?: string;
  examples?: string[];
  css?: string;
}

const fetchApiEndpoint = async (
  url: string,
  accept = 'text/plain, text/markdown, */*',
  options = getOptions()
): Promise<string> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.xhrFetch.timeoutMs);

  timeout.unref();

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: accept }
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${url} → ${response.status} ${response.statusText}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
};

fetchApiEndpoint.memo = memo(fetchApiEndpoint, DEFAULT_OPTIONS.resourceMemoOptions.fetchUrl);

const buildComponentBaseUrl = (baseUrl: string, version: string, info: ResolvedComponentInfo): string =>
  `${baseUrl}/api/${version}/${info.section}/${info.page}`;

/**
 * @param baseUrl
 * @param version
 * @param info
 * @note Prefers the "react" tab when available, falls back to first tab.
 */
const fetchComponentDocs = async (baseUrl: string, version: string, info: ResolvedComponentInfo): Promise<string | undefined> => {
  const tab = info.tabs.includes('react') ? 'react' : info.tabs[0];

  if (!tab) {
    return undefined;
  }

  const url = `${buildComponentBaseUrl(baseUrl, version, info)}/${tab}/text`;

  try {
    const raw = await fetchApiEndpoint.memo(url);

    return transformDocs(raw, info.name);
  } catch (error) {
    log.warn(`Failed to fetch docs for ${info.name}: ${error}`);

    return undefined;
  }
};

const fetchComponentProps = async (baseUrl: string, version: string, info: ResolvedComponentInfo): Promise<string | undefined> => {
  if (!info.hasProps) {
    return undefined;
  }

  const url = `${buildComponentBaseUrl(baseUrl, version, info)}/props`;

  try {
    const raw = await fetchApiEndpoint.memo(url, 'application/json');

    return transformProps(raw, info.name);
  } catch (error) {
    log.warn(`Failed to fetch props for ${info.name}: ${error}`);

    return undefined;
  }
};

const fetchComponentCss = async (baseUrl: string, version: string, info: ResolvedComponentInfo): Promise<string | undefined> => {
  if (!info.hasCss) {
    return undefined;
  }

  const url = `${buildComponentBaseUrl(baseUrl, version, info)}/css`;

  try {
    const raw = await fetchApiEndpoint.memo(url, 'application/json');

    return transformCss(raw, info.name);
  } catch (error) {
    log.warn(`Failed to fetch CSS for ${info.name}: ${error}`);

    return undefined;
  }
};

const fetchComponentExamples = async (
  baseUrl: string,
  version: string,
  info: ResolvedComponentInfo,
  maxExamples = 3
): Promise<string[] | undefined> => {
  if (info.exampleCount === 0) {
    return undefined;
  }

  const tab = info.tabs.includes('react') ? 'react' : info.tabs[0];

  if (!tab) {
    return undefined;
  }

  const examplesListUrl = `${buildComponentBaseUrl(baseUrl, version, info)}/${tab}/examples`;

  try {
    const raw = await fetchApiEndpoint.memo(examplesListUrl, 'application/json');
    const exampleNames: string[] = JSON.parse(raw);
    const limited = exampleNames.slice(0, maxExamples);

    const examples: string[] = [];

    for (const exampleName of limited) {
      try {
        const code = await fetchApiEndpoint.memo(`${examplesListUrl}/${exampleName}`);

        examples.push(`### Example: ${exampleName}\n\n\`\`\`tsx\n${code}\n\`\`\``);
      } catch (error) {
        log.warn(`Failed to fetch example ${exampleName} for ${info.name}: ${error}`);
      }
    }

    return examples.length > 0 ? examples : undefined;
  } catch (error) {
    log.warn(`Failed to fetch examples list for ${info.name}: ${error}`);

    return undefined;
  }
};

/**
 * Fetch component data from the doc-core API, combining multiple data types in parallel.
 *
 * @param name
 * @param include
 * @param options
 * @note The `include` parameter controls which API endpoints are called. This allows
 * consumers to request only what they need (e.g., `['docs', 'props']`) to minimize
 * token usage and latency.
 */
const fetchComponentData = async (
  name: string,
  include: DocIncludeType[] = ['docs', 'props'],
  options = getOptions()
): Promise<FetchedComponentData | undefined> => {
  const info = await getComponentInfo.memo(name, options);

  if (!info) {
    return undefined;
  }

  const baseUrl = options.apiBaseUrl;
  const version = await getApiVersion.memo(options);

  const result: FetchedComponentData = { name, info };

  // When using the bundled fallback index, the API is unreachable — skip fetches
  // that would all fail and return only the component metadata.
  if (version === 'fallback') {
    return result;
  }

  const fetches: Promise<void>[] = [];

  if (include.includes('docs')) {
    fetches.push(
      fetchComponentDocs(baseUrl, version, info).then(docs => {
        if (docs) {
          result.docs = docs;
        }
      })
    );
  }

  if (include.includes('props')) {
    fetches.push(
      fetchComponentProps(baseUrl, version, info).then(props => {
        if (props) {
          result.props = props;
        }
      })
    );
  }

  if (include.includes('css')) {
    fetches.push(
      fetchComponentCss(baseUrl, version, info).then(css => {
        if (css) {
          result.css = css;
        }
      })
    );
  }

  if (include.includes('examples')) {
    fetches.push(
      fetchComponentExamples(baseUrl, version, info).then(examples => {
        if (examples) {
          result.examples = examples;
        }
      })
    );
  }

  await Promise.all(fetches);

  return result;
};

fetchComponentData.memo = memo(fetchComponentData, DEFAULT_OPTIONS.toolMemoOptions.usePatternFlyDocs);

export {
  fetchApiEndpoint,
  fetchComponentData,
  fetchComponentDocs,
  fetchComponentProps,
  fetchComponentCss,
  fetchComponentExamples,
  type FetchedComponentData
};

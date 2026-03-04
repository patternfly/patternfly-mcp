import { componentNames as schemaComponentNames } from '@patternfly/patternfly-component-schemas/json';
import { type ComponentEntry, type ComponentIndex } from './api.types';
import { getOptions } from './options.context';
import { log } from './logger';

const SITEMAP_URL = 'https://www.patternfly.org/sitemap.xml';

const toPascalCase = (slug: string): string =>
  slug
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

const schemaNameSet = new Set(schemaComponentNames.map(name => name.toLowerCase()));

const SECTION_PATTERNS: { section: string; pattern: RegExp }[] = [
  { section: 'components', pattern: /\/components\/(?:[^/]+\/)*([^/]+)\/?$/ },
  { section: 'layouts', pattern: /\/layouts\/([^/]+)\/?$/ },
  { section: 'charts', pattern: /\/charts\/([^/]+)\/?$/ }
];

const TAB_SUFFIXES = new Set([
  'html',
  'html-demos',
  'html-deprecated',
  'react-demos',
  'react-deprecated',
  'react-templates',
  'design-guidelines',
  'accessibility',
  'all-components',
  'about-layouts',
  'about-charts',
  'ECharts'
]);

const SKIP_PAGES = new Set([
  'all-components',
  'about-layouts',
  'about-charts',
  'custom-menus',
  'options-menu'
]);

const extractUrls = (xml: string): string[] => {
  const urls: string[] = [];
  const regex = /<loc>([^<]+)<\/loc>/g;
  let match;

  while ((match = regex.exec(xml)) !== null) {
    if (match[1]) {
      urls.push(match[1]);
    }
  }

  return urls;
};

const extractComponents = (
  urls: string[]
): Map<string, { section: string; page: string }> => {
  const seen = new Map<string, { section: string; page: string }>();

  for (const url of urls) {
    const path = new URL(url).pathname;

    for (const { section, pattern } of SECTION_PATTERNS) {
      const match = path.match(pattern);

      if (!match) {
        continue;
      }

      const slug = match[1];

      if (!slug || TAB_SUFFIXES.has(slug) || SKIP_PAGES.has(slug)) {
        continue;
      }

      const name = toPascalCase(slug);

      if (!seen.has(name)) {
        seen.set(name, { section, page: slug });
      }
    }
  }

  return seen;
};

/**
 * Build a ComponentIndex by fetching the patternfly.org sitemap and
 * cross-referencing with @patternfly/patternfly-component-schemas.
 *
 * Only called when the primary doc-core API is unreachable.
 *
 * @param options
 */
const buildFallbackIndex = async (
  options = getOptions()
): Promise<ComponentIndex> => {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.xhrFetch.timeoutMs
  );

  timeout.unref();

  try {
    const response = await fetch(SITEMAP_URL, { signal: controller.signal });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch sitemap: ${response.status} ${response.statusText}`
      );
    }

    const xml = await response.text();
    const urls = extractUrls(xml);
    const componentMap = extractComponents(urls);

    const components: Record<string, ComponentEntry> = {};

    for (const [name, { section, page }] of [...componentMap.entries()].sort(
      ([a], [b]) => a.localeCompare(b)
    )) {
      components[name] = {
        section,
        page,
        tabs: ['react'],
        hasProps: schemaNameSet.has(name.toLowerCase()),
        hasCss: false,
        exampleCount: 1
      };
    }

    log.info(
      `Built fallback index from sitemap: ${Object.keys(components).length} components`
    );

    return { version: 'fallback', components };
  } finally {
    clearTimeout(timeout);
  }
};

export { buildFallbackIndex };

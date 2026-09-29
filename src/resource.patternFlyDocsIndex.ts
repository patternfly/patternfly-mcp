import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  type McpResource,
  type McpResourceListResult,
  type McpResourceMetadataComplete,
  type McpResourceMetadataCompleteMemo
} from './mcpSdk';
import { memo } from './server.caching';
import { buildSearchString, stringJoin } from './server.helpers';
import { assertInput, assertInputStringLength, assertInputStringNumberEnumLike } from './server.assertions';
import { getOptions, runWithOptions } from './options.context';
import { getPatternFlyMcpResources } from './patternFly.getResources';
import { filterPatternFly } from './patternFly.search';
import { paramCompletion, normalizeEnumeratedCollectionVersion } from './resource.helpers';

/**
 * Name of the resource.
 */
const NAME = 'patternfly-docs-index';

/**
 * URI template for the resource.
 */
const URI_TEMPLATE = 'patternfly://docs/index{?version,category,section,collection}';

/**
 * URI description for the resource.
 */
const URI_DESCRIPTION = `Filter by resource version, category, section, and collection. ${URI_TEMPLATE}`;

/**
 * Resource configuration.
 */
const CONFIG = {
  title: 'PatternFly Documentation Index',
  description: `A list of documentation links including accessibility, components, charts, development, writing, and AI guidance files. ${URI_DESCRIPTION}`,
  mimeType: 'text/markdown'
};

/**
 * List resources callback for the URI template by documentation collection.
 *
 * @note It's important to keep lists focused and concise, avoid listing all resources.
 *
 * @returns The list of available resources.
 */
const listResources = async () => {
  const { byCollection } = await getPatternFlyMcpResources.memo();
  const resources: McpResourceListResult[] = [];

  Object.entries(byCollection)
    .sort(([a], [b]) => b.localeCompare(a))
    .forEach(([collection, entry]) => {
      const displayCollection = entry[0]?.displayCollection || collection;

      resources.push({
        uri: `patternfly://docs/index?collection=${encodeURIComponent(collection)}`,
        mimeType: 'text/markdown',
        name: `Docs Index for ${displayCollection}`,
        description: `Documentation entry point for collection ${collection}. ${URI_DESCRIPTION}`
      });
    });

  return {
    resources: [
      {
        uri: 'patternfly://docs/index',
        mimeType: 'text/markdown',
        name: 'Docs Index',
        description: `Documentation entry point for collections. This is the recommended starting point. ${URI_DESCRIPTION}`
      },
      ...resources.sort((a, b) => a.name.localeCompare(b.name))
    ]
  };
};

/**
 * Memoized version of listResources.
 */
listResources.memo = memo(listResources);

/**
 * Name completion callback for the URI template.
 *
 * @note If version is not available, the latest version is used to refine the search results
 * since it aligns with the default behavior of the PatternFly documentation.
 *
 * @param name - The value to complete.
 * @param context - The completion context.
 * @returns The list of available names.
 */
const uriNameComplete: McpResourceMetadataCompleteMemo = async (name: string, context) => {
  const { collection, version, category, section } = context?.arguments || {};
  const { names } = await paramCompletion({ category, collection, name, section, version });

  return names;
};

/**
 * Memoized version of uriNameComplete.
 */
uriNameComplete.memo = memo(uriNameComplete);

/**
 * Category completion callback for the URI template.
 *
 * @param category - The value to filter-by/complete.
 * @param context - The completion context containing arguments for the URI template.
 * @returns The list of available categories, or an empty list.
 */
const uriCategoryComplete: McpResourceMetadataCompleteMemo = async (category: string, context) => {
  const { collection, version, section, name } = context?.arguments || {};
  const { categories } = await paramCompletion({ category, collection, name, section, version });

  return categories;
};

/**
 * Memoized version of uriCategoryComplete.
 */
uriCategoryComplete.memo = memo(uriCategoryComplete);

/**
 * Section completion callback for the URI template.
 *
 * @param section - The value to filter-by/complete.
 * @param context - The completion context containing arguments for the URI template.
 * @returns The list of available sections, or an empty list.
 */
const uriSectionComplete: McpResourceMetadataCompleteMemo = async (section: string, context) => {
  const { collection, version, category, name } = context?.arguments || {};
  const { sections } = await paramCompletion({ category, collection, name, section, version });

  return sections;
};

/**
 * Memoized version of uriSectionComplete.
 */
uriSectionComplete.memo = memo(uriSectionComplete);

/**
 * Name completion callback for the URI template.
 *
 * @param version - The value to complete.
 * @param context - The completion context containing arguments for the URI template.
 * @returns The list of available versions, or an empty list.
 */
const uriVersionComplete: McpResourceMetadataCompleteMemo = async (version: string, context) => {
  const { collection, section, category, name } = context?.arguments || {};
  const { versions } = await paramCompletion({ category, collection, name, section, version });

  return versions;
};

/**
 * Memoized version of uriVersionComplete.
 */
uriVersionComplete.memo = memo(uriVersionComplete);

/**
 * Collection completion callback for the URI template.
 *
 * @param collection - The value to filter-by/complete.
 * @param context - The completion context containing arguments for the URI template.
 * @returns The list of available collections, or an empty list.
 */
const uriCollectionComplete: McpResourceMetadataCompleteMemo = async (collection: string, context) => {
  const { category, name, section, version } = context?.arguments || {};
  const { collections } = await paramCompletion({ category, collection, name, section, version });

  return collections;
};

/**
 * Memoized version of uriCollectionComplete.
 */
uriCollectionComplete.memo = memo(uriCollectionComplete);

/**
 * Resource callback for the documentation index.
 *
 * @note The callback response is a high-level index potentially grouping multiple "entries"
 * by a single URI. This is an optimization already, but we can review moving responses over
 * to using resource IDs instead of the current grouping uri mechanism IF we opt to review
 * pagination.
 *
 * @param passedUri - URI of the resource.
 * @param variables - Variables for the resource.
 * @param options - Global options
 * @returns The resource contents.
 */
const resourceCallback = async (passedUri: URL, variables: Record<string, string | string[]>, options = getOptions()) => {
  const { category, collection, version, section } = variables || {};

  if (collection) {
    assertInputStringLength(collection, {
      ...options.minMax.inputStrings,
      inputDisplayName: 'collection'
    });
  }

  if (version) {
    assertInputStringLength(version, {
      ...options.minMax.inputStrings,
      inputDisplayName: 'version'
    });
  }

  const { collectionVersions } = await getPatternFlyMcpResources.memo();

  if (version) {
    assertInputStringNumberEnumLike(version, collectionVersions, {
      inputDisplayName: 'version'
    });
  }

  if (category) {
    assertInputStringLength(category, {
      ...options.minMax.inputStrings,
      inputDisplayName: 'category'
    });
  }

  if (section) {
    assertInputStringLength(section, {
      ...options.minMax.inputStrings,
      inputDisplayName: 'section'
    });
  }

  const normalizedVersion = await normalizeEnumeratedCollectionVersion.memo(version, collection);
  const updatedVersion = normalizedVersion || (version && String(version).trim()) || undefined;

  const { byResource } = await filterPatternFly.memo({
    collection,
    version: updatedVersion,
    category,
    section
  });

  // Generate the consolidated list, apply search/query string.
  const docsIndex = Array.from(byResource.values())
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((resource, index) => {
      const firstEntry = resource.entries[0];
      const version = firstEntry?.version || updatedVersion;
      const categories = new Set(resource.entries.map(entry => entry.displayCategory));
      const categoryList = Array.from(categories).sort().join(', ');
      const searchString = buildSearchString({ category, collection, section }, { prefix: true, base: resource.uri });

      return `${index + 1}. [${resource.name} - ${categoryList} (${version})](${resource.uri}${searchString || ''})`;
    });

  assertInput(
    docsIndex.length > 0,
    () => {
      let suggestionMessage = '';

      if (category || section) {
        const variableList = [
          (category && 'category') || undefined,
          (section && 'section') || undefined
        ].filter(Boolean).join(' or ');

        suggestionMessage = ` Try using a different ${variableList} search.`;
      }

      return `No documentation found for "${passedUri?.toString()}".${suggestionMessage}`;
    }
  );

  const allDocs = stringJoin.newline(
    (updatedVersion && `# Documentation Index for "${updatedVersion}"`) || `# Documentation Index`,
    '',
    '',
    ...(docsIndex || [])
  );

  return {
    contents: [
      {
        uri: passedUri?.toString(),
        mimeType: 'text/markdown',
        text: allDocs
      }
    ]
  };
};

/**
 * Resource creator for the documentation index and metadata resources.
 *
 * @note The `metaConfig` determines if a metadata resource is generated. Remove
 * the config to disable it.
 *
 * @param options - Global options
 * @returns {McpResource} The resource definition tuple
 */
const patternFlyDocsIndexResource = (options = getOptions()): McpResource => {
  const list = async () => runWithOptions(options, async () => listResources.memo());

  const complete: { [callback: string]: McpResourceMetadataComplete } = {
    category: async (...args) => runWithOptions(options, async () => uriCategoryComplete.memo(...args)),
    collection: async (...args) => runWithOptions(options, async () => uriCollectionComplete.memo(...args)),
    section: async (...args) => runWithOptions(options, async () => uriSectionComplete.memo(...args)),
    version: async (...args) => runWithOptions(options, async () => uriVersionComplete.memo(...args))
  };

  const callback: McpResource[3] = async (uri, variables) =>
    runWithOptions(options, async () => resourceCallback(uri, variables, options));

  return [
    NAME,
    new ResourceTemplate(URI_TEMPLATE, {
      list,
      complete
    }),
    CONFIG,
    callback,
    {
      complete,
      registerAllSearchCombinations: true,
      metaConfig: {
        uri: 'patternfly://docs/meta{?collection}',
        title: `${CONFIG.title} Metadata`,
        description: 'Use these parameters to filter the documentation index.'
      }
    }
  ];
};

export {
  patternFlyDocsIndexResource,
  listResources,
  resourceCallback,
  uriCollectionComplete,
  uriCategoryComplete,
  uriNameComplete,
  uriSectionComplete,
  uriVersionComplete,
  NAME,
  URI_TEMPLATE,
  URI_DESCRIPTION,
  CONFIG
};

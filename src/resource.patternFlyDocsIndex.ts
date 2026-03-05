import {
  ResourceTemplate,
  type CompleteResourceTemplateCallback
} from '@modelcontextprotocol/sdk/server/mcp.js';
import { type McpResource } from './server';
import { memo } from './server.caching';
import { buildSearchString, stringJoin } from './server.helpers';
import { assertInput, assertInputStringLength } from './server.assertions';
import { getOptions, runWithOptions } from './options.context';
import { getPatternFlyMcpResources } from './patternFly.getResources';
import { normalizeEnumeratedPatternFlyVersion } from './patternFly.helpers';
import { filterPatternFly } from './patternFly.search';
import { paramCompletion } from './resource.helpers';

/**
 * Extended callback type that combines the `CompleteResourceTemplateCallback` type
 * and an additional `memo` property.
 *
 * @extends CompleteResourceTemplateCallback
 */
type ExtendedCompleteResourceTemplateCallback = { memo: CompleteResourceTemplateCallback } & CompleteResourceTemplateCallback;

/**
 * List resources result type.
 *
 * @note This is temporary until MCP SDK exports ListResourcesResult.
 *
 * @property uri - The fully qualified URI of the resource.
 * @property name - A human-readable name for the resource.
 * @property [mimeType] - The MIME type of the content.
 * @property [description] - A brief hint for the model.
 */
type PatterFlyListResourceResult = {
  uri: string;
  name: string;
  mimeType?: string;
  description?: string;
};

/**
 * Name of the resource.
 */
const NAME = 'patternfly-docs-index';

/**
 * URI template for the resource.
 */
const URI_TEMPLATE = 'patternfly://docs/index{?version,category,section}';

/**
 * URI description for the resource.
 */
const URI_DESCRIPTION = `Filter by PatternFly version, category, and section, ${URI_TEMPLATE}`;

/**
 * Resource configuration.
 */
const CONFIG = {
  title: 'PatternFly Documentation Index',
  description: `A list of PatternFly documentation links including accessibility, components, charts, development, writing, and AI guidance files. ${URI_DESCRIPTION}`,
  mimeType: 'text/markdown'
};

/**
 * List resources callback for the URI template by available versions only.
 *
 * @note It's important to keep lists focused and concise, avoid listing all resources.
 *
 * @returns {Promise<PatterFlyListResourceResult>} The list of available resources.
 */
const listResources = async () => {
  const { availableVersions, byVersion } = await getPatternFlyMcpResources.memo();
  const resources: PatterFlyListResourceResult[] = [];

  Object.entries(byVersion)
    .filter(([version]) => availableVersions.includes(version))
    .sort(([a], [b]) => b.localeCompare(a))
    .forEach(([version]) => {
      resources.push({
        uri: `patternfly://docs/index?version=${version}`,
        mimeType: 'text/markdown',
        name: `Docs Index (${version})`,
        description: `Documentation entry point for PatternFly version ${version}. ${URI_DESCRIPTION}`
      });
    });

  return {
    resources: [
      {
        uri: 'patternfly://docs/index',
        mimeType: 'text/markdown',
        name: 'Docs Index (Latest)',
        description: `Documentation entry point for the latest PatternFly version. This is the recommended starting point. ${URI_DESCRIPTION}`
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
const uriNameComplete: ExtendedCompleteResourceTemplateCallback = async (name: string, context) => {
  const { version, category, section } = context?.arguments || {};
  const { names } = await paramCompletion({ category, name, section, version });

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
const uriCategoryComplete: ExtendedCompleteResourceTemplateCallback = async (category: string, context) => {
  const { version, section, name } = context?.arguments || {};
  const { categories } = await paramCompletion({ category, name, section, version });

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
const uriSectionComplete: ExtendedCompleteResourceTemplateCallback = async (section: string, context) => {
  const { version, category, name } = context?.arguments || {};
  const { sections } = await paramCompletion({ category, name, section, version });

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
const uriVersionComplete: ExtendedCompleteResourceTemplateCallback = async (version: string, context) => {
  const { section, category, name } = context?.arguments || {};
  const { versions } = await paramCompletion({ category, name, section, version });

  return versions;
};

/**
 * Memoized version of uriVersionComplete.
 */
uriVersionComplete.memo = memo(uriVersionComplete);

/**
 * Resource callback for the documentation index.
 *
 * @param passedUri - URI of the resource.
 * @param variables - Variables for the resource.
 * @param options - Global options
 * @returns The resource contents.
 */
const resourceCallback = async (passedUri: URL, variables: Record<string, string | string[]>, options = getOptions()) => {
  const { category, version, section } = variables || {};

  if (version) {
    assertInputStringLength(version, {
      ...options.minMax.inputStrings,
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

  const { availableVersions, latestVersion } = await getPatternFlyMcpResources.memo();
  const normalizedVersion = await normalizeEnumeratedPatternFlyVersion.memo(version);

  assertInput(
    !version || Boolean(normalizedVersion),
    `Invalid PatternFly version "${version?.trim()}". Available versions are: ${availableVersions.join(', ')}`
  );

  const updatedVersion = normalizedVersion || latestVersion;

  const { byEntry } = await filterPatternFly.memo({
    version: updatedVersion,
    category,
    section
  });

  // Group by URI
  const groupedByUri = new Map<string, { name: string, version: string, categories: Set<string> }>();

  byEntry.forEach(entry => {
    if (!groupedByUri.has(entry.uri)) {
      groupedByUri.set(entry.uri, {
        name: entry.name,
        version: entry.version,
        categories: new Set([entry.displayCategory])
      });
    } else {
      groupedByUri.get(entry.uri)?.categories.add(entry.displayCategory);
    }
  });

  // Generate the consolidated list, apply search/query string
  const docsIndex = Array.from(groupedByUri.entries())
    .sort(([_aUri, aData], [_bUri, bData]) => aData.name.localeCompare(bData.name))
    .map(([uri, data], index) => {
      const categoryList = Array.from(data.categories).join(', ');
      const searchString = buildSearchString({ section, category }, { prefix: true });

      return `${index + 1}. [${data.name} - ${categoryList} (${data.version})](${uri}${searchString || ''})`;
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
    `# PatternFly Documentation Index for "${updatedVersion}"`,
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
 * Resource creator for the documentation index.
 *
 * @param options - Global options
 * @returns {McpResource} The resource definition tuple
 */
const patternFlyDocsIndexResource = (options = getOptions()): McpResource => {
  const list = async () => runWithOptions(options, async () => listResources.memo());

  const complete: { [callback: string]: CompleteResourceTemplateCallback } = {
    category: async (...args) => runWithOptions(options, async () => uriCategoryComplete.memo(...args)),
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
      registerAllSearchCombinations: true
    }
  ];
};

export {
  patternFlyDocsIndexResource,
  listResources,
  resourceCallback,
  uriCategoryComplete,
  uriNameComplete,
  uriSectionComplete,
  uriVersionComplete,
  NAME,
  URI_TEMPLATE,
  URI_DESCRIPTION,
  CONFIG,
  type ExtendedCompleteResourceTemplateCallback,
  type PatterFlyListResourceResult
};

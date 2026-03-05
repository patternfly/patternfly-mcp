import {
  ResourceTemplate,
  type CompleteResourceTemplateCallback
} from '@modelcontextprotocol/sdk/server/mcp.js';
import { type McpResource } from './server';
import { memo } from './server.caching';
import { buildSearchString, stringJoin } from './server.helpers';
import { assertInput, assertInputStringLength } from './server.assertions';
import { getOptions, runWithOptions } from './options.context';
import { normalizeEnumeratedPatternFlyVersion } from './patternFly.helpers';
import { getPatternFlyMcpResources } from './patternFly.getResources';
import { filterPatternFly } from './patternFly.search';
import {
  type PatternFlyListResourceResult,
  type ExtendedCompleteResourceTemplateCallback
} from './resource.patternFlyDocsIndex';
import { paramCompletion } from './resource.helpers';

/**
 * Name of the resource.
 */
const NAME = 'patternfly-components-index';

/**
 * URI template for the resource.
 */
const URI_TEMPLATE = 'patternfly://components/index{?version,category}';

/**
 * URI description for the resource.
 */
const URI_DESCRIPTION = `Filter by PatternFly version, and category, ${URI_TEMPLATE}`;

/**
 * Resource configuration.
 */
const CONFIG = {
  title: 'PatternFly Components Index',
  description: `A list of all PatternFly component names available for documentation retrieval. ${URI_DESCRIPTION}`,
  mimeType: 'text/markdown'
};

/**
 * List resources callback for the URI template.
 *
 * @note We use "byVersionComponentNames" instead of "byVersion" because it's specific to components.
 * Docs resources don't necessarily contain all components.
 *
 * @returns {Promise<PatterFlyListResourceResult>} The list of available resources.
 */
const listResources = async () => {
  const { availableVersions, byVersionComponentNames } = await getPatternFlyMcpResources.memo();
  const resources: PatternFlyListResourceResult[] = [];

  Array.from(byVersionComponentNames)
    .filter(([version]) => availableVersions.includes(version))
    .sort(([a], [b]) => b.localeCompare(a))
    .forEach(([version]) => {
      resources.push({
        uri: `patternfly://components/index?version=${encodeURIComponent(version)}`,
        mimeType: 'text/markdown',
        name: `Component Index (${version})`,
        description: `Component documentation entry point for PatternFly version ${version}. ${URI_DESCRIPTION}`
      });
    });

  return {
    resources: [
      {
        uri: 'patternfly://components/index',
        mimeType: 'text/markdown',
        name: 'Components Index (Latest)',
        description: `Component documentation entry point for the latest PatternFly version. This is the recommended starting point. ${URI_DESCRIPTION}`
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
 * Category completion callback for the URI template.
 *
 * @param category - The value to filter-by/complete.
 * @param context - The completion context containing arguments for the URI template.
 * @returns The list of available categories, or an empty list.
 */
const uriCategoryComplete: ExtendedCompleteResourceTemplateCallback = async (category: string, context) => {
  const { version, name } = context?.arguments || {};
  const section = 'components';
  const { categories } = await paramCompletion({ category, name, section, version });

  return categories;
};

/**
 * Memoized version of uriCategoryComplete.
 */
uriCategoryComplete.memo = memo(uriCategoryComplete);

/**
 * Name completion callback for the URI template.
 *
 * @param version - The value to complete.
 * @param context - The completion context containing arguments for the URI template.
 * @returns The list of available versions, or an empty list.
 */
const uriVersionComplete: ExtendedCompleteResourceTemplateCallback = async (version: string, context) => {
  const { category, name } = context?.arguments || {};
  const section = 'components';
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
 * @param options - Options for the resource.
 * @returns The resource contents.
 */
const resourceCallback = async (passedUri: URL, variables: Record<string, string | string[]>, options = getOptions()) => {
  const { version, category } = variables || {};
  const section = 'components';

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

  const { availableVersions, latestVersion } = await getPatternFlyMcpResources.memo();
  const normalizedVersion = await normalizeEnumeratedPatternFlyVersion.memo(version);

  assertInput(
    !version || Boolean(normalizedVersion),
    `Invalid PatternFly version "${version?.trim()}". Available versions are: ${availableVersions.join(', ')}`
  );

  const updatedVersion = normalizedVersion || latestVersion;
  const { byResource } = await filterPatternFly.memo({ version: updatedVersion, section, category });

  const docsIndex = Array.from(byResource.entries())
    .sort(([_aUri, aData], [_bUri, bData]) => aData.name.localeCompare(bData.name))
    .map(([_name, data], index) => {
      const searchString = buildSearchString({
        version: updatedVersion,
        category
      }, { prefix: true });

      return `${index + 1}. [${data.name} (${updatedVersion})](${data.uri}${searchString || ''})`;
    });

  return {
    contents: [{
      uri: passedUri?.toString(),
      mimeType: 'text/markdown',
      text: stringJoin.newline(
        `# PatternFly Components Index for "${updatedVersion}"`,
        '',
        '',
        ...docsIndex || []
      )
    }]
  };
};

/**
 * Resource creator for the component schemas index.
 *
 * @param options - Global options
 * @returns {McpResource} The resource definition tuple
 */
const patternFlyComponentsIndexResource = (options = getOptions()): McpResource => {
  const list = async () => runWithOptions(options, async () => listResources.memo());

  const complete: { [callback: string]: CompleteResourceTemplateCallback } = {
    category: async (...args) => runWithOptions(options, async () => uriCategoryComplete.memo(...args)),
    version: async (...args) => runWithOptions(options, async () => uriVersionComplete.memo(...args))
  };

  const callback: McpResource[3] = async (uri, variables) =>
    runWithOptions(options, async () => resourceCallback(uri, variables));

  return [
    NAME,
    new ResourceTemplate(URI_TEMPLATE, {
      list,
      complete
    }),
    CONFIG,
    callback,
    {
      complete
    }
  ];
};

export {
  patternFlyComponentsIndexResource,
  listResources,
  resourceCallback,
  uriCategoryComplete,
  uriVersionComplete,
  NAME,
  URI_TEMPLATE,
  URI_DESCRIPTION,
  CONFIG
};

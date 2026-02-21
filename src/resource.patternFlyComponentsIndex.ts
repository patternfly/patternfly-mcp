import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type McpResource } from './server';
import { memo } from './server.caching';
import { stringJoin } from './server.helpers';
import { getOptions, runWithOptions } from './options.context';
import {
  getPatternFlyMcpResources,
  getPatternFlyReactComponentNames
} from './patternFly.getResources';
import { uriVersionComplete, type PatterFlyListResourceResult } from './resource.patternFlyDocsIndex';
import { normalizeEnumeratedPatternFlyVersion } from './patternFly.helpers';

/**
 * Name of the resource.
 */
const NAME = 'patternfly-components-index';

/**
 * URI template for the resource.
 */
const URI_TEMPLATE = 'patternfly://components/index{?version,section,category}';

/**
 * Resource configuration.
 */
const CONFIG = {
  title: 'PatternFly Components Index',
  description: 'A list of all PatternFly component names available for documentation retrieval',
  mimeType: 'text/markdown'
};

/**
 * List resources callback for the URI template.
 *
 * @returns {Promise<PatterFlyListResourceResult>} The list of available resources.
 */
const listResources = async () => {
  const { byVersionComponentNames, resources: docsResources } = await getPatternFlyMcpResources.memo();
  const { componentNamesWithSchemasMap } = await getPatternFlyReactComponentNames.memo();
  const resources: PatterFlyListResourceResult[] = [];

  Object.entries(byVersionComponentNames).sort(([a], [b]) => b.localeCompare(a)).forEach(([version, componentNames]) => {
    const versionResource: PatterFlyListResourceResult[] = [];

    componentNames.forEach(componentName => {
      const displayName = componentNamesWithSchemasMap[componentName];
      const isSchemasAvailable = docsResources.get(componentName)?.versions?.[version]?.isSchemasAvailable ?? false;

      versionResource.push({
        uri: `patternfly://docs/${version}/${componentName}`,
        mimeType: 'text/markdown',
        name: `${displayName} (${version})`,
        description: `Component documentation for PatternFly version "${version}" of "${displayName}.${isSchemasAvailable ? ' (JSON Schema available)' : ''}"`
      });
    });

    resources.push(...versionResource);
  });

  return {
    resources
  };
};

/**
 * Memoized version of listResources.
 */
listResources.memo = memo(listResources);

/**
 * Resource callback for the documentation index.
 *
 * @param uri - URI of the resource.
 * @param variables - Variables for the resource.
 * @returns The resource contents.
 */
const resourceCallback = async (uri: URL, variables: Record<string, string>) => {
  const { version } = variables || {};
  let updatedVersion = await normalizeEnumeratedPatternFlyVersion.memo(version);
  const { latestVersion, byVersion, resources } = await getPatternFlyMcpResources.memo();

  if (!updatedVersion) {
    updatedVersion = latestVersion;
  }

  const entries = byVersion[updatedVersion] || [];

  // Group by URI
  const groupedByUri = new Map<string, { name: string, version: string }>();

  entries.forEach(entry => {
    const entryName = entry.name.toLowerCase();
    const resource = resources.get(entryName)?.versions[updatedVersion];

    if (resource?.uri) {
      groupedByUri.set(resource.uri, { name: entry.name, version: entry.version });
    }
  });

  // Generate the consolidated list
  const docsIndex = Array.from(groupedByUri.entries())
    .sort(([_aUri, aData], [_bUri, bData]) => aData.name.localeCompare(bData.name))
    .map(([uri, data], index) => `${index + 1}. [${data.name} (${data.version})](${uri})`);

  return {
    contents: [{
      uri: 'patternfly://schemas/index',
      mimeType: 'text/markdown',
      text: stringJoin.newline(
        `# PatternFly Component Names Index for "${updatedVersion}"`,
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
const patternFlyComponentsIndexResource = (options = getOptions()): McpResource => [
  NAME,
  new ResourceTemplate(URI_TEMPLATE, {
    list: async () => runWithOptions(options, async () => listResources.memo()),
    complete: {
      version: async (...args) => runWithOptions(options, async () => uriVersionComplete(...args))
    }
  }),
  CONFIG,
  async (uri, variables) => runWithOptions(options, async () => resourceCallback(uri, variables))
];

export {
  patternFlyComponentsIndexResource,
  listResources,
  resourceCallback,
  uriVersionComplete,
  NAME,
  URI_TEMPLATE,
  CONFIG
};

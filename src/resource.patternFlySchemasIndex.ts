import { type McpResource } from './server';
import { stringJoin } from './server.helpers';
import { getOptions, runWithOptions } from './options.context';
import { getPatternFlyMcpResources } from './patternFly.getResources';
import { normalizeEnumeratedPatternFlyVersion } from './patternFly.helpers';
import { filterPatternFly } from './patternFly.search';
import { assertInput, assertInputStringLength } from './server.assertions';

/**
 * Name of the resource.
 */
const NAME = 'patternfly-schemas-index';

/**
 * URI template for the resource.
 */
const URI_TEMPLATE = 'patternfly://schemas/index';

/**
 * Resource configuration.
 */
const CONFIG = {
  title: 'PatternFly Component Schemas Index',
  description: 'A list of all PatternFly component names available for JSON Schema retrieval',
  mimeType: 'text/markdown'
};

/**
 * Resource callback for the documentation index.
 *
 * @param passedUri - URI of the resource.
 * @param variables - Variables for the resource.
 * @param options - Options for the resource callback.
 * @returns The resource contents.
 */
const resourceCallback = async (passedUri: URL, variables: Record<string, string>, options = getOptions()) => {
  const { version } = variables || {};

  if (version) {
    assertInputStringLength(version, {
      ...options.minMax.inputStrings,
      inputDisplayName: 'version'
    });
  }

  const { availableSchemasVersions, latestSchemasVersion } = await getPatternFlyMcpResources.memo();
  const normalizedVersion = await normalizeEnumeratedPatternFlyVersion.memo(version);

  assertInput(
    !version || Boolean(normalizedVersion),
    `Invalid PatternFly version "${version?.trim()}". Available versions are: ${availableSchemasVersions.join(', ')}`
  );

  const updatedVersion = normalizedVersion || latestSchemasVersion;

  let docsIndex: string[] = [];

  if (availableSchemasVersions.includes(updatedVersion)) {
    const { byResource } = await filterPatternFly.memo({
      version: updatedVersion
    });

    const groupedByUri = new Map<string, { name: string, version: string }>();

    byResource.forEach(resource => {
      if (resource.uriSchemas) {
        groupedByUri.set(resource.uriSchemas, { name: resource.name, version: updatedVersion });
      }
    });

    docsIndex = Array.from(groupedByUri.entries())
      .sort(([_aUri, aData], [_bUri, bData]) => aData.name.localeCompare(bData.name))
      .map(([uri, data], index) => `${index + 1}. [${data.name} (${data.version})](${uri})`);
  }

  assertInput(
    docsIndex.length > 0,
    () => {
      let suggestionMessage = '';

      if (!availableSchemasVersions.includes(updatedVersion)) {
        suggestionMessage = ` Component schemas are only available for PatternFly versions ${availableSchemasVersions.join(', ')}`;
      }

      return `No component JSON schemas found for "${passedUri?.toString()}".${suggestionMessage}`;
    }
  );

  return {
    contents: [{
      uri: passedUri?.toString(),
      mimeType: 'text/markdown',
      text: stringJoin.newline(
        `# PatternFly Component JSON Schemas Index for "${updatedVersion}"`,
        '',
        '',
        ...docsIndex
      )
    }]
  };
};

/**
 * Resource creator for the component schemas index.
 *
 * @note This resource is being considered for deprecation in favor of a more
 * all encompassing resource, like "resource.patternFlyComponentsIndex."
 *
 * @param options - Global options
 * @returns {McpResource} The resource definition tuple
 */
const patternFlySchemasIndexResource = (options = getOptions()): McpResource => [
  NAME,
  URI_TEMPLATE,
  CONFIG,
  async (uri, variables) => runWithOptions(options, async () => resourceCallback(uri, variables, options))
];

export {
  patternFlySchemasIndexResource,
  resourceCallback,
  NAME,
  URI_TEMPLATE,
  CONFIG
};

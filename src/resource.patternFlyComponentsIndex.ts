import { type McpResource } from './server';
import { buildSearchString, stringJoin } from './server.helpers';
import { assertInput, assertInputStringLength } from './server.assertions';
import { getOptions, runWithOptions } from './options.context';
import { normalizeEnumeratedPatternFlyVersion } from './patternFly.helpers';
import { getPatternFlyMcpResources } from './patternFly.getResources';
import { filterPatternFly } from './patternFly.search';

/**
 * Name of the resource.
 */
const NAME = 'patternfly-components-index';

/**
 * URI template for the resource.
 */
const URI_TEMPLATE = 'patternfly://components/index';

/**
 * Resource configuration.
 */
const CONFIG = {
  title: 'PatternFly Components Index',
  description: 'A list of all PatternFly component names available for documentation retrieval',
  mimeType: 'text/markdown'
};

/**
 * Resource callback for the documentation index.
 *
 * @param passedUri - URI of the resource.
 * @param variables - Variables for the resource.
 * @param options - Options for the resource.
 * @returns The resource contents.
 */
const resourceCallback = async (passedUri: URL, variables: Record<string, string>, options = getOptions()) => {
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
      uri: passedUri?.toString() || 'patternfly://components/index',
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
  URI_TEMPLATE,
  CONFIG,
  async (uri, variables) => runWithOptions(options, async () => resourceCallback(uri, variables))
];

export {
  patternFlyComponentsIndexResource,
  resourceCallback,
  NAME,
  URI_TEMPLATE,
  CONFIG
};

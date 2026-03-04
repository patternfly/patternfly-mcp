import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type McpResource } from './server';
import { getOptions, runWithOptions } from './options.context';
import { filterPatternFly } from './patternFly.search';
import {
  getPatternFlyComponentSchema,
  getPatternFlyMcpResources,
  type PatternFlyComponentSchema
} from './patternFly.getResources';
import { normalizeEnumeratedPatternFlyVersion } from './patternFly.helpers';
import { assertInput, assertInputStringLength } from './server.assertions';

/**
 * Name of the resource template.
 */
const NAME = 'patternfly-schemas-template';

/**
 * URI template for the resource.
 */
const URI_TEMPLATE = 'patternfly://schemas/{name}';

/**
 * Resource configuration.
 */
const CONFIG = {
  title: 'PatternFly Component Schema',
  description: 'Retrieve the JSON Schema for a specific PatternFly component by name',
  mimeType: 'application/json'
};

/**
 * Resource callback for the documentation template.
 *
 * @note We temporarily use `DEFAULT_OPTIONS` `latestSchemasVersion`
 *
 * @param passedUri - The URI of the resource.
 * @param variables - The variables of the resource.
 * @param options - Global options
 * @returns The resource contents.
 */
const resourceCallback = async (passedUri: URL, variables: Record<string, string>, options = getOptions()) => {
  const { version, name } = variables || {};

  if (version) {
    assertInputStringLength(version, {
      ...options.minMax.inputStrings,
      inputDisplayName: 'version'
    });
  }

  assertInputStringLength(name, {
    ...options.minMax.inputStrings,
    inputDisplayName: 'name'
  });

  const { availableSchemasVersions, latestSchemasVersion } = await getPatternFlyMcpResources.memo();
  const normalizedVersion = await normalizeEnumeratedPatternFlyVersion.memo(version);

  assertInput(
    !version || Boolean(normalizedVersion),
    `Invalid PatternFly version "${version?.trim()}". Available versions are: ${availableSchemasVersions.join(', ')}`
  );

  const updatedVersion = normalizedVersion || latestSchemasVersion;
  const updatedName = name.trim();

  const { byEntry } = await filterPatternFly.memo({
    version: updatedVersion,
    name: updatedName
  });

  let result: PatternFlyComponentSchema | undefined;
  const matchedSchemas: string[] = [];

  byEntry.forEach(result => {
    if (result.uriSchemas) {
      matchedSchemas.push(result.name);
    }
  });

  if (matchedSchemas[0]) {
    result = await getPatternFlyComponentSchema.memo(matchedSchemas[0]);
  }

  assertInput(
    matchedSchemas.length > 0 && result !== undefined,
    () => {
      let suggestionMessage = '';

      if (!availableSchemasVersions.includes(updatedVersion)) {
        suggestionMessage = ` Component schemas are only available for PatternFly versions ${availableSchemasVersions.join(', ')}`;
      }

      return `No component JSON schemas found for "${passedUri?.toString()}".${suggestionMessage}`;
    }
  );

  return {
    contents: [
      {
        uri: passedUri?.toString() || `patternfly://schemas/${updatedVersion}/${updatedName}`,
        mimeType: 'application/json',
        text: JSON.stringify(result, null, 2)
      }
    ]
  };
};

/**
 * Resource creator for the component schemas template.
 *
 * @note This resource is being considered for deprecation in favor of a more
 * all encompassing resource, like "resource.patternFlyComponentsTemplate."
 *
 * @param options - Global options
 * @returns {McpResource} The resource definition tuple
 */
const patternFlySchemasTemplateResource = (options = getOptions()): McpResource => [
  NAME,
  new ResourceTemplate(URI_TEMPLATE, {
    list: undefined
  }),
  CONFIG,
  async (uri, variables) => runWithOptions(options, async () => resourceCallback(uri, variables, options))
];

export {
  patternFlySchemasTemplateResource,
  resourceCallback,
  NAME,
  URI_TEMPLATE,
  CONFIG
};

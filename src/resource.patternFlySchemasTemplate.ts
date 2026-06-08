import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  type McpResource,
  type McpResourceMetadataComplete,
  type McpResourceMetadataCompleteMemo
} from './mcpSdk';
import { memo } from './server.caching';
import { assertInput, assertInputStringLength } from './server.assertions';
import { getOptions, runWithOptions } from './options.context';
import { filterPatternFly } from './patternFly.search';
import {
  getPatternFlyComponentSchema,
  getPatternFlyMcpResources
} from './patternFly.getResources';
import { normalizeEnumeratedPatternFlyVersion } from './patternFly.helpers';
import { uriCategoryComplete, uriVersionComplete } from './resource.patternFlyComponentsIndex';
import { paramCompletion } from './resource.helpers';

/**
 * Name of the resource template.
 */
const NAME = 'patternfly-schemas-template';

/**
 * URI template for the resource.
 */
const URI_TEMPLATE = 'patternfly://schemas/{name}{?version,category}';

/**
 * URI description for the resource.
 */
const URI_DESCRIPTION = `Filter by PatternFly version and category. ${URI_TEMPLATE}`;

/**
 * Resource configuration.
 */
const CONFIG = {
  title: 'PatternFly Component Schema',
  description: `Retrieve the JSON Schema for a specific PatternFly component by name. ${URI_DESCRIPTION}`,
  mimeType: 'application/json'
};

/**
 * Name completion callback for the URI template.
 *
 * @param name - The value to complete.
 * @param context - The completion context.
 * @returns The list of available names.
 */
const uriNameComplete: McpResourceMetadataCompleteMemo = async (name: string, context) => {
  const { version, category } = context?.arguments || {};
  const section = 'components';
  const { names } = await paramCompletion({ category, name, section, version });

  return names;
};

/**
 * Memoized version of uriNameComplete.
 */
uriNameComplete.memo = memo(uriNameComplete);

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
const resourceCallback = async (passedUri: URL, variables: Record<string, string | string[]>, options = getOptions()) => {
  const { version, name } = variables || {};

  assertInputStringLength(name, {
    ...options.minMax.inputStrings,
    inputDisplayName: 'name'
  });

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
  const updatedName = name.trim();

  const { byResource } = await filterPatternFly.memo({
    version: updatedVersion,
    name: updatedName
  });

  const matchedResources = Array.from(byResource.values()).filter(res => res.isSchemasAvailable);
  const schemaResults = [];

  for (const resource of matchedResources) {
    const content = await getPatternFlyComponentSchema.memo(resource.name);

    if (content) {
      schemaResults.push({
        uriSchemasId: resource.uriSchemasId as string,
        content
      });
    }
  }

  assertInput(
    schemaResults.length > 0,
    () => {
      let suggestionMessage = '';

      if (!availableSchemasVersions.includes(updatedVersion)) {
        suggestionMessage = ` Component schemas are only available for PatternFly versions ${availableSchemasVersions.join(', ')}`;
      }

      return `No component JSON schemas found for "${passedUri?.toString()}".${suggestionMessage}`;
    }
  );

  return {
    contents: schemaResults.map(schema => ({
      uri: schema.uriSchemasId,
      mimeType: 'application/json',
      text: JSON.stringify(schema.content, null, 2)
    }))
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
const patternFlySchemasTemplateResource = (options = getOptions()): McpResource => {
  const list = undefined;

  const complete: { [callback: string]: McpResourceMetadataComplete } = {
    category: async (...args) => runWithOptions(options, async () => uriCategoryComplete.memo(...args)),
    name: async (...args) => runWithOptions(options, async () => uriNameComplete.memo(...args)),
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
      complete
    }
  ];
};

export {
  patternFlySchemasTemplateResource,
  resourceCallback,
  uriNameComplete,
  NAME,
  URI_TEMPLATE,
  URI_DESCRIPTION,
  CONFIG
};

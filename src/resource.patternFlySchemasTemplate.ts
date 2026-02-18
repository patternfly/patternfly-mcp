import {
  type CompleteResourceTemplateCallback,
  ResourceTemplate
} from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { type McpResource } from './server';
import { getOptions, runWithOptions } from './options.context';
import { searchPatternFly } from './patternFly.search';
import {
  getPatternFlyComponentSchema,
  getPatternFlyMcpResources,
  type PatternFlyComponentSchema
} from './patternFly.getResources';
import { normalizeEnumeratedPatternFlyVersion } from './patternFly.helpers';
import { listResources, uriVersionComplete } from './resource.patternFlySchemasIndex';

/**
 * Name of the resource template.
 */
const NAME = 'patternfly-schemas-template';

/**
 * URI template for the resource.
 */
const URI_TEMPLATE = 'patternfly://schemas/{version}/{name}';

/**
 * Resource configuration.
 */
const CONFIG = {
  title: 'PatternFly Component Schema',
  description: 'Retrieve the JSON Schema for a specific PatternFly component by name',
  mimeType: 'application/json'
};

/**
 * Name completion callback for the URI template.
 *
 * @param value - The value to complete.
 * @param context - The completion context.
 * @returns The list of available names.
 */
const uriNameComplete: CompleteResourceTemplateCallback = async (value: unknown, context) => {
  const { latestSchemasVersion, byVersion, resources } = await getPatternFlyMcpResources.memo();
  const version = context?.arguments?.version;
  const updatedVersion = (await normalizeEnumeratedPatternFlyVersion.memo(version)) || latestSchemasVersion;
  const updatedValue = typeof value === 'string' ? value.toLowerCase().trim() : '';
  const names = new Set<string>();

  byVersion[updatedVersion]?.filter(entry => {
    const entryName = entry.name.toLowerCase();

    return resources.get(entryName)?.versions?.[updatedVersion]?.isSchemasAvailable && entryName.startsWith(updatedValue);
  }).forEach(entry => names.add(entry.name));

  return Array.from(names).sort();
};

/**
 * Resource callback for the documentation template.
 *
 * @note We temporarily use `DEFAULT_OPTIONS` `latestSchemasVersion`
 *
 * @param uri - The URI of the resource.
 * @param variables - The variables of the resource.
 * @param options - Global options
 * @returns The resource contents.
 */
const resourceCallback = async (uri: URL, variables: Record<string, string>, options = getOptions()) => {
  const { version, name } = variables || {};

  if (!name || typeof name !== 'string') {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Missing required parameter: name must be a string: ${name}`
    );
  }

  if (name.length > options.maxSearchLength) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Resource name exceeds maximum length of ${options.maxSearchLength} characters.`
    );
  }

  let updatedVersion = await normalizeEnumeratedPatternFlyVersion.memo(version);

  if (!updatedVersion) {
    const { latestSchemasVersion } = await getPatternFlyMcpResources.memo();

    updatedVersion = latestSchemasVersion;
  }

  const { exactMatches, searchResults } = await searchPatternFly.memo(name);
  let result: PatternFlyComponentSchema | undefined;

  if (exactMatches.length > 0) {
    for (const match of exactMatches) {
      const schema = await getPatternFlyComponentSchema.memo(match.item);

      if (schema) {
        result = schema;
        break;
      }
    }
  }

  if (result === undefined) {
    const suggestions = searchResults
      .filter(searchResult => searchResult?.versions?.[updatedVersion]?.isSchemasAvailable)
      .map(searchResult => searchResult.item).slice(0, 3);

    const suggestionMessage = suggestions.length
      ? `Did you mean ${suggestions.map(suggestion => `"${suggestion}"`).join(', ')}?`
      : 'No similar components found.';
    const foundNotFound = exactMatches.length ? 'found but JSON schema not available.' : 'not found.';

    throw new McpError(
      ErrorCode.InvalidParams,
      `Component "${name.trim()}" ${foundNotFound} ${suggestionMessage}`
    );
  }

  return {
    contents: [
      {
        uri: uri.href,
        mimeType: 'application/json',
        text: JSON.stringify(result, null, 2)
      }
    ]
  };
};

/**
 * Resource creator for the component schemas template.
 *
 * @param options - Global options
 * @returns {McpResource} The resource definition tuple
 */
const patternFlySchemasTemplateResource = (options = getOptions()): McpResource => [
  NAME,
  new ResourceTemplate(URI_TEMPLATE, {
    list: async () => runWithOptions(options, async () => listResources.memo()),
    complete: {
      name: async (...args) => runWithOptions(options, async () => uriNameComplete(...args)),
      version: async (...args) => runWithOptions(options, async () => uriVersionComplete(...args))
    }
  }),
  CONFIG,
  async (uri, variables) => runWithOptions(options, async () => resourceCallback(uri, variables, options))
];

export {
  patternFlySchemasTemplateResource,
  resourceCallback,
  uriNameComplete,
  NAME,
  URI_TEMPLATE,
  CONFIG
};

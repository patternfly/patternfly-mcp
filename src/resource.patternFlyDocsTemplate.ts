import {
  ResourceTemplate,
  type CompleteResourceTemplateCallback
} from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { type McpResource } from './server';
import { processDocsFunction } from './server.getResources';
import { stringJoin } from './server.helpers';
import { getOptions, runWithOptions } from './options.context';
import { searchPatternFly } from './patternFly.search';
import { getPatternFlyMcpResources } from './patternFly.getResources';
import { normalizeEnumeratedPatternFlyVersion } from './patternFly.helpers';
import { listResources, uriVersionComplete } from './resource.patternFlyDocsIndex';

/**
 * Name of the resource template.
 */
const NAME = 'patternfly-docs-template';

/**
 * URI template for the resource.
 */
const URI_TEMPLATE = 'patternfly://docs/{version}/{name}{?section,category}';

/**
 * Resource configuration.
 */
const CONFIG = {
  title: 'PatternFly Documentation Page',
  description: 'Retrieve specific PatternFly documentation by name or path',
  mimeType: 'text/markdown'
};

/**
 * Name completion callback for the URI template.
 *
 * @note If version is not available, the latest version is used to refine the search results
 * since it aligns with the default behavior of the PatternFly documentation.
 *
 * @param value - The value to complete.
 * @param context - The completion context.
 * @returns The list of available names.
 */
const uriNameComplete: CompleteResourceTemplateCallback = async (value: unknown, context) => {
  const { latestVersion, byVersion } = await getPatternFlyMcpResources.memo();
  const version = context?.arguments?.version;
  const updatedVersion = (await normalizeEnumeratedPatternFlyVersion.memo(version)) || latestVersion;
  const updatedValue = typeof value === 'string' ? value.toLowerCase().trim() : '';
  const names = new Set<string>();

  byVersion[updatedVersion]?.filter(entry => entry.name.toLowerCase().startsWith(updatedValue))
    .forEach(entry => names.add(entry.name));

  return Array.from(names).sort();
};

/**
 * Resource callback for the documentation template.
 *
 * @param uri - URI of the resource.
 * @param variables - Variables for the resource.
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
    const { latestVersion } = await getPatternFlyMcpResources.memo();

    updatedVersion = latestVersion;
  }

  const docResults = [];
  const docs = [];
  const { searchResults, exactMatches } = await searchPatternFly.memo(name);

  if (exactMatches.length === 0 || exactMatches.every(match => !match.versions[updatedVersion]?.urls.length)) {
    const { resources } = await getPatternFlyMcpResources.memo();
    const isSchemasAvailable = resources.get(name.toLowerCase())?.versions?.[updatedVersion]?.isSchemasAvailable;
    let suggestionMessage;

    if (isSchemasAvailable) {
      suggestionMessage =
        `A JSON Schema is available. Use "patternfly://schemas/${updatedVersion}/${name.toLowerCase()}" to view prop definitions."`;
    } else {
      const suggestions = searchResults.map(result => result.item).slice(0, 3);

      suggestionMessage = suggestions.length
        ? `Did you mean ${suggestions.map(suggestion => `"${suggestion}"`).join(', ')}?`
        : 'No similar resources found.';
    }

    throw new McpError(
      ErrorCode.InvalidParams,
      `No documentation found for "${name.trim()}". ${suggestionMessage}`
    );
  }

  try {
    const exactMatchesUrls = exactMatches.flatMap(match => match.versions[updatedVersion]?.urls).filter(Boolean) as string[];

    if (exactMatchesUrls.length > 0) {
      const processedDocs = await processDocsFunction.memo(exactMatchesUrls);

      docs.push(...processedDocs);
    }
  } catch (error) {
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to fetch documentation: ${error}`
    );
  }

  // Redundancy check, technically this should never happen, future proofing
  if (docs.length === 0) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `"${name.trim()}" was found, but no documentation URLs are available for it.`
    );
  }

  for (const doc of docs) {
    docResults.push(stringJoin.newline(
      `# Documentation from ${doc.resolvedPath || doc.path}`,
      '',
      doc.content
    ));
  }

  return {
    contents: [
      {
        uri: uri.href,
        mimeType: 'text/markdown',
        text: docResults.join(options.separator)
      }
    ]
  };
};

/**
 * Resource creator for the documentation template.
 *
 * @param options - Global options
 * @returns {McpResource} The resource definition tuple
 */
const patternFlyDocsTemplateResource = (options = getOptions()): McpResource => [
  NAME,
  new ResourceTemplate(URI_TEMPLATE, {
    list: async () => runWithOptions(options, async () => listResources.memo()),
    complete: {
      version: async (...args) => runWithOptions(options, async () => uriVersionComplete(...args)),
      name: async (...args) => runWithOptions(options, async () => uriNameComplete(...args))
    }
  }),
  CONFIG,
  async (uri, variables) => runWithOptions(options, async () => resourceCallback(uri, variables, options))
];

export {
  patternFlyDocsTemplateResource,
  resourceCallback,
  uriNameComplete,
  NAME,
  URI_TEMPLATE,
  CONFIG
};

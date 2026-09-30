import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { type McpResource, type McpResourceMetadataComplete } from './mcpSdk';
import { processDocsFunction } from './server.getResources';
import { stringJoin } from './server.helpers';
import { assertInput, assertInputStringLength, assertInputStringNumberEnumLike } from './server.assertions';
import { getOptions, runWithOptions } from './options.context';
import { getPatternFlyMcpResources } from './patternFly.getResources';
import { filterPatternFly } from './patternFly.search';
import {
  uriCollectionComplete,
  uriCategoryComplete,
  uriNameComplete,
  uriSectionComplete,
  uriVersionComplete
} from './resource.patternFlyDocsIndex';
import {
  formatContentForMarkdown,
  normalizeEnumeratedCollectionVersion
} from './resource.helpers';

/**
 * Name of the resource template.
 */
const NAME = 'patternfly-docs-template';

/**
 * URI template for the resource.
 */
const URI_TEMPLATE = 'patternfly://docs/{name}{?version,category,section,collection}';

/**
 * URI description for the resource.
 */
const URI_DESCRIPTION = `Filter by PatternFly version, category, section, and collection. ${URI_TEMPLATE}`;

/**
 * Resource configuration.
 */
const CONFIG = {
  title: 'PatternFly Documentation Page',
  description: `Retrieve specific PatternFly documentation by name or path. ${URI_DESCRIPTION}`,
  mimeType: 'text/markdown'
};

/**
 * Resource callback for the documentation template.
 *
 * @param passedUri - URI of the resource.
 * @param variables - Variables for the resource.
 * @param options - Global options
 * @returns The resource contents.
 */
const resourceCallback = async (passedUri: URL, variables: Record<string, string | string[]>, options = getOptions()) => {
  const { category, collection, name, section, version } = variables || {};

  assertInputStringLength(name, {
    ...options.minMax.inputStrings,
    inputDisplayName: 'name'
  });

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

  if (section) {
    assertInputStringLength(section, {
      ...options.minMax.inputStrings,
      inputDisplayName: 'section'
    });
  }

  if (category) {
    assertInputStringLength(category, {
      ...options.minMax.inputStrings,
      inputDisplayName: 'category'
    });
  }

  const normalizedVersion = await normalizeEnumeratedCollectionVersion.memo(version, collection);
  const updatedVersion = normalizedVersion || (version && String(version).trim()) || undefined;
  const updatedName = name.trim();

  const { byEntry } = await filterPatternFly.memo({
    collection,
    version: updatedVersion,
    name: updatedName,
    category,
    section
  });

  assertInput(
    byEntry.length > 0,
    () => {
      let suggestionMessage = '';

      if (version || category || section || collection) {
        const variableList = [
          (version && 'version') || undefined,
          (collection && 'collection') || undefined,
          (category && 'category') || undefined,
          (section && 'section') || undefined
        ].filter(Boolean).join(', ');

        suggestionMessage = ` Try using different parameters for ${variableList}.`;
      }

      return `No documentation found for "${updatedName}".${suggestionMessage}`;
    }
  );

  const docs = [];

  try {
    const docPaths = byEntry
      .filter(({ path }) => path)
      .map(({ path, uriId, id, groupId, displayName, displayCategory, version: entryVersion }) =>
        ({ doc: path, uri: uriId, id, groupId, displayName, displayCategory, entryVersion }));

    if (docPaths.length > 0) {
      // `processDocsFunction` has de-dup docs baked in
      const processedDocs = await processDocsFunction.memo(docPaths, { loadLimit: options.minMax.docsToLoad.max });

      // Failures are `log.debugged` in `processDocsFunction`.
      for (const response of processedDocs) {
        if (response.isSuccess) {
          docs.push({
            ...response
          });
        }
      }
    }
  } catch (error) {
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to fetch documentation: ${error}`
    );
  }

  const hasSchemas = byEntry.some(entry => entry.uriSchemasId);

  assertInput(
    docs.length > 0 || hasSchemas,
    () => {
      let suggestionMessage = '';

      if (version || category || section || collection) {
        const variableList = [
          (version && 'version') || undefined,
          (collection && 'collection') || undefined,
          (category && 'category') || undefined,
          (section && 'section') || undefined
        ].filter(Boolean).join(', ');

        suggestionMessage = ` Try using different parameters for ${variableList}.`;
      }

      return `"${updatedName}" was found, but no documentation resources are available for it.${suggestionMessage}`;
    }
  );

  if (docs.length === 0 && hasSchemas) {
    return {
      contents: byEntry.filter(entry => entry.uriSchemasId).map(entry => ({
        uri: entry.uriId,
        mimeType: 'text/markdown',
        text: `# ${entry.displayName}\n\nNo documentation is available for this component. But a [JSON schema is available](${entry.uriSchemasId}).`
      }))
    };
  }

  return {
    contents: docs.map(({ uri, content, id, groupId, displayName, displayCategory, entryVersion }) => ({
      uri,
      mimeType: 'text/markdown',
      text: stringJoin.newline(
        `<!-- mcp:provenance id="${id}" groupId="${groupId}" -->`,
        `# Documentation for ${displayName} - ${displayCategory} (${entryVersion})`,
        '',
        formatContentForMarkdown(content)
      )
    }))
  };
};

/**
 * Resource creator for the documentation template.
 *
 * @param options - Global options
 * @returns {McpResource} The resource definition tuple
 */
const patternFlyDocsTemplateResource = (options = getOptions()): McpResource => {
  const list = undefined;

  const complete: { [callback: string]: McpResourceMetadataComplete } = {
    category: async (...args) => runWithOptions(options, async () => uriCategoryComplete.memo(...args)),
    collection: async (...args) => runWithOptions(options, async () => uriCollectionComplete.memo(...args)),
    name: async (...args) => runWithOptions(options, async () => uriNameComplete.memo(...args)),
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
  patternFlyDocsTemplateResource,
  resourceCallback,
  NAME,
  URI_TEMPLATE,
  URI_DESCRIPTION,
  CONFIG
};

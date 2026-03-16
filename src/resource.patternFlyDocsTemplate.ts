import {
  ResourceTemplate,
  type CompleteResourceTemplateCallback
} from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { type McpResource } from './server';
import { processDocsFunction } from './server.getResources';
import { stringJoin } from './server.helpers';
import { assertInput, assertInputStringLength } from './server.assertions';
import { getOptions, runWithOptions } from './options.context';
import { getPatternFlyMcpResources } from './patternFly.getResources';
import { normalizeEnumeratedPatternFlyVersion } from './patternFly.helpers';
import { filterPatternFly } from './patternFly.search';
import {
  uriCategoryComplete,
  uriNameComplete,
  uriSectionComplete,
  uriVersionComplete
} from './resource.patternFlyDocsIndex';

/**
 * Name of the resource template.
 */
const NAME = 'patternfly-docs-template';

/**
 * URI template for the resource.
 */
const URI_TEMPLATE = 'patternfly://docs/{name}{?version,category,section}';

/**
 * URI description for the resource.
 */
const URI_DESCRIPTION = `Filter by PatternFly version, category, and section. ${URI_TEMPLATE}`;

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
  const { category, name, section, version } = variables || {};

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

  const { availableVersions, latestVersion } = await getPatternFlyMcpResources.memo();
  const normalizedVersion = await normalizeEnumeratedPatternFlyVersion.memo(version);

  assertInput(
    !version || Boolean(normalizedVersion),
    `Invalid PatternFly version "${version?.trim()}". Available versions are: ${availableVersions.join(', ')}`
  );

  const updatedVersion = normalizedVersion || latestVersion;
  const updatedName = name.trim();

  const { byEntry } = await filterPatternFly.memo({
    version: updatedVersion,
    name: updatedName,
    category,
    section
  });

  assertInput(
    byEntry.length > 0,
    () => {
      let suggestionMessage = '';

      if (version || category || section) {
        const variableList = [
          (version && 'version') || undefined,
          (category && 'category') || undefined,
          (section && 'section') || undefined
        ].filter(Boolean).join(', ');

        suggestionMessage = ` Try using different parameters for ${variableList}.`;
      }

      return `No documentation found for "${updatedName}".${suggestionMessage}`;
    }
  );

  const docResults = [];
  const docs = [];

  try {
    const matchedUrls = byEntry.map(entry => entry.path).filter(Boolean);

    if (matchedUrls.length > 0) {
      const processedDocs = await processDocsFunction.memo(matchedUrls);

      docs.push(...processedDocs);
    }
  } catch (error) {
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to fetch documentation: ${error}`
    );
  }

  assertInput(
    docs.length > 0,
    () => {
      let suggestionMessage = '';

      if (version || category || section) {
        const variableList = [
          (version && 'version') || undefined,
          (category && 'category') || undefined,
          (section && 'section') || undefined
        ].filter(Boolean).join(', ');

        suggestionMessage = ` Try using different parameters for ${variableList}.`;
      }

      return `"${updatedName}" was found, but no documentation URLs are available for it.${suggestionMessage}`;
    }
  );

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
        uri: passedUri?.toString(),
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
const patternFlyDocsTemplateResource = (options = getOptions()): McpResource => {
  const list = undefined;

  const complete: { [callback: string]: CompleteResourceTemplateCallback } = {
    category: async (...args) => runWithOptions(options, async () => uriCategoryComplete.memo(...args)),
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

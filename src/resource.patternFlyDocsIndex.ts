import { type McpResource } from './server';
import { stringJoin } from './server.helpers';
import { assertInput, assertInputStringLength } from './server.assertions';
import { buildSearchString } from './server.helpers';
import { getPatternFlyMcpResources } from './patternFly.getResources';
import { getOptions, runWithOptions } from './options.context';
import { normalizeEnumeratedPatternFlyVersion } from './patternFly.helpers';
import { filterPatternFly } from './patternFly.search';

/**
 * Name of the resource.
 */
const NAME = 'patternfly-docs-index';

/**
 * URI template for the resource.
 */
const URI_TEMPLATE = 'patternfly://docs/index';

/**
 * Resource configuration.
 */
const CONFIG = {
  title: 'PatternFly Documentation Index',
  description: 'A comprehensive list of PatternFly documentation links, organized by components, layouts, charts, and guidance files.',
  mimeType: 'text/markdown'
};

/**
 * Resource callback for the documentation index.
 *
 * @param passedUri - URI of the resource.
 * @param variables - Variables for the resource.
 * @param options - Global options
 * @returns The resource contents.
 */
const resourceCallback = async (passedUri: URL, variables: Record<string, string>, options = getOptions()) => {
  const { category, version, section } = variables || {};

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

  if (section) {
    assertInputStringLength(section, {
      ...options.minMax.inputStrings,
      inputDisplayName: 'section'
    });
  }

  const { availableVersions, latestVersion } = await getPatternFlyMcpResources.memo();
  const normalizedVersion = await normalizeEnumeratedPatternFlyVersion.memo(version);

  assertInput(
    !version || Boolean(normalizedVersion),
    `Invalid PatternFly version "${version?.trim()}". Available versions are: ${availableVersions.join(', ')}`
  );

  const updatedVersion = normalizedVersion || latestVersion;

  const { byEntry } = await filterPatternFly.memo({
    version: updatedVersion,
    category,
    section
  });

  // Group by URI
  const groupedByUri = new Map<string, { name: string, version: string, categories: Set<string> }>();

  byEntry.forEach(entry => {
    if (!groupedByUri.has(entry.uri)) {
      groupedByUri.set(entry.uri, {
        name: entry.name,
        version: entry.version,
        categories: new Set([entry.displayCategory])
      });
    } else {
      groupedByUri.get(entry.uri)?.categories.add(entry.displayCategory);
    }
  });

  // Generate the consolidated list, apply search/query string
  const docsIndex = Array.from(groupedByUri.entries())
    .sort(([_aUri, aData], [_bUri, bData]) => aData.name.localeCompare(bData.name))
    .map(([uri, data], index) => {
      const categoryList = Array.from(data.categories).join(', ');
      const searchString = buildSearchString({ section, category }, { prefix: true });

      return `${index + 1}. [${data.name} - ${categoryList} (${data.version})](${uri}${searchString || ''})`;
    });

  assertInput(
    docsIndex.length > 0,
    () => {
      let suggestionMessage = '';

      if (category || section) {
        const variableList = [
          (category && 'category') || undefined,
          (section && 'section') || undefined
        ].filter(Boolean).join(' or ');

        suggestionMessage = ` Try using a different ${variableList} search.`;
      }

      return `No documentation found for "${passedUri?.toString()}".${suggestionMessage}`;
    }
  );

  const allDocs = stringJoin.newline(
    `# PatternFly Documentation Index for "${updatedVersion}"`,
    '',
    '',
    ...(docsIndex || [])
  );

  return {
    contents: [
      {
        uri: passedUri?.toString() || 'patternfly://docs/index',
        mimeType: 'text/markdown',
        text: allDocs
      }
    ]
  };
};

/**
 * Resource creator for the documentation index.
 *
 * @param options - Global options
 * @returns {McpResource} The resource definition tuple
 */
const patternFlyDocsIndexResource = (options = getOptions()): McpResource => [
  NAME,
  URI_TEMPLATE,
  CONFIG,
  async (uri, variables) => runWithOptions(options, async () => resourceCallback(uri, variables, options))
];

export {
  patternFlyDocsIndexResource,
  resourceCallback,
  NAME,
  URI_TEMPLATE,
  CONFIG
};

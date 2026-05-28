import {
  componentNames as pfComponentNames,
  getComponentSchema
} from '@patternfly/patternfly-component-schemas/json';
import { memo } from './server.caching';
import { buildSearchString, generateHash } from './server.helpers';
import { DEFAULT_OPTIONS } from './options.defaults';
import {
  getPatternFlyVersionContext,
  type PatternFlyVersionContext
} from './patternFly.helpers';
import { log, formatUnknownError } from './logger';
import {
  EMBEDDED_DOCS,
  type PatternFlyMcpDocsCatalog,
  type PatternFlyMcpDocsCatalogEntry,
  type PatternFlyMcpDocsCatalogDoc
} from './docs.embedded';
import {
  INDEX_BLOCKLIST_WORDS,
  INDEX_EXCEPTION_WORDS,
  INDEX_NOISE_WORDS
} from './docs.filterWords';

/**
 * Derive the component schema type from @patternfly/patternfly-component-schemas
 */
type PatternFlyComponentSchema = Awaited<ReturnType<typeof getPatternFlyComponentSchema>>;

/**
 * Map of PatternFly component names to their versioned metadata.
 *
 * Properties for each component include:
 * - `isSchemasAvailable`: Boolean indicating whether schemas are available for the component.
 * - `displayName`: String that defines the human-readable name of the component.
 */
type PatternFlyMcpComponentNamesByVersion = {
  [name: string]: {
    isSchemasAvailable: boolean;
    displayName: string;
  }
};

/**
 * Documentation structure for PatternFly MCP component names. Intended to help
 * merge with existing documents catalog.
 *
 * Unique Properties:
 * - `path`: Non-existent, omitted from the base catalog documentation type.
 * - `isSchemasAvailable`: A boolean flag that indicates whether schemas are available for the component.
 */
type PatternFlyMcpComponentNamesDoc = Omit<PatternFlyMcpDocsCatalogDoc, 'path'> & { path?: never; isSchemasAvailable: boolean };

/**
 * Component names metadata.
 *
 * @interface PatternFlyMcpComponentNames
 *
 * @property componentNamesIndex - Component names index.
 * @property componentNamesIndexMap - Component names index map.
 * @property byVersion - Component names by version map.
 * @property byDocs - Component names by docs map.
 */
interface PatternFlyMcpComponentNames {
  componentNamesIndex: string[];
  componentNamesIndexMap: Map<string, string>;
  byVersion: Map<string, PatternFlyMcpComponentNamesByVersion>;
  byDocs: Map<string, PatternFlyMcpComponentNamesDoc[]>;
}

/**
 * PatternFly JSON extended documentation metadata
 *
 * @property id - The unique identifier of document entry.
 * @property groupId - The unique identifier for the document's parent.
 * @property name - The name of document entry.
 * @property displayCategory - The display category of document entry.
 * @property uri - The parent resource's general URI that can reflect a grouping of document entries.
 * @property uriId - The resource's exact URI for the document entry.
 * @property uriSchemas - The parent resource's general URI for the related component schemas, if they exist.
 * @property uriSchemasId - The resource's schemas URI for the component schemas, if they exist. Keyed by
 *     the parent resource's `groupId` since the URIs are the same for sibling entries.
 */
type PatternFlyMcpDocsMeta = {
  id: string;
  groupId: string;
  name: string;
  displayCategory: string;
  uri: string;
  uriId: string;
  uriSchemas?: string | undefined;
  uriSchemasId?: string | undefined;
};

/**
 * PatternFly resource, the original JSON.
 *
 * @interface PatternFlyMcpDocs
 */
type PatternFlyMcpResources = PatternFlyMcpDocsCatalogEntry;

/**
 * PatternFly resources by Path with an entry.
 */
type PatternFlyMcpResourcesByPath = {
  [path: string]: PatternFlyMcpDocsCatalogDoc & PatternFlyMcpDocsMeta;
};
// type PatternFlyMcpResourcesByPath = Map<string, PatternFlyMcpDocEntry & PatternFlyMcpDocsMeta>;

/**
 * PatternFly resources by URI with a list of entries.
 *
 * @deprecated  Under review. Use `uriIndex`.
 */
type PatternFlyMcpResourcesByUri = {
  [uri: string]: (PatternFlyMcpDocsCatalogDoc & PatternFlyMcpDocsMeta)[];
};

/**
 * PatternFly resources by version with a list of entries.
 */
type PatternFlyMcpResourcesByVersion = {
  [version: string]: (PatternFlyMcpDocsCatalogDoc & PatternFlyMcpDocsMeta)[];
};

/**
 * PatternFly resource keywords by resource name then by version.
 */
type PatternFlyMcpKeywordsMap = Map<string, Map<string, string[]>>;

/**
 * PatternFly resource metadata.
 *
 * Contextual properties
 * - Contextual properties are populated based on search and filtering.
 * - Do not expect them to exist, make sure to conditionally load them.
 *
 * @property name - The name of component entry.
 * @property entries - All entry PatternFly documentation entries.
 * @property versions - Entry segmented by versions. Contains all the same properties.
 * @property groupId - The unique identifier for the document group.
 * @property isSchemasAvailable - see {@link PatternFlyMcpDocsMeta.isSchemasAvailable} **CONTEXTUAL**.
 * @property uri - see {@link PatternFlyMcpDocsMeta.uri} **CONTEXTUAL**.
 * @property uriSchemas - see {@link PatternFlyMcpDocsMeta.uriSchemas} **CONTEXTUAL**.
 * @property uriSchemasId - see {@link PatternFlyMcpDocsMeta.uriSchemasId} **CONTEXTUAL**.
 */
type PatternFlyMcpResourceMetadata = {
  name: string;
  entries: (PatternFlyMcpDocsCatalogDoc & PatternFlyMcpDocsMeta)[];
  versions: Record<string, Omit<PatternFlyMcpResourceMetadata, 'name' | 'versions'>>;
  groupId: string;

  isSchemasAvailable: boolean | undefined;
  uri: string | undefined;
  uriSchemas: string | undefined;
  uriSchemasId: string | undefined;
};

/**
 * Patternfly available documentation.
 *
 * @note To avoid lookup issues we normalize most keys and indexes to lowercase, except docs.json `paths`.
 * GitHub has case-sensitive links.
 *
 * @interface PatternFlyMcpAvailableDocs
 * @extends PatternFlyVersionContext
 *
 * @property resources - Patternfly available documentation and metadata by resource name.
 * @property docsIndex - `@deprecated Under review. Use Array.from(resources.keys()) instead`. Patternfly available documentation index.
 * @property componentsIndex - `@deprecated Under review. Use keywordsIndex for search or byVersionComponentNames for lookups`.
 *     Patternfly available components index.
 * @property keywordsIndex - Patternfly available keywords index.
 * @property keywordsMap - Patternfly available keywords by resource name then by version.
 * @property isFallbackDocumentation - Whether the fallback documentation is used.
 * @property pathIndex - Patternfly documentation path->name map for helping refine search results.
 * @property uriIndex - Patternfly documentation uri->name map for helping refine search results.
 * @property hashIndex - Patternfly documentation hash->name map for helping refine search results.
 * @property byPath - Patternfly documentation by path with entries
 * @property byUri - `@deprecated Under review. Use uriIndex`. Patternfly documentation by uri with entries
 * @property byVersion - Patternfly documentation by version with entries
 * @property byVersionComponentNames - Patternfly documentation by version with component names
 */
interface PatternFlyMcpAvailableResources extends PatternFlyVersionContext {
  resources: Map<string, PatternFlyMcpResourceMetadata>;
  docsIndex: string[];
  componentsIndex: string[];
  keywordsIndex: string[];
  keywordsMap: PatternFlyMcpKeywordsMap;
  isFallbackDocumentation: boolean;
  pathIndex: Map<string, string>;
  uriIndex: Map<string, string>;
  hashIndex: Map<string, string>;
  byPath: PatternFlyMcpResourcesByPath;
  byUri: PatternFlyMcpResourcesByUri;
  byVersion: PatternFlyMcpResourcesByVersion;
  byVersionComponentNames: PatternFlyMcpComponentNames['byVersion'];
}

/**
 * Lazy load the PatternFly documentation catalog.
 *
 * @returns PatternFly documentation catalog JSON, or fallback catalog if import fails.
 */
const getPatternFlyDocsCatalog = async (): Promise<PatternFlyMcpDocsCatalog & { isFallback: boolean }> => {
  let docsCatalog = EMBEDDED_DOCS;
  let isFallback = false;

  try {
    if (process.env.NODE_ENV === 'local') {
      docsCatalog = (await import('./docs.json', { with: { type: 'json' } })).default;
    } else {
      docsCatalog = (await import('#docsCatalog', { with: { type: 'json' } })).default;
    }
  } catch (error) {
    isFallback = true;
    log.debug(`Failed to import docs catalog '#docsCatalog': ${formatUnknownError(error)}`, 'Using fallback docs catalog.');
  }

  return { ...docsCatalog, isFallback };
};

/**
 * Memoized version of getPatternFlyDocsCatalog.
 */
getPatternFlyDocsCatalog.memo = memo(getPatternFlyDocsCatalog);

/**
 * Set the category display label based on the entry's section and category.
 *
 * @note Review integrating locale strings with some level of display logic.
 *
 * @param entry - PatternFly documentation entry
 * @returns The category display label
 */
const setCategoryDisplayLabel = (entry?: PatternFlyMcpDocsCatalogDoc) => {
  let categoryLabel = typeof entry?.category === 'string' ? entry.category.trim().toLowerCase() : undefined;

  if (categoryLabel === undefined) {
    return 'Documentation';
  }

  switch (categoryLabel) {
    case 'grammar':
      categoryLabel = 'Grammar';
      break;
    case 'writing-guides':
      categoryLabel = 'Writing Guidelines';
      break;
    case 'design-guidelines':
      categoryLabel = 'Design Guidelines';
      break;
    case 'accessibility':
      categoryLabel = 'Accessibility';
      break;
    case 'react':
      categoryLabel = 'Examples';
      break;
    default:
      categoryLabel = categoryLabel.charAt(0).toUpperCase() + categoryLabel.slice(1);
      break;
  }

  return entry?.section?.trim()?.toLowerCase() === 'guidelines' ? 'AI Guidance' : categoryLabel;
};

/**
 * A multifaceted list of all PatternFly React component names.
 *
 * @note Consider iterating over the components by version using the "availableVersions" array
 * from getPatternFlyVersionContext.
 *
 * @note The "table" component is manually added to the `componentNamesIndex` list because it's not currently included
 * in the component schemas v6 package.
 *
 * @note To avoid lookup issues we normalize all keys and indexes to lowercase. Component names are lowercased.
 *
 * @param contextPathOverride - Context path for updating the returned PatternFly versions.
 * @returns A multifaceted React component breakdown.  Use the "memoized" property for performance.
 * - `componentNamesIndex`: ALL component names across ALL versions,
 * - `componentNamesIndexMap`: Map of lowercase ALL component names to original case component names,
 * - `byVersion`: Map of lowercase PatternFly versions to Map of lowercase component names to { isSchemasAvailable: boolean, displayName: string }
 */
const getPatternFlyComponentNames = async (contextPathOverride?: string): Promise<PatternFlyMcpComponentNames> => {
  const { latestSchemasVersion } = await getPatternFlyVersionContext.memo(contextPathOverride);

  const latestNamesIndex = [...Array.from(new Set([...pfComponentNames, 'Table'])).map(name => name.toLowerCase()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))];
  const latestNamesIndexMap = new Map(Array.from(new Set([...pfComponentNames, 'Table'])).map(name => [name.toLowerCase(), name]));
  const latestByNameMap = new Map<string, { isSchemasAvailable: boolean, displayName: string }>();
  const latestByDocsFormat = new Map<string, PatternFlyMcpComponentNamesDoc[]>();
  const createDocEntry = (name: string, isSchemasAvailable: boolean) => ({
    displayName: name,
    description: `PatternFly React component: ${name}`,
    pathSlug: `schemas-${name}`.toLowerCase(),
    category: 'react',
    section: 'components',
    source: 'schemas',
    version: latestSchemasVersion,
    isSchemasAvailable
  });

  pfComponentNames.forEach(name => {
    latestByNameMap.set(name.toLowerCase(), { isSchemasAvailable: true, displayName: name });
    latestByDocsFormat.set(name.toLowerCase(), [createDocEntry(name, true)]);
  });

  const byVersion: PatternFlyMcpComponentNames['byVersion'] = new Map();

  latestByNameMap.set('table', { isSchemasAvailable: false, displayName: 'Table' });
  latestByDocsFormat.set('table', [createDocEntry('Table', false)]);
  const convert = Object.fromEntries(latestByNameMap);

  byVersion.set(
    latestSchemasVersion,
    convert
  );

  return {
    componentNamesIndex: latestNamesIndex,
    componentNamesIndexMap: latestNamesIndexMap,
    byVersion,
    byDocs: latestByDocsFormat
  };
};

/**
 * Memoized version of getPatternFlyReactComponentNames.
 */
getPatternFlyComponentNames.memo = memo(getPatternFlyComponentNames);

/**
 * Transform two string arrays into sets with all words lowercased and trimmed.
 *
 * @private
 * @param {string[]} listA - First array of strings to be processed.
 * @param {string[]} listB - Second array of strings to be processed.
 * @returns {Object} An object containing two sets:
 *   - `listA`: A set containing unique processed words from the first array.
 *   - `listB`: A set containing unique processed words from the second array.
 */
const setWordLists = (listA: string[], listB: string[]) => ({
  listA: new Set(listA.map(word => word.toLowerCase().trim())),
  listB: new Set(listB.map(word => word.toLowerCase().trim()))
});

/**
 * Memoized version of setWordLists.
 */
setWordLists.memo = memo(setWordLists, { cacheLimit: 3 });

/**
 * Filter keywords using the exception list and noise-word rules.
 *
 * - Words are kept that match the `exceptionList`.
 * - Words are removed that match the `filterList` or the `distanceMatch` checks.
 * - All other words are kept by default.
 *
 * @param keywordsMap - Available keywords by resource name.
 * @param settings - Settings object
 * @param settings.exceptionList - List of words to exempt from filtering.
 * @param settings.filterList - List of words to filter out from keywords.
 * @param settings.distanceMatch - Allowed length gap in characters between a keyword and a
 *     filter word.
 */
const filterKeywords = (
  keywordsMap: PatternFlyMcpKeywordsMap,
  { exceptionList = INDEX_EXCEPTION_WORDS, filterList = INDEX_NOISE_WORDS, distanceMatch = 3 } = {}
) => {
  const filteredKeywords: PatternFlyMcpKeywordsMap = new Map();

  // Pre-process into Sets
  const { listA: exceptionSet, listB: filterSet } = setWordLists.memo(exceptionList, filterList);

  // Keep the original list for prefix/suffix checks
  const normalizedFilterList = Array.from(filterSet);

  for (const [keyword, versionMap] of keywordsMap) {
    const updatedKeyword = keyword.toLowerCase().trim();

    // Exception match
    if (exceptionSet.has(updatedKeyword)) {
      filteredKeywords.set(keyword, versionMap);
      continue;
    }

    // Exact filter match
    if (filterSet.has(updatedKeyword)) {
      continue;
    }

    // Related match (prefix/suffix)
    const isVariant = normalizedFilterList.some(updatedWord => {
      if (Math.abs(updatedKeyword.length - updatedWord.length) <= distanceMatch) {
        return updatedKeyword.startsWith(updatedWord) || updatedKeyword.endsWith(updatedWord);
      }

      return false;
    });

    if (!isVariant) {
      filteredKeywords.set(keyword, versionMap);
    }
  }

  return filteredKeywords;
};

/**
 * Mutate the `keywordsMap` with the given normalized keyword.
 *
 * - The normalized keyword is always indexed.
 * - When the normalized keyword has multiple words, each word is also indexed unless:
 *   - They are on the `blockList`.
 *   - Their character length fails the `lengthFilter` and they are not on the `exceptionList`.
 *
 * @note Future updates for this function should consider returning a new Map
 * instead of mutating.
 *
 * @internal Exposed for testing only. Not recommended for general use.
 *
 * @param keywordsMap - Available keywords by resource name.
 * @param params - Params object
 * @param params.keyword - Keyword to add to the map.
 * @param params.name - Name of the resource associated with the keyword.
 * @param params.version - Version of the resource associated with the keyword.
 * @param settings - Settings object
 * @param settings.blockList - List of words to block from indexing.
 * @param settings.exceptionList - List of words to exempt from filtering. `blocklist` words
 *     are prioritized over `exceptionList` words.
 * @param settings.lengthFilter - Word length filter for reducing keyword noise.
 */
const mutateKeyWordsMap = (
  keywordsMap: PatternFlyMcpKeywordsMap,
  { keyword, name, version }: { keyword: string, name: string, version: string },
  { blockList = INDEX_BLOCKLIST_WORDS, exceptionList = INDEX_EXCEPTION_WORDS, lengthFilter = 3 } = {}
) => {
  const normalizedKeyword = keyword.toLowerCase().trim();
  const initialSplit = normalizedKeyword.split(' ').filter(Boolean);
  const isMultipleWords = initialSplit.length > 1;

  // Pre-process into Sets
  const { listA: blockSet, listB: exceptionSet } = setWordLists.memo(blockList, exceptionList);

  const mutateMap = (word: string) => {
    if (!keywordsMap.has(word)) {
      keywordsMap.set(word, new Map());
    }

    const versionMap = keywordsMap.get(word);

    if (!versionMap?.has(version)) {
      versionMap?.set(version, []);
    }

    const mapped = versionMap?.get(version);

    if (!mapped?.includes(name)) {
      mapped?.push(name);
    }
  };

  // Break phrase apart
  if (isMultipleWords) {
    const splitKeywords = initialSplit.map(word => word.trim().replace(/[()|"'<>@#!,.;:]/g, ''));

    for (const word of splitKeywords) {
      const lowerWord = word.toLowerCase();

      if (blockSet.has(lowerWord)) {
        continue;
      }

      if (word.length <= lengthFilter && !exceptionSet.has(lowerWord)) {
        continue;
      }

      mutateMap(word);
    }
  }

  // But also apply entire phrases
  mutateMap(normalizedKeyword);
};

/**
 * Get a multifaceted resources breakdown from PatternFly.
 *
 * @note `resources.set(name...` includes `undefined` PF version contextual metadata by design. These values
 * are populated during search and filter services when `entries` are matched against PF versions. Review
 * separating the typings for clarity.
 *
 * @param contextPathOverride - Context path for updating the returned PatternFly versions.
 * @returns A multifaceted documentation breakdown. Use the "memoized" property for performance.
 */
const getPatternFlyMcpResources = async (contextPathOverride?: string): Promise<PatternFlyMcpAvailableResources> => {
  const versionContext = await getPatternFlyVersionContext.memo(contextPathOverride);
  const componentNames = await getPatternFlyComponentNames.memo(contextPathOverride);
  const { componentNamesIndex, byVersion: componentNamesByVersion, byDocs: componentNamesByDocs } = componentNames;

  const originalDocs = await getPatternFlyDocsCatalog.memo();
  const resources = new Map<string, PatternFlyMcpResourceMetadata>();
  const byPath: PatternFlyMcpResourcesByPath = {};
  const byUri: PatternFlyMcpResourcesByUri = {};
  const byVersion: PatternFlyMcpResourcesByVersion = {};
  const pathIndexMap = new Map<string, string>();
  const uriIndexMap = new Map<string, string>();
  const hashIndexMap = new Map<string, string>();
  const rawKeywordsMap: PatternFlyMcpKeywordsMap = new Map();

  const catalog = [...Object.entries(originalDocs.docs), ...Array.from(componentNamesByDocs)];

  catalog.forEach(([unifiedName, entries]) => {
    const name = unifiedName.toLowerCase();
    const groupId = generateHash(name);

    hashIndexMap.set(groupId.toLowerCase(), name);

    if (!resources.has(name)) {
      // Include search and filter contextual `undefined` metadata for each resource.
      resources.set(name, {
        name,
        groupId,
        entries: [],
        versions: {},
        isSchemasAvailable: undefined,
        uri: undefined,
        uriSchemas: undefined,
        uriSchemasId: undefined
      });
    }

    const resource = resources.get(name) as PatternFlyMcpResourceMetadata;

    entries.forEach(entry => {
      // Technically, we could just dump `entry` into generateHash as the fallback, but it'd be prone to frequent shifting based on updates.
      const version = (entry.version || 'unknown').toLowerCase();
      const id = generateHash(entry.path || `${name}:${version}:${entry.section}:${entry.category}:${entry.pathSlug}`.toLowerCase());
      const isSchemasAvailable = versionContext.latestSchemasVersion === version && componentNamesByVersion.get(version)?.[name]?.isSchemasAvailable;
      const path = entry.path;
      const uri = `patternfly://docs/${encodeURIComponent(name)}${buildSearchString({ version }, { prefix: true })}`;
      const uriId = `patternfly://docs/${encodeURIComponent(id)}`;

      hashIndexMap.set(id.toLowerCase(), name);
      uriIndexMap.set(uri.toLowerCase(), name);
      uriIndexMap.set(uriId.toLowerCase(), name);

      if (path) {
        pathIndexMap.set(path.toLowerCase(), name);
      }

      resource.versions[version] ??= {
        groupId,
        isSchemasAvailable,
        uri,
        uriSchemas: undefined,
        uriSchemasId: undefined,
        entries: []
      };

      const displayName = entry.displayName || name;
      const displayCategory = setCategoryDisplayLabel(entry as PatternFlyMcpDocsCatalogDoc);
      let uriSchemas;
      let uriSchemasId;

      if (isSchemasAvailable) {
        uriSchemas = `patternfly://schemas/${encodeURIComponent(name)}${buildSearchString({ version }, { prefix: true })}`;
        uriSchemasId = `patternfly://schemas/${encodeURIComponent(groupId)}`;

        resource.versions[version].uriSchemas = uriSchemas;
        resource.versions[version].uriSchemasId = uriSchemasId;

        uriIndexMap.set(uriSchemas.toLowerCase(), name);
        uriIndexMap.set(uriSchemasId.toLowerCase(), name);
      }

      const extendedEntry = {
        ...entry,
        id,
        groupId,
        name,
        displayName,
        displayCategory,
        uri,
        uriId,
        uriSchemas,
        uriSchemasId
      } as (PatternFlyMcpDocsCatalogDoc & PatternFlyMcpDocsMeta);

      if (path) {
        byPath[path] = extendedEntry;
      }

      byUri[uri] ??= [];
      byUri[uri]?.push(extendedEntry);

      if (uriSchemas) {
        byUri[uriSchemas] ??= [];
        byUri[uriSchemas]?.push(extendedEntry);
      }

      byVersion[version] ??= [];
      byVersion[version]?.push(extendedEntry);

      mutateKeyWordsMap(rawKeywordsMap, { keyword: name, name, version });

      if (entry.displayName) {
        mutateKeyWordsMap(rawKeywordsMap, { keyword: entry.displayName, name, version });
      }

      if (entry.category) {
        mutateKeyWordsMap(rawKeywordsMap, { keyword: entry.category, name, version });
      }

      if (entry.section) {
        mutateKeyWordsMap(rawKeywordsMap, { keyword: entry.section, name, version });
      }

      if (entry.description) {
        mutateKeyWordsMap(rawKeywordsMap, { keyword: entry.description, name, version });
      }

      resource.entries.push(extendedEntry);
      resource.versions[version].entries.push(extendedEntry);
    });
  });

  Object.entries(byVersion).forEach(([_version, entries]) => {
    entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  });

  const filteredKeywords = filterKeywords(rawKeywordsMap);

  return {
    ...versionContext,
    resources,
    // @deprecated docsIndex - Under review
    docsIndex: Array.from(resources.keys()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
    // @deprecated componentsIndex - Under review
    componentsIndex: componentNamesIndex,
    isFallbackDocumentation: originalDocs.isFallback,
    keywordsIndex: Array.from(new Set([
      ...componentNamesIndex,
      ...Array.from(filteredKeywords.keys())
    ])).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
    keywordsMap: filteredKeywords,
    pathIndex: pathIndexMap,
    uriIndex: uriIndexMap,
    hashIndex: hashIndexMap,
    byPath,
    // @deprecated byUri - Under review
    byUri,
    byVersion,
    byVersionComponentNames: componentNamesByVersion
  };
};

/**
 * Memoized version of getPatternFlyMcpResources.
 */
getPatternFlyMcpResources.memo = memo(getPatternFlyMcpResources);

/**
 * Get the component schema from @patternfly/patternfly-component-schemas.
 *
 * @param componentName - Name of the component to retrieve the schema for.
 * @returns The component schema, or `undefined` if the component name is not found.
 */
const getPatternFlyComponentSchema = async (componentName: string) => {
  const { latestVersion, byVersionComponentNames } = await getPatternFlyMcpResources.memo();

  try {
    const updatedComponentName = byVersionComponentNames.get(latestVersion)?.[componentName.toLowerCase()]?.displayName;

    if (!updatedComponentName) {
      return undefined;
    }

    return await getComponentSchema(updatedComponentName);
  } catch (error) {
    log.debug(`Failed to get component schemas for "${componentName}": ${formatUnknownError(error)}`);
  }

  return undefined;
};

/**
 * Memoized version of getPatternFlyComponentSchema.
 */
getPatternFlyComponentSchema.memo = memo(getPatternFlyComponentSchema, DEFAULT_OPTIONS.toolMemoOptions.usePatternFlyDocs);

export {
  getPatternFlyComponentSchema,
  getPatternFlyMcpResources,
  getPatternFlyComponentNames,
  mutateKeyWordsMap,
  setCategoryDisplayLabel,
  type PatternFlyMcpComponentNames,
  type PatternFlyMcpComponentNamesByVersion,
  type PatternFlyMcpComponentNamesDoc,
  type PatternFlyComponentSchema,
  type PatternFlyMcpAvailableResources,
  type PatternFlyMcpResourceMetadata,
  type PatternFlyMcpDocsMeta,
  type PatternFlyMcpResources,
  type PatternFlyMcpResourcesByPath,
  type PatternFlyMcpResourcesByUri,
  type PatternFlyMcpResourcesByVersion
};

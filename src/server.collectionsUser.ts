import { memo } from './server.caching';
import { sanitizeDataProp } from './server.toolsUser';
import { type McpCollection } from './collections';
import { type GlobalOptions } from './options';
import { type CollectionOptions } from './options.collections';

/**
 * Inline tool options.
 *
 * Alias of {@link GlobalOptions}.
 *
 * @note Author-facing configuration.
 */
type CollectionInternalOptions = GlobalOptions;

/**
 * External tool options.
 *
 * Alias of {@link ToolOptions}.
 *
 * @note Author-facing configuration.
 */
type CollectionExternalOptions = CollectionOptions;

/**
 * A normalized tool entry for normalizing values for strings and tool creators.
 *
 * @property type - Classification of the entry (tuple, invalid)
 * @property index - The original input index (for diagnostics)
 * @property original - The original input value
 * @property value - The final consumer value (string or creator)
 * @property collectionName - The collection name for tuple/object/function entries
 * @property error - Error message for invalid entries
 */
type NormalizedCollectionEntry = {
  type: 'tuple' | 'invalid';
  index: number;
  original: unknown;
  value: string | CollectionCreator;
  collectionName?: string | undefined;
  error?: string | undefined;
};

/**
 * A general tool entry for normalizing values for creators.
 */
type CreatorEntry = Pick<NormalizedCollectionEntry, 'type' | 'original' | 'value' | 'collectionName' | 'error'>;

/**
 * A function that returns a tuple `Collection`. An MCP collection of records "wrapper", or "creator".
 *
 * - `CollectionExternalOptions` is a limited subset of `CollectionInternalOptions` for external filePackage creators.
 * - `CollectionInternalOptions` is available for inline and built-in collection of records creators.
 *
 * @note Author-facing configuration.
 * @example A creator function. The handler may be async or sync.
 * () => [
 *   'creatorRecord',
 *   async (args) => { ... }
 * ]
 */
type CollectionCreator = (options?: CollectionExternalOptions | CollectionInternalOptions) => McpCollection;

/**
 * An array of normalized config values.
 *
 * - `string` - file path or package id
 * - `CollectionCreator` - function creator
 *
 * @note Author-facing multi-collection configuration.
 * @example An array/list of normalized config values
 * [
 *   './a/file/path/collection.mjs',
 *   () => [
 *     'creatorCollection',
 *     async (args) => { ... }
 *   ]
 * ];
 */
type CollectionModule = ReadonlyArray<NormalizedCollectionEntry['value']>;

/**
 * Normalize a tuple config into a collection of records' creator function.
 *
 * @param config - The array configuration to normalize.
 * @returns A collection of records' creator function, or undefined if the config is invalid.
 */
const normalizeTuple = (config: unknown): CreatorEntry | undefined => {
  if (!Array.isArray(config) || config.length < 2) {
    return undefined;
  }

  const name = sanitizeDataProp(config, '0');
  const handler = sanitizeDataProp(config, '1');

  if (!name || !handler) {
    return undefined;
  }

  const updatedName = (name.value as string)?.trim?.() || undefined;
  const updatedHandler = typeof handler.value === 'function' ? handler.value : undefined;

  if (!updatedName || !updatedHandler) {
    return undefined;
  }

  const creator: CollectionCreator = () => [
    updatedName as string,
    // updatedHandler as (args: unknown) => unknown | Promise<unknown>,
    updatedHandler,
    {
      runInChildProcess: true,
      isInternal: false
    }
  ];

  return {
    original: config,
    collectionName: updatedName as string,
    type: 'tuple',
    value: creator
  };
};

/**
 * Memoize the `normalizeTuple` function.
 */
normalizeTuple.memo = memo(normalizeTuple, { cacheErrors: false, keyHash: args => args[0] });

/**
 * Normalize the collection of record(s) configuration(s) into a normalized collection entry.
 *
 * @example Falsy values carried through to retain indexing on messaging
 * Input: [
 *   () => ['a', { inputSchema: {} }, () => {}],
 *   undefined,
 *   { name: 'b', description: 'b', inputSchema: {}, handler: () => {} }
 * ]
 * Output: ['creator', 'invalid', 'object']
 *
 * @param config - The configuration(s) to normalize.
 * @returns An array of normalized collection entries.
 */
const normalizeCollections = (config: any): NormalizedCollectionEntry[] => {
  const updatedConfigs = (normalizeTuple.memo(config) && [config]) || (Array.isArray(config) && config) || [config];
  const normalizedConfigs: NormalizedCollectionEntry[] = [];

  const flattenedConfigs = updatedConfigs.flatMap((item: unknown) =>
    (normalizeTuple.memo(item) && [item]) || (Array.isArray(item) && item) || [item]);

  flattenedConfigs.forEach((config: unknown, index: number) => {
    if (normalizeTuple.memo(config)) {
      normalizedConfigs.push({
        index,
        ...normalizeTuple.memo(config) as CreatorEntry
      });

      return;
    }

    const err = `createMcpCollection: invalid configuration used at index ${index}: Unsupported type ${typeof config}`;

    normalizedConfigs.push({
      index,
      original: config,
      type: 'invalid',
      value: err,
      error: err
    });
  });

  return normalizedConfigs;
};

/**
 * Memoized version of normalizeCollections.
 *
 * @note Review the memoization used in server.toolsUser.ts for the final
 * implementation. Currently, this is a low-level temporary solution.
 */
normalizeCollections.memo = memo(normalizeCollections, {
  cacheErrors: false,
  keyHash: args => args[0]
});

export {
  normalizeCollections,
  normalizeTuple,
  type CollectionInternalOptions,
  type CollectionExternalOptions,
  type NormalizedCollectionEntry,
  type CollectionCreator,
  type CreatorEntry,
  type CollectionModule
};

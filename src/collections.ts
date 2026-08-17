import { formatUnknownError, log } from './logger';
import { type GlobalOptions } from './options';

/**
 * A collection record schema.
 *
 * @note Allows custom fields by design. Collections are allowed to not contain the exact same
 * schema except for the required fields.
 *
 * @interface McpCollectionRecord
 *
 * @property id - Unique id for the record
 * @property sourceId - Source identifier (e.g., combo of git-hash + file path, or crawler endpoint)
 * @property sourceType - Source type classification
 */
interface McpCollectionRecord {
  id: string;
  sourceId: string;
  sourceType: 'package' | 'git' | 'api' | 'local';
  [customField: string]: unknown;
}

/**
 * Standard collection callback return structure for records collection.
 *
 * @interface McpCollectionResult
 *
 * @property records - Array of collection records with minimal required fields.
 * @property warnings - Optional array of warnings
 * @property errors - Optional array of errors
 */
interface McpCollectionResult {
  records: McpCollectionRecord[];
  warnings?: string[];
  errors?: string[];
  [key: string]: unknown;
}

/**
 * Standardized Tuple-based Record Source.
 *
 * @note **Future**: `priority` and `group` are future properties being considered in the
 * related collection work as a way to sort and override collections.
 *
 * @note **Future**: Review supporting `boolean` variations and async callbacks
 * `async (options) => boolean | #${string}` for dynamic configs.
 *
 * 0. `name` `{string}`: Unique identifier/name
 * 1. `handler` `{Function}`: callback function accepting an optional argument
 * 2. `_config` `{Object}`: Application level record source configuration. Unavailable to
 *     record collection plugins.
 *    - `_config.runParallel`: Optional internal import specifier (`#specifier`) to run the
 *        collection handler in a worker thread via the heavy pool. The referenced
 *        module must export `collectionCallback`. Applied in {@link composeCollections}.
 *    - `_config.runSchedule`: Optional object to dynamically decide if the record source
 *        should run in a scheduled interval using {@link DeferTaskOptions}
 *    - `_config.isRequired`: Optional boolean used to control server startup when
 *        collections are required for operation.
 *   - `_config._isInternal`: Optional boolean. Applied internally. Attempting to manually
 *       set this will be overridden. See {@link composeCollections}
 */
type McpCollection = [
  name: string,
  handler: (arg?: unknown) => McpCollectionResult | Promise<McpCollectionResult>,
  _config?: {
    runParallel?: `#${string}`;
    runSchedule?: { cancelMs?: number, intervalMs?: number };
    // priority?: number;
    isRequired?: boolean;
    // group?: string;
    _isInternal?: boolean;
  }
];

/**
 * A function that creates a collection registered with the MCP server.
 */
type McpCollectionCreator = (options?: GlobalOptions) => McpCollection;

/**
 * A collection registered with the MCP server. Generally returned through the
 * {@link registerCollections} callback settings.
 *
 * @property name - Name of the collection item.
 * @property {McpCollectionResult|undefined} [response] - Optional response associated with the item.
 * @property [error] - Optional error object if an error occurred during the collection process.
 */
type RegisterCollectionItem = {
  name: string;
  response?: McpCollectionResult | undefined;
  error?: unknown;
};

/**
 * Callback invoked when a collection item is loaded/updated.
 *
 * @param {RegisterCollectionItem} item - The updated collection item.
 * @param item.name - The name of the collection item.
 * @param {McpCollectionResult|undefined} [item.response] - Optional response associated with the item.
 * @param [item.error] - Optional error object if an error occurred during the collection process.
 */
type RegisterOnUpdate = ({ name, response, error }: RegisterCollectionItem) => void | Promise<void>;

/**
 * Callback invoked when required collections are loaded/updated.
 *
 * @param {RegisterCollectionItem[]} requiredCollections - Array of required collections.
 */
type RegisterOnRequired = (requiredCollections: RegisterCollectionItem[]) => void;

/**
 * A processed and settled collection.
 *
 * @property name - Collection name, or null if unnamed.
 * @property status - Item status; whether the operation was successful or failed.
 * @property {McpCollectionResult | unknown} value - Result of the operation if fulfilled, or an unknown value.
 * @property reason - Reason for the failure if the status is 'rejected', otherwise null.
 */
type RegisterCollectionSettledItem = {
  name: string | null;
  status: 'fulfilled' | 'rejected';
  value: McpCollectionResult | unknown;
  reason: unknown | null;
};

/**
 * Callback invoked when all collections are "settled", similar to `Promise.allSettled`.
 *
 * @param {RegisterCollectionsResult} results - Results of the collection process.
 */
type RegisterOnSettle = (results: RegisterCollectionsResult) => void;

/**
 * Batch results from registering multiple collections.
 *
 * This type encapsulates the outcome of registering collections, grouping the
 * results into settled, fulfilled, and rejected categories.
 *
 * @property {RegisterCollectionSettledItem[]} settled - Settled registration results, including
 *     both fulfilled and failed attempts.
 * @property {McpCollectionResult[]} fulfilled - Successfully registered collections, containing
 *     details of the fulfilled ops.
 * @property rejected - List of rejected registration attempts, with each entry containing
 *     the `name` of the failed collection (if available) and the `reason` for the failure.
 */
type RegisterCollectionsResult = {
  settled: RegisterCollectionSettledItem[];
  fulfilled: McpCollectionResult[];
  rejected: { name: string | null, reason: unknown }[];
};

/**
 * Central in-memory registry for all PatternFly collection records
 */
const serverRecordsRegistry = new Map<string, McpCollectionResult>();

/**
 * Listeners for server records registry updates
 */
const serverRecordsRegistryListeners = new Set<RegisterOnUpdate>();

/**
 * Retrieves the server collections/records registry, all or for a given collection name.
 *
 * @param params - Optional parameters.
 * @param params.collectionName - Name of the collection to retrieve.
 * @returns The entire server collections/records registry, or the registry for the specified collection name
 *     if provided and available, otherwise returns `undefined`.
 */
const getServerRecordsRegistry = ({ collectionName }: { collectionName?: string } = {}) => {
  if (collectionName) {
    return serverRecordsRegistry.get(collectionName);
  }

  return serverRecordsRegistry;
};

/**
 * Executes a collection callback, invalidates any cache, and then any next-call to the functions
 * blends the returned records and "re-memos" the results.
 *
 * @param {McpCollectionResult} collection - Collection.
 */
const setServerRecordsRegistry = async (collection: RegisterCollectionItem) => {
  const { name, response } = collection || {};

  try {
    if (name && response) {
      serverRecordsRegistry.set(name, response);

      for (const listener of serverRecordsRegistryListeners) {
        try {
          await listener(collection);
        } catch (error) {
          log.error(`Error in server records registry listener:`, error);
        }
      }

      log.debug(`Storing server collection ${name} records. (${response?.records?.length})`);
    }
  } catch (error) {
    log.error(`Failed to store server collection ${name}:`, error);
  }
};

/**
 * Register a listener callback to be invoked whenever a server record in the registry is updated.
 *
 * @param callback - The callback to execute on update.
 * @returns A function to unregister/unsubscribe the listener.
 */
const onUpdateServerRecordsRegistry = (callback: RegisterOnUpdate) => {
  if (typeof callback !== 'function') {
    log.warn('onUpdateServerRecordsRegistry: callback must be a function');

    return () => false;
  }

  serverRecordsRegistryListeners.add(callback);

  return () => {
    if (serverRecordsRegistryListeners.has(callback)) {
      serverRecordsRegistryListeners.delete(callback);

      return true;
    }

    return false;
  };
};

/**
 * Registers a set of collections asynchronously.
 *
 * - Required collections gatekeep `registerCollections` resolve.
 *    - See {@link McpCollection} for configuration details.
 * - When a collection resolves, `onUpdate` is called.
 * - When the required collections resolve, `onRequired` is called.
 * - When all collections are settled `onSettle` is called.
 *
 * @param {McpCollection[]} collections - An array of collection sources to be registered. Each source is represented as a tuple.
 * @param [options] - Options callback functions to handle registration events.
 * @param [options.onSettle] - A non-blocking consumer-facing callback executed after all collection registrations are
 *     settled. Receives the results as an object containing settled, fulfilled, and rejected collections.
 * @param [options.onUpdate] - A non-blocking consumer-facing callback executed for each collection registration update.
 *     Receives details about the collection being processed, including name, response, and any error encountered.
 * @param [options.onRequired] - A non-blocking consumer-facing callback executed when required collections are processed.
 *     Receives an array of results containing collection name, response, and error details.
 * @returns Resolves when all "isRequired" collections are registered and settled.
 * @throws {Error} If any required collection fails to register successfully.
 */
const registerCollections = async (
  collections: McpCollection[],
  { onSettle, onUpdate, onRequired }: {
    onSettle?: RegisterOnSettle, onUpdate?: RegisterOnUpdate, onRequired?: RegisterOnRequired
  } = {}
): Promise<void> => {
  log.debug(`Reviewing registration for ${collections.length} collections.`);

  // Wrapper for each loader; handle incremental updates
  const registrationPromises = collections.map(async ([name, callback]) => {
    let error: unknown | undefined;
    let response: McpCollectionResult | undefined;
    let isSuccess = false;

    try {
      response = await callback();
      isSuccess = true;
    } catch (err) {
      error = err;
      log.error(`Error loading collection ${name}: ${formatUnknownError(err)}`);
    }

    try {
      if (response) {
        await setServerRecordsRegistry({ name, response, error });
      }
    } catch (err) {
      log.error(`Error "setServerRecordsRegistry" for collection ${name}: ${formatUnknownError(err)}`);
    }

    // Fire-and-forget if it exists. Review using `Promise.try` in the future.
    Promise.resolve()
      .then(() => onUpdate?.({ name, response, error }))
      .catch(err => log.debug(`Error calling "onUpdate": ${formatUnknownError(err)}`));

    return { name, response, isSuccess, error };
  });

  // Determine which collections are required and optional
  const required = registrationPromises.filter((_, index) => collections[index]?.[2]?.isRequired);

  // Gatekeep on any required collections
  const results = await Promise.all(required);

  for (const res of results) {
    if (!res.isSuccess) {
      const requiredCollectionsFail = `Required collection ${res.name} failed to load.`;

      log.debug(requiredCollectionsFail);
      throw new Error(requiredCollectionsFail);
    }
  }

  // Fire-and-forget if it exists. Review using `Promise.try` in the future.
  Promise.resolve()
    .then(() => onRequired?.(results.map(({ name, response, error }) => ({ name, response, error }))))
    .catch(err => log.debug(`Error calling "onRequired": ${formatUnknownError(err)}`));

  // Wait for all loaders to settle
  Promise.all(registrationPromises).then(allResults => {
    // Map results to track names and results
    const settled = allResults.map((res, index) => {
      const item: RegisterCollectionSettledItem = {
        name: collections[index]?.[0] || null,
        status: res.isSuccess ? 'fulfilled' : 'rejected',
        value: res.isSuccess ? res.response : null,
        reason: res.isSuccess ? null : res.error
      };

      if (!res.isSuccess) {
        log.error(`Failed to register collection "${item.name}": ${item.reason}`);
      } else {
        log.debug(`Settled collection: ${item.name}`);
      }

      return item;
    });

    // Filter results
    const fulfilled = settled
      .filter(item => item.status === 'fulfilled')
      .map(item => item.value as McpCollectionResult);

    const rejected = settled
      .filter(item => item.status === 'rejected')
      .map(item => ({ name: item.name, reason: item.reason }));

    const returnValues = { settled, fulfilled, rejected };

    // Fire-and-forget if it exists. Review using `Promise.try` in the future.
    Promise.resolve()
      .then(() => onSettle?.(returnValues))
      .catch(err => log.debug(`Error calling "onSettle": ${formatUnknownError(err)}`));
  }).catch(err => {
    log.debug(`Failed to settle collections: ${err}`);
  });
};

export {
  getServerRecordsRegistry,
  onUpdateServerRecordsRegistry,
  registerCollections,
  setServerRecordsRegistry,
  type McpCollection,
  type McpCollectionCreator,
  type McpCollectionRecord,
  type McpCollectionResult,
  type RegisterCollectionItem,
  type RegisterCollectionSettledItem,
  type RegisterCollectionsResult
};

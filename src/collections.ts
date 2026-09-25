import { isPlainObject } from './server.helpers';
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
 * Plugin-visible collection metadata (tuple index 1).
 *
 * @property title - Optional title for the collection.
 */
type McpCollectionConfig = {
  title?: string;
} | undefined;

/**
 * Registered collections.
 *
 * @note {@link registerCollections} registers every tuple by `name` and optional `config` before
 * handlers or `_config.initial` run, which means a store entry can exist with no `response`,
 * see {@link getServerCollectionsRegistry}. Registry listeners run only when an update includes
 * `response`.
 *
 * @property {McpCollectionConfig} config - Optional plugin-visible metadata.
 * @property {McpCollectionResult} response - Collection records. Set when records are available.
 */
type McpCollectionRegistryEntry = {
  config?: McpCollectionConfig;
  response?: McpCollectionResult;
};

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
 * 1. `config` `{Object}`: Plugin-visible metadata. Available to plugins.
 *    - `title`: Optional title for the collection.
 * 2. `handler` `{Function}`: callback function accepting an optional argument
 * 3. `_config` `{Object}`: Internal runtime configuration. Unavailable to
 *     record collection plugins.
 *    - `_config.initial`: Optional initial collection records or loader function executed
 *        immediately at server startup prior to background scheduled runs or worker execution.
 *        Hydrates the server records registry at $t=0$.
 *    - `_config.runParallel`: Optional internal import specifier (`#specifier`) to run the
 *        collection handler in a worker thread via the heavy pool. The referenced
 *        module must export `collectionCallback`. Applied in {@link composeCollections}.
 *    - `_config.runSchedule`: Optional object to dynamically decide if the record source
 *        should run in a scheduled interval using {@link DeferTaskOptions}
 *    - `_config.retainLastViable`: Optional boolean or custom function to retain previously
 *        viable collection records in the registry if an update fails, drops to zero records,
 *        or triggers custom retention conditions.
 *    - `_config.isRequired`: Optional boolean used to control server startup when
 *        collections are required for operation.
 *   - `_config._isInternal`: Optional boolean. Applied internally. Attempting to manually
 *       set this will be overridden. See {@link composeCollections}
 */
type McpCollection = [
  name: string,
  config: McpCollectionConfig,
  handler: (arg?: unknown) => McpCollectionResult | Promise<McpCollectionResult>,
  _config?: {
    initial?: McpCollectionResult | (() => McpCollectionResult | Promise<McpCollectionResult>);
    runParallel?: `#${string}`;
    runSchedule?: {
      continueOnError?: boolean;
      cancelMs?: number;
      delayStartMs?: number;
      intervalMs?: number;
      repeat?: number
    };
    retainLastViable?: RetainLastViableOption;
    // priority?: number;
    isRequired?: boolean;
    // group?: string;
    _isInternal?: boolean;
  }
];

/**
 * Context provided to a {@link RetainLastViableCollection} evaluation.
 *
 * @property name - Collection name being evaluated.
 * @property {McpCollectionResult|undefined} [previous] - Previous "viable" collection stored in the registry.
 * @property {McpCollectionResult|undefined} [current] - Updated collection response created by the latest run.
 * @property [error] - Error, exception, thrown during collection updates.
 * @property isSuccess - Did the collection callback resolve without throwing an error?
 */
type RetainLastViableContext = {
  name: string;
  previous?: McpCollectionResult | undefined;
  current?: McpCollectionResult | undefined;
  error?: unknown | undefined;
  isSuccess: boolean;
};

/**
 * Custom function to determine whether the previous collection should be kept. Returning `true`
 * keeps the previous collection; `false` lets it get updated. Useful when a remote collection
 * fails.
 */
type RetainLastViableCollection = (context: RetainLastViableContext) => boolean | Promise<boolean>;

/**
 * Config option for `retainLastViable`. Supports `boolean` shorthand or a custom function.
 */
type RetainLastViableOption = boolean | RetainLastViableCollection;

/**
 * A function that creates a collection registered with the MCP server.
 */
type McpCollectionCreator = (options?: GlobalOptions) => McpCollection;

/**
 * A collection registered with the MCP server. Generally returned through the
 * {@link registerCollections} callback settings.
 *
 * @property name - Name of the collection item.
 * @property [config] - Plugin-visible collection metadata from the tuple.
 * @property {McpCollectionResult|undefined} [response] - Optional response associated with the item.
 * @property [error] - Optional error object if an error occurred during the collection process.
 */
type RegisterCollectionItem = {
  name: string;
  config?: McpCollectionConfig;
  response?: McpCollectionResult | undefined;
  error?: unknown;
};

/**
 * Callback invoked when a collection item is loaded/updated.
 *
 * @param {RegisterCollectionItem} item - The updated collection item.
 * @param item.name - The name of the collection item.
 * @param [item.config] - Plugin-visible collection metadata from the tuple.
 * @param {McpCollectionResult|undefined} [item.response] - Optional response associated with the item.
 * @param [item.error] - Optional error object if an error occurred during the collection process.
 */
type RegisterOnUpdate = ({ name, config, response, error }: RegisterCollectionItem) => void | Promise<void>;

/**
 * Options for {@link onUpdateServerRecordsRegistry}.
 *
 * @property replay - When `true`, invokes the callback once for each collection already in the registry.
 *     Live updates after subscribe **MAY INVOKE THE CALLBACK AGAIN** for the same collection.
 *     Deduplication is the consumer's responsibility.
 */
type OnUpdateServerRecordsRegistryOptions = {
  replay?: boolean;
};

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
 * Central in-memory registry for registered collections.
 */
const serverCollectionsRegistry = new Map<string, McpCollectionRegistryEntry>();

/**
 * Listeners for server collection registry updates
 */
const serverCollectionsRegistryListeners = new Set<RegisterOnUpdate>();

/**
 * Invokes a server records registry listener and logs errors without rethrowing.
 *
 * @param callback - Listener to invoke/fire.
 * @param item - Collection item passed to the listener.
 */
const invokeServerCollectionsRegistryListener = async (
  callback: RegisterOnUpdate,
  item: RegisterCollectionItem
) => {
  try {
    await callback(item);
  } catch (error) {
    log.error(`Error in server registry listener:`, error);
  }
};

/**
 * Retrieves either a server collection or the entire registry.
 *
 * @param [params] - Optional parameters.
 * @param [params.collectionName] - When set, returns that entry or `undefined`.
 * @returns Full registry map when `collectionName` is omitted.
 */
const getServerCollectionsRegistry = ({ collectionName }: { collectionName?: string } = {}) => {
  if (collectionName) {
    return serverCollectionsRegistry.get(collectionName);
  }

  return serverCollectionsRegistry;
};

/**
 * Register tuple `name` and optional `config` before records are available (sync).
 *
 * @param name - Collection name (tuple index 0).
 * @param [config] - Plugin-visible metadata (tuple index 1).
 */
const registerInitialCollection = (name: string, config?: McpCollectionConfig) => {
  const previous = serverCollectionsRegistry.get(name);
  const entry: McpCollectionRegistryEntry = {};

  if (previous?.response !== undefined) {
    entry.response = previous.response;
  }

  if (config !== undefined) {
    entry.config = config;
  } else if (previous?.config !== undefined) {
    entry.config = previous.config;
  }

  serverCollectionsRegistry.set(name, entry);
};

/**
 * Register or update a collection in the server registry.
 *
 * A collection may be registered with only a `name` (and optional `config`) before records exist.
 *
 * @param collection - Collection registration item.
 */
const setServerRecordsRegistry = async (collection: RegisterCollectionItem) => {
  const { name, response, config, error } = collection || {};

  try {
    if (!name) {
      return;
    }

    const previous = serverCollectionsRegistry.get(name);
    const entry: McpCollectionRegistryEntry = {};

    if (response !== undefined) {
      entry.response = response;
    } else if (previous?.response !== undefined) {
      entry.response = previous.response;
    }

    if (config !== undefined) {
      entry.config = config;
    } else if (previous?.config !== undefined) {
      entry.config = previous.config;
    }

    serverCollectionsRegistry.set(name, entry);

    if (entry.response !== undefined) {
      const item: RegisterCollectionItem = {
        name,
        config: entry.config,
        response: entry.response,
        error
      };

      for (const listener of serverCollectionsRegistryListeners) {
        await invokeServerCollectionsRegistryListener(listener, item);
      }
    }

    if (entry.response) {
      log.debug(`Storing server collection ${name} records. (${entry.response.records?.length})`);
    } else {
      log.debug(`Registering server collection ${name}.`);
    }
  } catch (error) {
    log.error(`Failed to store server collection ${name}:`, error);
  }
};

/**
 * Register a listener callback to be fired whenever a server record in the registry is updated.
 *
 * @note Using the `replay` {@link OnUpdateServerRecordsRegistryOptions.replay} option means the
 * callback can be fired multiple times for the same collection. Deduplication is the consumer's
 * responsibility. This isn't needed if your collections are `required`.
 *
 * @param callback - The callback to execute on update.
 * @param [options] - Subscribe options.
 * @param [options.replay] - When `true`, fire the registry-level callback for each collection
 *     already stored in the registry. Useful for callbacks registered after the registry-level callback
 *     has already fired. Defaults to `false`. See {@link OnUpdateServerRecordsRegistryOptions.replay}
 * @returns A function to unregister/unsubscribe the listener.
 */
const onUpdateServerRecordsRegistry = (
  callback: RegisterOnUpdate,
  { replay = false }: OnUpdateServerRecordsRegistryOptions = {}
) => {
  if (typeof callback !== 'function') {
    log.warn('onUpdateServerRecordsRegistry: callback must be a function');

    return () => false;
  }

  serverCollectionsRegistryListeners.add(callback);

  if (replay) {
    void (async () => {
      for (const [name, entry] of serverCollectionsRegistry) {
        if (!serverCollectionsRegistryListeners.has(callback)) {
          break;
        }

        await invokeServerCollectionsRegistryListener(callback, {
          name,
          config: entry.config,
          response: entry.response,
          error: undefined
        });
      }
    })();
  }

  return () => {
    if (serverCollectionsRegistryListeners.has(callback)) {
      serverCollectionsRegistryListeners.delete(callback);

      return true;
    }

    return false;
  };
};

/**
 * Default "last viable" check, see {@link RetainLastViableCollection}.
 * Retains the previous response if:
 *  1. If the previous data existed and records had length (`previous.records.length > 0`), AND
 *  2. The new update threw an error (`!isSuccess`) OR returned zero records (`current.records.length === 0`).
 *
 * @param context - Retention context.
 */
const defaultRetainCollection: RetainLastViableCollection = context => {
  const { previous, current, isSuccess } = context || {} as RetainLastViableContext;
  const prevCount = Array.isArray(previous?.records) ? previous.records.length : 0;
  const newCount = Array.isArray(current?.records) ? current.records.length : 0;

  return prevCount > 0 && (!isSuccess || newCount === 0);
};

/**
 * Is this a collection record?
 *
 * @param value - Value to check.
 */
const isMcpCollectionRecord = (value: unknown): value is McpCollectionRecord =>
  isPlainObject(value) &&
  typeof (value as McpCollectionRecord).id === 'string' && (value as McpCollectionRecord).id.length > 0 &&
  typeof (value as McpCollectionRecord).sourceId === 'string' && (value as McpCollectionRecord).sourceId.length > 0 &&
  typeof (value as McpCollectionRecord).sourceType === 'string' && (value as McpCollectionRecord).sourceType.length > 0;

/**
 * Is this a collection result?
 *
 * @param value - Value to check.
 */
const isMcpCollectionResult = (value: unknown): value is McpCollectionResult =>
  isPlainObject(value) &&
  Array.isArray((value as McpCollectionResult).records) &&
  (value as McpCollectionResult).records.every(isMcpCollectionRecord);

/**
 * Registers a set of collections asynchronously.
 *
 * - Required collections gatekeep `registerCollections` resolve.
 *    - See {@link McpCollection} for configuration details.
 * - When a collection resolves, `onUpdate` is called.
 * - When the required collections resolve, `onRequired` is called.
 * - When all collections are settled `onSettle` is called.
 *
 * @note **Revisit:**
 * - Collections with `_config.runSchedule` (e.g. long `delayStartMs` or `repeat: Infinity`) still run in
 *     the same per-tuple handler `await` and settlement path as loaders. This means `onSettle` may not run
 *     until those handlers return. Revisit this if a use case for earlier settlement pops up.
 * - Initial tuple name and configs are registered before records exist. This does not invoke
 *     {@link onUpdateServerRecordsRegistry} listeners or `replay`. Revisit if late listeners need replay.
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

  // Step 0: Register each collection tuple before records load.
  for (const [name, config] of collections) {
    registerInitialCollection(name, config);
  }

  // Step 1: Immediate hydration for collections with `_config.initial`
  for (const [name, config, , _config] of collections) {
    if (_config?.initial) {
      try {
        const initialResult = typeof _config.initial === 'function'
          ? await _config.initial()
          : _config.initial;

        if (isMcpCollectionResult(initialResult)) {
          await setServerRecordsRegistry({ name, config, response: initialResult, error: undefined });
        } else {
          throw new Error(`Invalid collection response "${name}"`);
        }
      } catch (err) {
        log.warn(`Failed to hydrate initial data for collection "${name}": ${formatUnknownError(err)}`);
      }
    }
  }

  // Step 2: Main collection execution (handles scheduled/worker/background callbacks)
  // Wrapper for each loader; handle incremental updates
  const registrationPromises = collections.map(async ([name, config, callback, _config]) => {
    let error: unknown | undefined;
    let response: McpCollectionResult | undefined;
    let isSuccess = false;

    try {
      const initialResponse = await callback();

      if (isMcpCollectionResult(initialResponse)) {
        isSuccess = true;
        response = initialResponse;
      } else {
        throw new Error(`Invalid collection response "${name}"`);
      }
    } catch (err) {
      error = err;
      log.error(`Error loading collection ${name}: ${formatUnknownError(err)}`);
    }

    const previousCollection = getServerCollectionsRegistry({ collectionName: name }) as McpCollectionRegistryEntry | undefined;
    const previous = previousCollection?.response;
    let shouldRetain = false;

    if (_config?.retainLastViable) {
      try {
        const context: RetainLastViableContext = {
          name,
          previous,
          current: response,
          error,
          isSuccess
        };

        shouldRetain = await Promise.resolve(
          typeof _config.retainLastViable === 'function'
            ? (_config.retainLastViable as RetainLastViableCollection)(context)
            : defaultRetainCollection(context)
        );
      } catch (err) {
        log.warn(`Error evaluating "retainLastViable" collection "${name}": ${formatUnknownError(err)}`);
      }
    }

    try {
      if (shouldRetain) {
        log.warn(`Collection "${name}" update triggered retention policy; keeping previous viable response (${previous?.records?.length || 0} records).`);
        response = previous;
      } else if (response) {
        await setServerRecordsRegistry({ name, config, response, error });
      }
    } catch (err) {
      log.error(`Error "setServerRecordsRegistry" for collection ${name}: ${formatUnknownError(err)}`);
    }

    // Fire-and-forget if it exists. Review using `Promise.try` in the future.
    Promise.resolve()
      .then(() => onUpdate?.({ name, config, response, error }))
      .catch(err => log.debug(`Error calling "onUpdate": ${formatUnknownError(err)}`));

    return { name, config, response, isSuccess, error };
  });

  // Determine which collections are required and optional
  const required = registrationPromises.filter((_, index) => collections[index]?.[3]?.isRequired);

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
    .then(() => onRequired?.(results.map(({ name, config, response, error }) => ({ name, config, response, error }))))
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
  defaultRetainCollection,
  getServerCollectionsRegistry,
  isMcpCollectionRecord,
  isMcpCollectionResult,
  onUpdateServerRecordsRegistry,
  registerCollections,
  registerInitialCollection,
  setServerRecordsRegistry,
  type OnUpdateServerRecordsRegistryOptions,
  type RetainLastViableContext,
  type RetainLastViableOption,
  type RetainLastViableCollection,
  type McpCollection,
  type McpCollectionConfig,
  type McpCollectionCreator,
  type McpCollectionRegistryEntry,
  type McpCollectionRecord,
  type McpCollectionResult,
  type RegisterCollectionItem,
  type RegisterCollectionSettledItem,
  type RegisterCollectionsResult
};

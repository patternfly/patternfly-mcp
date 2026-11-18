import {
  isAsync,
  isPromise,
  isReferenceLike
} from './server.helpers';
import {
  isMemoError,
  memo,
  normalizeMemoCache,
  type MemoCacheCallback,
  type MemoCacheContext,
  type MemoMapLike,
  type MemoCacheEntry
} from './server.caching';

/**
 * Target store accepted by {@link memoSettledAdapter}.
 *
 * - Accepts a `Map` or {@link MemoMapLike} store directly, a `Promise` resolving to one,
 *  or a factory callback returning one.
 *
 * - Entries are persisted as {@link MemoSettled} records of the unwrapped value
 *   type (`Awaited<V>`), allowing the same store type to be used with both synchronous
 *   and `async` memoized functions.
 *
 * @template K Key type.
 * @template V Memoized value or return type (unwrapped via `Awaited<V>` when stored).
 */
type MemoSettledAdapterStore<K, V> = MemoMapLike<K, MemoSettled<Awaited<V>>> |
  Map<K, MemoSettled<Awaited<V>>> |
  Promise<MemoMapLike<K, MemoSettled<Awaited<V>>> | Map<K, MemoSettled<Awaited<V>>>> |
  ((context?: MemoCacheContext) => MemoMapLike<K, MemoSettled<Awaited<V>>> | Map<K, MemoSettled<Awaited<V>>>) |
  MemoCacheCallback<V>;

/**
 * Configuration options for {@link memoSettledAdapter}.
 *
 * @property [cacheErrors] Whether to persist error values/rejections to the underlying target store.
 * @property [cacheLimit] Maximum number of entries retained in the in-memory read cache.
 * @property [expire] Sliding TTL in milliseconds for entries in the in-memory read cache.
 */
interface MemoSettledAdapterOptions {
  cacheErrors?: boolean | undefined;
  cacheLimit?: number | undefined;
  expire?: number | undefined;
}

/**
 * Shape submitted to the target store by {@link memoSettledAdapter}. Parallel to `Promise.allSettled` responses.
 *
 * @note The isPromise property is intended to work specifically with `memo` as a best-effort mechanism. A
 * targetStore that contains values where isPromise is omitted indicates a synchronous entry.
 *
 * @template V Value type.
 * @property [isPromise] True when the cached entry is a Promise. Property is omitted for synchronous entries.
 */
type MemoSettled<V> = PromiseSettledResult<V> & {
  isPromise?: boolean | undefined;
};

/**
 * In-flight adapter record.
 *
 * @template K Key type.
 */
interface MemoSettledAdapterActionRecord<K> {
  readonly token: symbol;
  readonly action: 'set' | 'delete' | 'clear';
  readonly key?: K | undefined;
}

/**
 * `memo` cache adapter for settling values before being passed to an external store (Map or {@link MemoMapLike}).
 *
 * @note **Behavior**
 * - The adapter is a pass-through for memoized content. It leverages the format used by `Promise.allSettled`
 *   responses to allow storing of both errors and fulfillment in a standard way.
 *
 * - Entries that are not Promises are normalized and treated as "settled" fulfilled, or rejected, raw values.
 *
 * - On hydrated reads back to memo, the "settled" wrapper is unwrapped:
 *     - Fulfilled values are returned as-is, or as a resolved Promise when `isPromise` is true.
 *     - Rejected values are rehydrated as a rejecting Promise when `isPromise` is true, or as an `isError`
 *       wrapper so `memo` re-throws them the same way it would in-process.
 *
 * - Memo interface: `memo` only inspects read queries (`has`, `get`, `size`, `keys`, `entries`) and relies
 *   on them responding synchronously. Mutating operations `set`, `delete`, and `clear` are fire-and-forget.
 *   'Memo' ignores their return values.
 *
 * - Backend persistence: The adapter updates its in-memory cache immediately so `memo` stays synchronous,
 *   then queues writes to the `targetStore` in the background. Serialization is the responsibility of the
 *   `targetStore`.
 *
 * - Technical behavior: `get`, `has`, `delete`, `clear`, and `size` update and answer
 *   immediately using in-memory state. Writes to the underlying `targetStore` (`set`, `delete`, `clear`)
 *   are queued in the background. Return values report immediate in-memory status, not backend confirmation.
 *
 * **Important**:
 * - The "settled" envelope properties (`status`, `value`, `reason`, `isPromise`) are the only properties
 *   inspected by this adapter. How a store serializes the "settled" results is the `targetStore`'s responsibility.
 *
 * - Persisted `undefined` values at the Map level are indistinguishable from missing entries. A `has`
 *   check is used to distinguish the two. The value is never interpreted by design. **It's on the
 *   consumer to handle consuming values passed by their own memoized functionality.**
 *
 * - Forwarded housekeeping: This adapter persists a single memo instance's view, it is not responsible
 *   for backend retention policy. All `clear` and `delete` calls from `memo`; whether triggered by caller
 *   intent (`memoized.clear()`, error eviction) or internal timers/limits (`expire`, `cacheLimit`); are
 *   forwarded directly to `targetStore`. Persistent or shared stores that outlive the `memo` instance
 *   must manage their own retention and decide whether to honor forwarded deletions.
 *
 * @note Review using `Promise.try` in `settle` once the Node floor is >= 23.
 *
 * @template K Key type.
 * @template V Value type.
 *
 * @param targetStore - Underlying storage backend or a Promise resolving to one.
 * @param [settings] - Configuration options, default fallbacks.
 * @param [settings.cacheErrors] - Persist errors/rejections to the target store. Inherited `memo` context takes
 *     precedence when `true`, otherwise falls back to this setting's default.
 * @param [settings.cacheLimit] - Max entries in the in-memory read cache. Inherited `memo` context takes
 *     precedence and falls back to the setting's default.
 * @param [settings.expire] - Sliding expiration in milliseconds. Inherited `memo` context takes precedence
 *     and falls back to the setting's default.
 * @returns A cache factory callback accepting MemoCacheContext and returning a MemoMapLike adapter.
 */
const memoSettledAdapter = <K = unknown, V = unknown>(
  targetStore: MemoSettledAdapterStore<K, V>,
  {
    cacheErrors: settingsCacheErrors = false,
    cacheLimit: settingsCacheLimit = 500,
    expire: settingsExpire = 5 * 60 * 1000
  }: MemoSettledAdapterOptions = {}
): MemoCacheCallback<V> => {
  let resolvedStore: MemoMapLike<K, MemoSettled<V>> | undefined;

  /**
   * Converts an unknown raw store value into a normalized memoization cache store.
   *
   * @note `memo` context NOT being passed to `targetStore` is by design and is
   * intended for the adapter only.
   *
   * @template K
   * @template V
   *
   * @param rawStore - The raw store value to normalize.
   * @returns A normalized memo map containing settled memoized values.
   */
  const normalizedStore = (rawStore: unknown): MemoMapLike<K, MemoSettled<V>> =>
    normalizeMemoCache<V>(rawStore) as unknown as MemoMapLike<K, MemoSettled<V>>;

  // Single queue for target store updates.
  let storeQueue: Promise<unknown> = isPromise(targetStore)
    ? Promise.resolve(targetStore)
      .then(store => {
        resolvedStore = normalizedStore(store);
      })
      .catch(() => {})
    : Promise.resolve();

  if (!isPromise(targetStore)) {
    resolvedStore = normalizedStore(targetStore);
  }

  /**
   * Queue a target store update. Runs asynchronously once the target has resolved.
   *
   * @param callback - Update to apply to the resolved target store.
   * @param [onComplete] - Applied after callback settles, or the target fails to resolve.
   */
  const storeUpdate = (
    callback: (store: MemoMapLike<K, MemoSettled<V>>) => unknown,
    onComplete?: (() => void) | undefined
  ): void => {
    let isApplied = false;
    const complete = () => {
      if (isApplied) {
        return;
      }

      isApplied = true;

      try {
        onComplete?.();
      } catch {}
    };

    const run = () => {
      if (!resolvedStore) {
        complete();

        return undefined;
      }

      try {
        const result = callback(resolvedStore);

        if (isPromise(result)) {
          return (result as Promise<unknown>)
            .then(value => {
              complete();

              return value;
            })
            .catch(() => {
              complete();
            });
        }

        complete();

        return result;
      } catch {
        complete();

        return undefined;
      }
    };

    storeQueue = storeQueue.then(run).catch(complete);
  };

  /**
   * Set defaults, return an object with map-like methods.
   *
   * @internal
   * @param {MemoCacheContext} context - memo cache context.
   * @returns Object with map-like methods.
   */
  return (context: MemoCacheContext = {}): MemoMapLike<unknown, MemoCacheEntry<V>> => {
    const cacheErrors = context.cacheErrors || settingsCacheErrors;
    const cacheLimit = context.cacheLimit ?? settingsCacheLimit;
    const expire = context.expire ?? settingsExpire;

    // Most recent value passed to `set()`, paired with a write-token until it settles and persists.
    const staged = new Map<K, { token: symbol; value: MemoCacheEntry<V> }>();
    const actionLog: MemoSettledAdapterActionRecord<K>[] = [];
    const readCache = new Map<unknown, MemoSettled<V> | V | undefined>();

    /**
     * Append an in-flight update, with its unique `token`, to the transaction log.
     *
     * @param action Action type.
     * @param [key] Target key for `set` and `delete`.
     * @param [token] Unique symbol identifying this action.
     * @return The unique token for this transaction.
     */
    const recordAction = (
      action: MemoSettledAdapterActionRecord<K>['action'],
      key?: K,
      token: symbol = Symbol()
    ): symbol => {
      actionLog.push({ token, action, key });

      return token;
    };

    /**
     * Remove the completed transaction from the in-flight log by its `token`.
     *
     * @param token Transaction token to remove.
     */
    const completeAction = (token: symbol): void => {
      const index = actionLog.findIndex(entry => entry.token === token);

      if (index !== -1) {
        actionLog.splice(index, 1);
      }
    };

    /**
     * Normalize every cache entry into a promise so every `set()` shares one settle path.
     * `memo` sync-error wrappers (`isError`) are invoked so they settle as rejections.
     *
     * @param value Entry value to settle.
     * @return Promise settling with the unwrapped value, or rejecting with the thrown/rejected reason.
     */
    const settle = (value: MemoCacheEntry<V>): Promise<unknown> => {
      if (isMemoError(value) && typeof value === 'function') {
        return new Promise(resolve => {
          resolve(value());
        });
      }

      return Promise.resolve(value);
    };

    /**
     * Is the entry an adapter envelope? Only `status` is checked, never the payload.
     *
     * @param entry Entry read from the store.
     * @return True if the entry is a `PromiseSettledResult`.
     */
    const isSettled = (entry: unknown): entry is MemoSettled<V> =>
      isReferenceLike(entry) &&
      'status' in entry &&
      ((entry as { status: unknown }).status === 'fulfilled' || (entry as { status: unknown }).status === 'rejected');

    /**
     * Hydrate a stored entry into the `memo` format.
     *
     * - Entries without wrappers are returned as-is.
     * - Settled entries with `isPromise` are rehydrated as Promises, otherwise fulfilled values
     *   are returned directly and rejections are wrapped as `isError` functions.
     *
     * @param entry Entry to hydrate.
     * @return A memo cache entry.
     */
    const hydrateMemo = (entry: unknown): MemoCacheEntry<V> | undefined => {
      if (!isAsync(entry) && isPromise(entry)) {
        const hydrated = Promise.resolve(entry).then(hydrateMemo);

        // Suppress unhandled-rejection noise until memo hands the value to the caller.
        hydrated.catch(() => {});

        return hydrated as unknown as MemoCacheEntry<V>;
      }

      if (!isSettled(entry)) {
        return entry as MemoCacheEntry<V>;
      }

      if (entry.status === 'fulfilled') {
        return (
          entry.isPromise ? Promise.resolve(entry.value) : entry.value
        ) as MemoCacheEntry<V>;
      }

      if (entry.isPromise) {
        const rejected = Promise.reject(entry.reason);

        // Suppress unhandled-rejection noise until memo hands it to the caller.
        rejected.catch(() => {});

        return rejected as MemoCacheEntry<V>;
      }

      const errorFunc = () => {
        throw entry.reason;
      };

      errorFunc.isError = true;

      return errorFunc as unknown as MemoCacheEntry<V>;
    };

    /**
     * Does the key exist in the target store? Faults and an unresolved target are `false`.
     *
     * @param key Entry key to check.
     * @return True if the resolved target store has the key.
     */
    const storeHas = (key: K): boolean => {
      for (let i = actionLog.length - 1; i >= 0; i--) {
        const entry = actionLog[i]!;

        if (
          entry.action === 'clear' ||
          (entry.action === 'delete' && (entry.key === key || Object.is(entry.key, key)))
        ) {
          return false;
        }
      }

      try {
        return Boolean(resolvedStore?.has(key));
      } catch {}

      return false;
    };

    /**
     * Get an entry from the resolved store.
     *
     * @param key Entry key to get.
     * @return Entry from the resolved store.
     */
    const memoizedGet = memo(
      (key: K): MemoSettled<V> | V | undefined => {
        try {
          return resolvedStore?.get(key) as MemoSettled<V> | V | undefined;
        } catch {}

        return undefined;
      },
      {
        cache: readCache,
        cacheLimit,
        expire,
        keyHash: args => args[0] as string
      }
    );

    return {

      /**
       * Clear the cache. Adapter tiers clear synchronously, the target store clear is queued
       * if supported by the `targetStore`.
       *
       * @note Also invoked by `memo` when its sliding `expire` timer fires. See {@link memoSettledAdapter} "Forwarded housekeeping".
       */
      clear(): void {
        const token = recordAction('clear');

        staged.clear();
        memoizedGet.clear();

        storeUpdate(
          store => store.clear?.(),
          () => completeAction(token)
        );
      },

      /**
       * Delete an entry from the cache.
       *
       * @note Returns `true` if the key existed in the adapter at the time of the call, then queues
       *     the deletion in the underlying store if supported. If the target store is still resolving,
       *     returns `false`.
       *
       * @note Also invoked by `memo` for `cacheLimit` eviction and `cacheErrors: false` rejection
       *     removal. See {@link memoSettledAdapter} "Forwarded housekeeping".
       *
       * @param key Entry key to delete.
       * @return True if the key was found and removed from the adapter.
       */
      delete(key: K): boolean {
        const existed = staged.has(key) || readCache.has(key) || storeHas(key);
        const token = recordAction('delete', key);

        staged.delete(key);
        readCache.delete(key);

        storeUpdate(
          store => store.delete?.(key),
          () => completeAction(token)
        );

        return existed;
      },

      /**
       * Return an iterator of entries in the cache.
       *
       * @note Entries are unwrapped; the read cache itself holds the persisted envelopes.
       *
       * @return An iterable iterator of tuples containing each cache key and value.
       */
      entries(): IterableIterator<[K, MemoCacheEntry<V>]> {
        return Array.from((readCache as Map<K, unknown>).entries())
          .map(([key, entry]) => [key, hydrateMemo(entry)] as [K, MemoCacheEntry<V>])
          .values();
      },

      /**
       * Retrieve a cache entry.
       *
       * @param key The key used to look up the memoized cache entry.
       * @return The matching memoized cache entry, or `undefined` if no entry exists.
       */
      get(key: K): MemoCacheEntry<V> | undefined {
        const stagedEntry = staged.get(key);

        if (stagedEntry) {
          return stagedEntry.value;
        }

        if (readCache.has(key) || storeHas(key)) {
          return hydrateMemo(memoizedGet(key));
        }

        return undefined;
      },

      /**
       * Does the key exist?
       *
       * @param key Entry key to check.
       * @return True if the key exists.
       */
      has(key: K): boolean {
        return staged.has(key) || readCache.has(key) || storeHas(key);
      },

      /**
       * Return an iterator of keys in the cache.
       *
       * @return An iterable iterator of keys.
       */
      keys(): IterableIterator<K> {
        return (readCache as Map<K, MemoCacheEntry<V>>).keys();
      },

      /**
       * Set an entry in the cache.
       *
       * @note Mirrors `Map.set` used by `memo`. Every set overwrites the current entry for `key`.
       *     `memo` determines the `has()` check, this adapter **SHOULD NOT** add its own.
       *
       * @note All values take the same path: staged synchronously so `get()` returns exactly what was
       *     set, then settled and queued to the target store as a `PromiseSettledResult`. A superseded
       *     entry's late settlement is ignored. Rejections are persisted only when `cacheErrors` is
       *     enabled, otherwise the key is deleted from the target store.
       *
       * @param key Entry key to set.
       * @param value Entry value to set.
       * @return The current cache instance.
       */
      set(key: K, value: MemoCacheEntry<V>): unknown {
        const token = recordAction('set', key);
        const isValuePromise = !isAsync(value) && isPromise(value);

        readCache.delete(key);
        staged.set(key, { token, value });

        settle(value)
          .then(
            (resolvedValue): MemoSettled<V> => ({
              status: 'fulfilled',
              value: resolvedValue as V,
              ...(isValuePromise ? { isPromise: true } : {})
            }),
            (reason: unknown): MemoSettled<V> => ({
              status: 'rejected',
              reason,
              ...(isValuePromise ? { isPromise: true } : {})
            })
          )
          .then(settled => {
            if (staged.get(key)?.token !== token) {
              completeAction(token);

              return;
            }

            storeUpdate(
              store => {
                if (settled.status === 'rejected' && !cacheErrors) {
                  return store.delete?.(key);
                } else {
                  return store.set(key, settled);
                }
              },
              () => {
                if (staged.get(key)?.token === token) {
                  staged.delete(key);
                }
                completeAction(token);
              }
            );
          });

        return this;
      },

      /**
       * Returns the number of entries in the cache.
       */
      get size(): number {
        return readCache.size;
      }
    } as unknown as MemoMapLike<unknown, MemoCacheEntry<V>>;
  };
};

export {
  memoSettledAdapter,
  type MemoSettled,
  type MemoSettledAdapterOptions,
  type MemoSettledAdapterStore
};

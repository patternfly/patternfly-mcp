import {
  generateHash,
  isPromise,
  isReferenceLike
} from './server.helpers';
import { log } from './logger';

/**
 * Read-only facts about the memo instance, handed to a cache factory.
 *
 * @property isFuncPromise - `true` when the memoized function is async / returns a Promise-like.
 * @property cacheErrors - Mirrors the `cacheErrors` option.
 * @property cacheLimit - Mirrors the `cacheLimit` option.
 * @property expire - Mirrors the (parsed) `expire` option, `undefined` when not set.
 */
interface MemoCacheContext {
  readonly isFuncPromise?: boolean | undefined;
  readonly cacheErrors?: boolean | undefined;
  readonly cacheLimit?: number | undefined;
  readonly expire?: number | undefined;
}

/**
 * Alternative callback used to return a map-like cache for memo entries.
 *
 * @template TReturn Return type stored in each memo cache entry.
 *
 * @param {MemoCacheContext} context - Memo context associated with the current operation.
 * @returns {MemoMapLike<unknown, MemoCacheEntry<TReturn>>} A map-like cache containing memo entries for the return type.
 */
type MemoCacheCallback<TReturn> =
  (context: MemoCacheContext) => MemoMapLike<unknown, MemoCacheEntry<TReturn>>;

/**
 * Map-like interface consumed by `memo`.
 *
 * - Write methods (`set`, `delete`, `clear`) may be asynchronous; their return values are ignored.
 * - Optional members control optional features:
 *   - `size`, `keys`, `delete`: required together for `cacheLimit` eviction. Omit `size` to disable
 *       eviction and the `onCacheRollout` callback.
 *   - `entries`: used to build `onCacheExpire`/`onCacheRollout`/`onCacheClear` payloads and `debug`
 *       snapshots. When omitted, payload maps are empty.
 *   - `clear`: used by `expire`, `cacheLimit <= 0`, and `memoized.clear()`. When omitted, those paths
 *       are no-ops for the cache.
 *
 * @note
 * **Map-like cache adapters**
 * Creating an adapter should follow basic rules around `memo`'s architecture:
 * - `memo` directly returns `get` without "await"
 * - `memo` can cache and return Promises
 *
 * If the adapter is bridging a persistent, or async cache, values would normally be resolved
 * before reaching the caller. But an adapter could also return a JS Promise if it was known
 * that the memo implementation was async.
 *
 * @template K Key type.
 * @template V Value type.
 *
 * @property [clear] - Can be async, the return value is ignored. Used by `expire`, `cacheLimit <= 0`, and `memoized.clear()`.
 *     When omitted, those paths are no-ops for the cache.
 * @property [delete] - Can be async, the return value is ignored.
 * @property [entries] - Used to build `onCacheExpire`/`onCacheRollout`/`onCacheClear` payloads and `debug` snapshots.
 *     When omitted, payload maps are empty.
 * @property get - **Required**. Synchronous, the return value is handed to the caller/consumer as-is, including any Promise.
 * @property has - **Required**. Must return a `boolean` synchronously; `memo` branches on it inline.
 * @property [keys] - Used with `size` and `delete` for `cacheLimit` eviction. Oldest is first, based on Map insertion order.
 * @property set - **Required**. Can be async, the return value is ignored.
 * @property [size] - Set size to `<= 0` to disable `cacheLimit` and the `onCacheRollout` callback.
 */
interface MemoMapLike<K, V> {
  clear?(): unknown;
  delete?(key: K): unknown;
  entries?(): IterableIterator<[K, V]>;
  get(key: K): V | undefined | Promise<V | undefined>;
  has(key: K): boolean;
  keys?(): IterableIterator<K>;
  set(key: K, value: V): unknown;
  readonly size?: number | undefined;
}

/**
 * Error wrapper for memoized synchronous errors.
 */
type MemoErrorFunction = (() => never) & { isError: boolean };

/**
 * Union of possible cache entry values stored in a memo cache.
 *
 * @template TReturn Return type of the memoized function.
 */
type MemoCacheEntry<TReturn = unknown> = TReturn | Promise<TReturn> | MemoErrorFunction;

/**
 * Memo cache map.
 *
 * @template TReturn Return type of the memoized function.
 */
type MemoCache<TReturn = unknown> = Map<unknown, MemoCacheEntry<TReturn>>;

/**
 * Memo cache handler response parameters.
 *
 * @template TReturn Return type of the memoized function.
 *
 * @property {Map<unknown, TReturn>} remaining Map of cache entries that were NOT removed from the cache due to cache limit.
 * @property {Map<unknown, TReturn>} removed Map of cache entries that were removed from the cache due to cache limit.
 * @property {Map<unknown, TReturn>} all Map of all cache entries, including removed entries.
 */
type MemoCacheHandlerResponse<TReturn = unknown> = {
  remaining: Map<unknown, TReturn>;
  removed: Map<unknown, TReturn>;
  all: Map<unknown, TReturn>;
};

/**
 * Memo cache handler callback.
 *
 * Return values are ignored. Thrown errors are logged but not propagated.
 *
 * @template TReturn Return type of the memoized function.
 *
 * @param {MemoCacheHandlerResponse<TReturn>} cache Memo cache handler response.
 */
type OnMemoCacheHandler<TReturn = unknown> = (cache: MemoCacheHandlerResponse<TReturn>) => void | Promise<void>;

/**
 * Debug handler callback.
 *
 * @template TReturn Return type of the memoized function.
 *
 * @param info - Object containing debugging information.
 * @param info.type - Information debugging category.
 * @param info.value - Value associated with the debug operation.
 * @param {MemoCache<TReturn>} info.cache - MemoCache Map
 */
type MemoDebugHandler<TReturn = unknown> = (info: { type: string; value: unknown; cache: MemoCache<TReturn> }) => void;

/**
 * notifyCacheChange handler options.
 *
 * @template TReturn Return type of the memoized function.
 *
 * @property {MemoCache<TReturn>} all - Full cache reflecting the current state before the change.
 * @property {MemoCache<TReturn>} remaining - Cache items that remain after the change.
 * @property {MemoCache<TReturn>} removed - Cache items that were removed as a result of the change.
 * @property {OnMemoCacheHandler<TReturn> | undefined} handler - Optional handler function to be invoked for the cache change.
 * @property handlerDescription - Optional descriptive about the handler, typically for logging or debugging purposes.
 */
type MemoNotifyCacheChangeOptions<TReturn = unknown> = {
  all: MemoCache<TReturn>;
  remaining: MemoCache<TReturn>;
  removed: MemoCache<TReturn>;
  handler: OnMemoCacheHandler<TReturn> | undefined;
  handlerDescription: string | undefined;
};

/**
 * Memo configuration options.
 *
 * @template TReturn Return type of the memoized function.
 *
 * @property [cacheErrors] Memoize errors, or don't (default: true). For async errors, a promise is cached.
 *     When the promise errors/rejects/catches, it is removed from the cache.
 * @property [cacheLimit] Number of entries to cache before overwriting previous entries (default: 1)
 * @property {MemoDebugHandler<TReturn>} [debug] Debug callback function
 * @property [expire] Expandable milliseconds until cache expires
 * @property [keyHash] Function to generate a predictable hash key from the provided arguments. Defaults to internal `generateHash`.
 * @property {OnMemoCacheHandler<TReturn>} [onCacheClear] Callback when cache entries are cleared.
 * @property {OnMemoCacheHandler<TReturn>} [onCacheExpire] Callback when cache expires. Only fires when the `expire` option is set.
 * @property {OnMemoCacheHandler<TReturn>} [onCacheRollout] Callback when cache entries are rolled off due to cache limit.
 * @property {Map<unknown, MemoCacheEntry<TReturn>> |
 *     MemoMapLike<unknown, MemoCacheEntry<TReturn>> |
 *     MemoCacheCallback<TReturn>} [cache] Custom Map or MapLike cache. Defaults to an internal Map.
 */
interface MemoOptions<TArgs extends unknown[] = unknown[], TReturn = unknown> {
  cacheErrors?: boolean;
  cacheLimit?: number;
  debug?: MemoDebugHandler<TReturn>;
  expire?: number;
  keyHash?: (args: Readonly<TArgs>, ..._forbidRest: never[]) => unknown;
  onCacheClear?: OnMemoCacheHandler<TReturn>;
  onCacheExpire?: OnMemoCacheHandler<TReturn>;
  onCacheRollout?: OnMemoCacheHandler<TReturn>;
  cache?: Map<unknown, MemoCacheEntry<TReturn>> | MemoMapLike<unknown, MemoCacheEntry<TReturn>> | MemoCacheCallback<TReturn>;
}

/**
 * Return type of `memoize`.
 *
 * @property clear Clear all cache entries.
 */
type MemoReturn<TArgs extends unknown[] = unknown[], TReturn = unknown> = ((...args: TArgs) => TReturn) & {
  clear: () => boolean;
};

/**
 * Helper for checking if a value is a map-like cache.
 *
 * @param value - Value to check.
 */
const isMapLike = <TReturn>(value: unknown): value is MemoMapLike<unknown, MemoCacheEntry<TReturn>> =>
  isReferenceLike(value) &&
  typeof (value as MemoMapLike<unknown, unknown>).has === 'function' &&
  typeof (value as MemoMapLike<unknown, unknown>).get === 'function' &&
  typeof (value as MemoMapLike<unknown, unknown>).set === 'function';

/**
 * Wraps a map-like memo cache target in a normalized interface.
 *
 * Native Maps are returned as-is. Map-like objects are wrapped with
 * methods to normalize their behavior when used with {@link memo}.
 *
 * @template TReturn The memoized return value type stored in cache entries.
 *
 * @param target Map-like cache to normalize methods.
 * @returns A normalized methods map-like cache interface for memo cache entries.
 */
const normalizeMapLike = <TReturn>(
  target: MemoMapLike<unknown, MemoCacheEntry<TReturn>>
) => {
  if (target instanceof Map) {
    return target;
  }

  return {
    has: (key: unknown) => Boolean(target.has(key)),
    get: (key: unknown) => target.get(key),
    set: (key: unknown, value: MemoCacheEntry<TReturn>) => target.set(key, value),
    clear: () => target.clear?.(),
    delete: (key: unknown) => target.delete?.(key),
    entries: () => target.entries?.() ?? new Map<unknown, MemoCacheEntry<TReturn>>().entries(),
    keys: () => target.keys?.() ?? new Map<unknown, MemoCacheEntry<TReturn>>().keys(),
    get size() {
      // Size, keys, and delete are required together for cacheLimit eviction.
      return typeof target.size === 'number' && typeof target.keys === 'function' && typeof target.delete === 'function'
        ? target.size
        : undefined;
    }
  };
};

/**
 * Helper for normalizing a memo cache into a usable map-like cache.
 *
 * @template TReturn Memoized function return type stored in cache entries.
 *
 * @param cache - Cache to normalize. Falsy values return the default map.
 * @param [options] - Optional normalization settings.
 * @param [options.cacheContext] - Context passed to a cache factory when `cache` is a function.
 * @param [options.debug] - Debug handler. Notified when cache normalization falls back because of an error.
 * @returns A map-like cache suitable for storing memoization entries.
 */
const normalizeMemoCache = <TReturn>(
  cache: unknown,
  { cacheContext = {}, debug }: { cacheContext?: MemoCacheContext | undefined; debug?: MemoDebugHandler<TReturn> | undefined } = {}
): Required<MemoMapLike<unknown, MemoCacheEntry<TReturn>>> => {
  const updatedDebug = typeof debug === 'function' ? debug : () => {};

  const logErrors = (error: unknown) => {
    log.error('Memoized cache error. Using internal fallback Map.', error);

    updatedDebug({
      type: 'memo cache error',
      value: error,
      cache: new Map()
    });
  };

  if (cache) {
    try {
      if (typeof cache === 'function') {
        const created: unknown = cache(cacheContext);

        if (isMapLike<TReturn>(created)) {
          return normalizeMapLike<TReturn>(created);
        }
      } else if (isMapLike<TReturn>(cache)) {
        return normalizeMapLike<TReturn>(cache);
      }

      throw new TypeError('Cache must be a map-like object with has/get/set, or a callback that returns one.');
    } catch (error) {
      logErrors(error);
    }
  }

  return new Map();
};

/**
 * Simple argument-based memoize with adjustable cache limit, and extendable cache expire.
 * apidoc-mock: https://github.com/cdcabrera/apidoc-mock.git
 *
 * - A synchronous wrapper that expects consumers to correctly handle returned values.
 * - `Zero-arg caching`: Zero-argument calls are memoized. To disable caching and perform a manual reset on every call, set cacheLimit <= 0.
 * - `Expiration`: Expiration expands until a pause in use happens. All results, regardless of type, will be expired.
 *
 * @template TArgs Arguments passed to the provided function represented as an array.
 * @template TReturn Return type of the provided/memoized function.
 *
 * @param {(...args: TArgs) => TReturn} func The function or promise/promise-like function to memoize
 * @param {MemoOptions<TArgs, TReturn>} [options={}] Configuration options.
 * @returns Memoized function
 *
 * @throws {Error} If an error occurs during function execution and `cacheErrors` is set to `false`,
 *     the error will not be cached and will need to be addressed by the caller. It's on the consumer to catch
 *     function errors and await or process a Promise resolve/reject/catch.
 */
const memo = <TArgs extends unknown[], TReturn = unknown>(
  func: (...args: TArgs) => TReturn,
  {
    cacheErrors = true,
    cacheLimit = 1,
    debug = () => {},
    expire,
    keyHash = generateHash,
    onCacheClear,
    onCacheExpire,
    onCacheRollout,
    cache: customCache
  }: MemoOptions<TArgs, TReturn> = {}
): MemoReturn<TArgs, TReturn> => {
  const isCacheErrors = Boolean(cacheErrors);
  const isFuncPromise = isPromise(func);
  const isOnCacheExpirePromise = isPromise(onCacheExpire);
  const isOnCacheExpire = typeof onCacheExpire === 'function' || isOnCacheExpirePromise;
  const isOnCacheRolloutPromise = isPromise(onCacheRollout);
  const isOnCacheRollout = typeof onCacheRollout === 'function' || isOnCacheRolloutPromise;
  const updatedExpire = Number.parseInt(String(expire), 10) || undefined;
  const setKey = function (value: TArgs): unknown {
    return keyHash.call(null, value);
  };

  /**
   * Notify callback handlers.
   *
   * @template TReturn - See {@link MemoCache}
   * @param params - Passed parameters.
   * @param {MemoCache<TReturn>} params.all - The current state of the entire memoized cache.
   * @param {MemoCache<TReturn>} params.remaining - A subset of items that have not been removed from the cache.
   * @param {MemoCache<TReturn>} params.removed - A subset of items that have been removed from the cache.
   * @param {OnMemoCacheHandler<TReturn>|undefined} params.handler - See {@link OnMemoCacheHandler}
   * @param {string|undefined} params.handlerDescription - A description of the handler.
   */
  const notifyCacheChange = ({
    all, remaining, removed, handler, handlerDescription
  }: MemoNotifyCacheChangeOptions<TReturn>) => {
    if (!handler) {
      return;
    }

    const errorDesc = handlerDescription ? `: ${handlerDescription}` : '';
    const payload: MemoCacheHandlerResponse<TReturn> = {
      all: all as Map<unknown, TReturn>,
      remaining: remaining as Map<unknown, TReturn>,
      removed: removed as Map<unknown, TReturn>
    };

    if (isPromise(handler)) {
      Promise.resolve(handler(payload)).catch(error => log.error(`Memoized handler error${errorDesc}`, error));
    } else if (typeof handler === 'function') {
      try {
        handler(payload);
      } catch (error) {
        log.error(`Memoized function error${errorDesc}`, error);
      }
    }
  };

  /**
   * Confirm the value has a memo error marker.
   *
   * @param value - The value to inspect.
   * @returns `true` when the value is a memo error marker; otherwise, `false`.
   */
  const isMemoError = (value: unknown): value is { isError: true } & (MemoErrorFunction | Record<string, unknown>) => (
    (typeof value === 'function' || isReferenceLike(value)) &&
    'isError' in value &&
    (value as { isError: unknown }).isError === true
  );

  /**
   * Memoized function.
   */
  const ized = function () {
    const cacheContext: MemoCacheContext = Object.freeze({
      isFuncPromise,
      cacheErrors: isCacheErrors,
      cacheLimit,
      expire: updatedExpire
    });

    const cache = normalizeMemoCache<TReturn>(customCache, { cacheContext, debug });
    let timeout: NodeJS.Timeout | undefined;

    // Take into account map-like objects with partial props
    const getCacheSnapshot = (passed = cache): MemoCache<TReturn> =>
      (passed instanceof Map ? new Map(passed) : new Map(passed.entries()));

    const memoized = (...args: TArgs): TReturn => {
      const isMemo = cacheLimit > 0;

      if (typeof updatedExpire === 'number') {
        clearTimeout(timeout);

        timeout = setTimeout(() => {
          if (isOnCacheExpire) {
            const allCacheEntries: MemoCache<TReturn> = getCacheSnapshot();

            notifyCacheChange({
              all: allCacheEntries,
              remaining: new Map(),
              removed: allCacheEntries,
              handler: onCacheExpire,
              handlerDescription: 'onCacheExpire callback'
            });
          }

          cache.clear();
        }, updatedExpire);

        // Allow the process to exit
        timeout.unref();
      }

      // Zero cacheLimit, reset and bypass memoization
      if (isMemo === false) {
        cache.clear();
        const bypassValue = func.call(null, ...args);

        debug({
          type: 'memo bypass',
          value: () => bypassValue,
          cache: new Map()
        });

        return bypassValue;
      }

      const key = setKey(args);

      // Parse, memoize and return the original value
      if (!cache.has(key)) {
        if (isFuncPromise) {
          const promiseResolve = Promise
            .resolve(func.call(null, ...args))
            .catch((error: unknown) => {
              // Remove the promise
              if (isCacheErrors === false) {
                cache.delete(key);
              }

              return Promise.reject(error);
            });

          // Cache the promise
          cache.set(key, promiseResolve);
        } else {
          try {
            cache.set(key, func.call(null, ...args));
          } catch (error) {
            // Wrap a sync error in a function then cache it
            const errorFunc = () => {
              throw error;
            };

            errorFunc.isError = true;
            cache.set(key, errorFunc);
          }
        }

        // Run callback and cache trim after cache update.
        if (isMemo) {
          if (isOnCacheRollout && typeof cache.size === 'number' && cache.size > cacheLimit) {
            const allCacheEntries: MemoCache<TReturn> = getCacheSnapshot();

            const temp = Array.from(allCacheEntries.entries());
            const remaining = allCacheEntries.size - cacheLimit;
            // Oldest cache entries
            const removedCacheEntries = temp.slice(0, remaining);

            if (removedCacheEntries.length > 0) {
              // Newest cache entries
              const remainingCacheEntries = temp.slice(remaining);

              notifyCacheChange({
                all: allCacheEntries,
                remaining: new Map(remainingCacheEntries),
                removed: new Map(removedCacheEntries),
                handler: onCacheRollout,
                handlerDescription: 'onCacheRollout callback'
              });
            }
          }

          if (typeof cache.size === 'number') {
            while (cache.size > cacheLimit) {
              const oldestKey = cache.keys().next();

              if (oldestKey === undefined || oldestKey.done) {
                break;
              }

              cache.delete(oldestKey.value);
            }
          }
        }
      }

      // Return memoized value
      const cachedValue = cache.get(key);

      if (isMemoError(cachedValue)) {
        if (isCacheErrors === false) {
          cache.delete(key);
        }

        debug({
          type: 'memo error',
          value: cachedValue,
          cache: getCacheSnapshot()
        });

        return typeof cachedValue === 'function' ? cachedValue() : cachedValue;
      }

      debug({
        type: `memo${(isFuncPromise && ' promise') || ''}`,
        value: () => cachedValue,
        cache: getCacheSnapshot()
      });

      return cachedValue as TReturn;
    };

    /**
     * Clear all memoized cache entries.
     *
     * @returns A `boolean` indicating if the cache was cleared.
     */
    memoized.clear = () => {
      const allCacheEntries: MemoCache<TReturn> = getCacheSnapshot();

      clearTimeout(timeout);
      timeout = undefined;
      cache.clear();

      debug({
        type: 'memo clear',
        value: undefined,
        cache: getCacheSnapshot()
      });

      notifyCacheChange({
        all: allCacheEntries,
        remaining: new Map(),
        removed: allCacheEntries,
        handler: onCacheClear,
        handlerDescription: 'onCacheClear callback'
      });

      return allCacheEntries.size > 0;
    };

    return memoized;
  };

  return ized();
};

export {
  isMapLike,
  memo,
  normalizeMemoCache,
  normalizeMapLike,
  type MemoCacheCallback,
  type MemoCacheContext,
  type MemoMapLike,
  type MemoCacheHandlerResponse,
  type MemoDebugHandler,
  type MemoCache,
  type MemoCacheEntry,
  type MemoNotifyCacheChangeOptions,
  type MemoOptions,
  type MemoReturn,
  type OnMemoCacheHandler
};

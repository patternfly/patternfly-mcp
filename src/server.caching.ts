import {
  generateHash,
  isPromise,
  isReferenceLike
} from './server.helpers';
import { log } from './logger';

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
 * Memo cache store map.
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
 * Simple argument-based memoize with adjustable cache limit, and extendable cache expire.
 * apidoc-mock: https://github.com/cdcabrera/apidoc-mock.git
 *
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
    onCacheRollout
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
    const cache: MemoCache<TReturn> = new Map();
    let timeout: NodeJS.Timeout | undefined;

    const memoized = (...args: TArgs): TReturn => {
      const isMemo = cacheLimit > 0;

      if (typeof updatedExpire === 'number') {
        clearTimeout(timeout);

        timeout = setTimeout(() => {
          if (isOnCacheExpire) {
            const allCacheEntries: MemoCache<TReturn> = new Map(cache);

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
          if (isOnCacheRollout && cache.size > cacheLimit) {
            const allCacheEntries: MemoCache<TReturn> = new Map(cache);

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

          while (cache.size > cacheLimit) {
            const oldestKey = cache.keys().next().value;

            cache.delete(oldestKey);
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
          cache: new Map(cache)
        });

        return typeof cachedValue === 'function' ? cachedValue() : cachedValue;
      }

      debug({
        type: `memo${(isFuncPromise && ' promise') || ''}`,
        value: () => cachedValue,
        cache: new Map(cache)
      });

      return cachedValue as TReturn;
    };

    /**
     * Clear all memoized cache entries.
     *
     * @returns A `boolean` indicating if the cache was cleared.
     */
    memoized.clear = () => {
      const allBefore = new Map(cache);

      if (allBefore.size === 0) {
        return false;
      }

      const allCacheEntries: MemoCache<TReturn> = new Map(cache);

      clearTimeout(timeout);
      timeout = undefined;
      cache.clear();

      debug({
        type: 'memo clear',
        value: undefined,
        cache: new Map(cache)
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
  memo,
  type MemoCacheHandlerResponse,
  type MemoDebugHandler,
  type MemoCache,
  type MemoCacheEntry,
  type MemoNotifyCacheChangeOptions,
  type MemoOptions,
  type MemoReturn,
  type OnMemoCacheHandler
};

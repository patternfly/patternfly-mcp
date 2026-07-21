import { generateHash, isPromise } from './server.helpers';
import { log } from './logger';

/**
 * Memo cache store.
 *
 * @template TReturn Array of cache entries.
 */
type MemoCache<TReturn> = Array<TReturn | Promise<TReturn> | { (): never; isError: boolean } | any>;

/**
 * Memo cache handler response parameters.
 *
 * @template TReturn Return type of the memoized function.
 *
 * @property {MemoCache<TReturn>} remaining Array of values that were NOT removed from the cache due to cache limit.
 * @property {MemoCache<TReturn>} removed Array of values that were removed from the cache due to cache limit.
 * @property {MemoCache<TReturn>} all Array of all values in the cache, including removed values.
 */
type MemoCacheHandlerResponse<TReturn = unknown> = {
  remaining: MemoCache<TReturn>;
  removed: MemoCache<TReturn>;
  all: MemoCache<TReturn>
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
 * @param {MemoCache<TReturn>} info.cache - MemoCache array
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
 * @param {MemoOptions<TReturn>} [options={}] Configuration options.
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
      all,
      remaining,
      removed
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
   * Memoized function.
   */
  const ized = function () {
    const cache: MemoCache<TReturn> = [];
    let timeout: NodeJS.Timeout | undefined;

    const memoized = (...args: TArgs): TReturn => {
      const isMemo = cacheLimit > 0;

      if (typeof updatedExpire === 'number') {
        clearTimeout(timeout);

        timeout = setTimeout(() => {
          if (isOnCacheExpire) {
            const allCacheEntries: Array<TReturn> = [];

            cache.forEach((entry, index) => {
              if (index % 2 === 0) {
                allCacheEntries.push(cache[index + 1] as TReturn);
              }
            });

            notifyCacheChange({
              all: allCacheEntries,
              remaining: [],
              removed: allCacheEntries,
              handler: onCacheExpire,
              handlerDescription: 'onCacheExpire callback'
            });
          }

          cache.length = 0;
        }, updatedExpire);

        // Allow the process to exit
        timeout.unref();
      }

      // Zero cacheLimit, reset and bypass memoization
      if (isMemo === false) {
        cache.length = 0;
        const bypassValue = func.call(null, ...args);

        debug({
          type: 'memo bypass',
          value: () => bypassValue,
          cache: []
        });

        return bypassValue;
      }

      const key = setKey(args);

      // Parse, memoize and return the original value
      if (cache.indexOf(key) < 0) {
        if (isFuncPromise) {
          const promiseResolve = Promise
            .resolve(func.call(null, ...args))
            .catch((error: unknown) => {
              const promiseKeyIndex = cache.indexOf(key);

              // Remove the promise
              if (isCacheErrors === false && promiseKeyIndex >= 0) {
                cache.splice(promiseKeyIndex, 2);
              }

              return Promise.reject(error);
            });

          // Cache the promise
          cache.unshift(key, promiseResolve);
        } else {
          try {
            cache.unshift(key, func.call(null, ...args));
          } catch (error) {
            // Wrap a sync error in a function then cache it
            const errorFunc = () => {
              throw error;
            };

            errorFunc.isError = true;
            cache.unshift(key, errorFunc);
          }
        }

        // Run callback and cache trim after cache update.
        if (isMemo) {
          if (isOnCacheRollout && cache.length > cacheLimit * 2) {
            const allCacheEntries: Array<TReturn> = [];

            cache.forEach((entry, index) => {
              if (index % 2 === 0) {
                allCacheEntries.push(cache[index + 1] as TReturn);
              }
            });

            const removedCacheEntries = allCacheEntries.slice(cacheLimit);

            if (removedCacheEntries.length > 0) {
              const remainingCacheEntries = allCacheEntries.slice(0, cacheLimit);

              notifyCacheChange({
                all: allCacheEntries,
                remaining: remainingCacheEntries,
                removed: removedCacheEntries,
                handler: onCacheRollout,
                handlerDescription: 'onCacheRollout callback'
              });
            }
          }

          cache.length = cacheLimit * 2;
        }
      }

      // Return memoized value
      const updatedKeyIndex = cache.indexOf(key);
      const cachedValue = cache[updatedKeyIndex + 1];

      if (cachedValue?.isError === true) {
        if (isCacheErrors === false) {
          cache.splice(updatedKeyIndex, 2);
        }

        debug({
          type: 'memo error',
          value: cachedValue,
          cache: [...cache]
        });

        return cachedValue();
      }

      debug({
        type: `memo${(isFuncPromise && ' promise') || ''}`,
        value: () => cachedValue,
        cache: [...cache]
      });

      return cachedValue;
    };

    /**
     * Clear all memoized cache entries.
     *
     * @returns A `boolean` indicating if the cache was cleared.
     */
    memoized.clear = () => {
      const allBefore = [...cache];

      if (allBefore.length === 0) {
        return false;
      }

      const allCacheEntries: Array<TReturn> = [];

      cache.forEach((entry, index) => {
        if (index % 2 === 0) {
          allCacheEntries.push(cache[index + 1] as TReturn);
        }
      });

      clearTimeout(timeout);
      timeout = undefined;
      cache.length = 0;

      debug({
        type: 'memo clear',
        value: undefined,
        cache: [...cache]
      });

      notifyCacheChange({
        all: allCacheEntries,
        remaining: [],
        removed: allCacheEntries,
        handler: onCacheClear,
        handlerDescription: 'onCacheClear callback'
      });

      return allCacheEntries.length > 0;
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
  type MemoNotifyCacheChangeOptions,
  type MemoOptions,
  type MemoReturn,
  type OnMemoCacheHandler
};

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
 * @property {OnMemoCacheHandler<TReturn>} [onCacheExpire] Callback when cache expires. Only fires when the `expire` option is set.
 * @property {OnMemoCacheHandler<TReturn>} [onCacheRollout] Callback when cache entries are rolled off due to cache limit.
 */
interface MemoOptions<TReturn = unknown> {
  cacheErrors?: boolean;
  cacheLimit?: number;
  debug?: MemoDebugHandler<TReturn>;
  expire?: number;
  keyHash?: (args: unknown[]) => unknown;
  onCacheExpire?: OnMemoCacheHandler<TReturn>;
  onCacheRollout?: OnMemoCacheHandler<TReturn>;
}

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
    onCacheExpire,
    onCacheRollout
  }: MemoOptions<TReturn> = {}
): (...args: TArgs) => TReturn => {
  const isCacheErrors = Boolean(cacheErrors);
  const isFuncPromise = isPromise(func);
  const isOnCacheExpirePromise = isPromise(onCacheExpire);
  const isOnCacheExpire = typeof onCacheExpire === 'function' || isOnCacheExpirePromise;
  const isOnCacheRolloutPromise = isPromise(onCacheRollout);
  const isOnCacheRollout = typeof onCacheRollout === 'function' || isOnCacheRolloutPromise;
  const updatedExpire = Number.parseInt(String(expire), 10) || undefined;

  const ized = function () {
    const cache: MemoCache<TReturn> = [];
    let timeout: NodeJS.Timeout | undefined;

    return (...args: TArgs): TReturn => {
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

            const cacheEntries = { remaining: [], removed: allCacheEntries, all: allCacheEntries };

            if (isOnCacheExpirePromise) {
              Promise.resolve(onCacheExpire?.(cacheEntries)).catch(error => log.error('onCacheExpire handler error', error));
            } else {
              try {
                onCacheExpire?.(cacheEntries);
              } catch (error) {
                log.error('Memoized function error (uncached)', error);
              }
            }
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

      const key = keyHash(args);

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
              const cacheEntries = { remaining: remainingCacheEntries, removed: removedCacheEntries, all: allCacheEntries };

              if (isOnCacheRolloutPromise) {
                Promise.resolve(onCacheRollout?.(cacheEntries)).catch(error => log.error('onCacheRollout handler error', error));
              } else {
                try {
                  onCacheRollout?.(cacheEntries);
                } catch (error) {
                  log.error('Memoized function error (rolled out)', error);
                }
              }
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
  };

  return ized();
};

export { memo, type MemoCacheHandlerResponse, type MemoDebugHandler, type MemoCache, type OnMemoCacheHandler, type MemoOptions };

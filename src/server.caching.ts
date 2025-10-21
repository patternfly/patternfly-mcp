import { generateHash, isPromise } from './server.helpers';

/**
 * Simple argument-based memoize with adjustable cache limit, and extendable cache expire.
 * apidoc-mock: https://github.com/cdcabrera/apidoc-mock.git
 *
 * - `Zero-arg caching`: Zero-argument calls are memoized. To disable caching and perform a manual reset on every call, set cacheLimit <= 0.
 * - `Expiration`: Expiration expands until a pause in use happens. All results, regardless of type, will be expired.
 * - `Promises`: Allows for promises and promise-like functions
 * - `Errors`: It's on the consumer to catch function errors and await or process a Promise resolve/reject/catch.
 *
 * @param {Function} func - A function or promise/promise-like function to memoize
 * @param {object} [options] - Configuration options
 * @param {boolean} [options.cacheErrors] - Memoize errors, or don't (default: true)
 * @param {number} [options.cacheLimit] - Number of entries to cache before overwriting previous entries (default: 1)
 * @param {Function} [options.debug] - Debug callback function (default: Function.prototype)
 * @param {number} [options.expire] - Expandable milliseconds until cache expires
 * @returns {Function} Memoized function
 */
const memo = <TArgs extends any[], TReturn>(
  func: (...args: TArgs) => TReturn,
  {
    cacheErrors = true,
    cacheLimit = 1,
    debug = () => {},
    expire
  }: {
    cacheErrors?: boolean;
    cacheLimit?: number;
    debug?: (info: { type: string; value: unknown; cache: unknown[] }) => void;
    expire?: number;
  } = {}
): (...args: TArgs) => TReturn => {
  const isCacheErrors = Boolean(cacheErrors);
  const isFuncPromise = isPromise(func);
  const updatedExpire = Number.parseInt(String(expire), 10) || undefined;

  const ized = function () {
    const cache: any[] = [];
    let timeout: NodeJS.Timeout | undefined;

    return (...args: TArgs): TReturn => {
      const isMemo = cacheLimit > 0;

      if (typeof updatedExpire === 'number') {
        clearTimeout(timeout);

        timeout = setTimeout(() => {
          cache.length = 0;
        }, updatedExpire);
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

      const key = generateHash(args);

      // Parse, memoize and return the original value
      if (cache.indexOf(key) < 0) {
        if (isFuncPromise) {
          const promiseResolve = Promise
            .resolve(func.call(null, ...args))
            .catch((error: any) => {
              const promiseKeyIndex = cache.indexOf(key);

              if (isCacheErrors === false && promiseKeyIndex >= 0) {
                cache.splice(promiseKeyIndex, 2);
              }

              return Promise.reject(error);
            });

          cache.unshift(key, promiseResolve);
        } else {
          try {
            cache.unshift(key, func.call(null, ...args));
          } catch (error) {
            const errorFunc = () => {
              throw error;
            };

            (errorFunc as any).isError = true;
            cache.unshift(key, errorFunc);
          }
        }

        // Run after cache update to trim
        if (isMemo) {
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

export { memo };

import { AsyncLocalStorage } from 'node:async_hooks';
import { type GlobalOptions } from './options';
import { DEFAULT_OPTIONS } from './options.defaults';

/**
 * AsyncLocalStorage instance for per-instance options
 *
 * Each server instance gets its own isolated options context, allowing multiple
 * instances to run with different options without conflicts.
 */
const optionsContext = new AsyncLocalStorage<GlobalOptions>();

/**
 * Set and freeze cloned options in the current async context.
 *
 * @param {Partial<GlobalOptions>} options - Options to set in context (merged with DEFAULT_OPTIONS)
 * @returns {GlobalOptions} Cloned frozen options object
 */
const setOptions = (options: Partial<GlobalOptions>): GlobalOptions => {
  const merged = { ...DEFAULT_OPTIONS, ...options } as GlobalOptions;
  const frozen = Object.freeze(structuredClone(merged));

  optionsContext.enterWith(frozen);

  return frozen;
};

/**
 * Get current context options or set a new context with defaults and
 * fallback to an empty object.
 *
 * This should always return a valid object. In normal operations,
 * the context should be set before any code runs, but we provide a
 * fallback for safety.
 *
 * @returns {GlobalOptions} Current options from context or defaults
 */
const getOptions = (): GlobalOptions => {
  const context = optionsContext.getStore();

  if (context) {
    return context;
  }

  return setOptions({});
};

/**
 * Run a function with specific options context. Useful for testing or programmatic usage.
 *
 * @param options - Options to use in context
 * @param callback - Function to apply options context against
 * @returns {Promise<T>} Result of function
 */
const runWithOptions = async <T>(
  options: GlobalOptions,
  callback: () => Promise<T>
): Promise<T> => {
  const frozen = Object.freeze(structuredClone(options));

  return optionsContext.run(frozen, callback);
};

export { getOptions, optionsContext, runWithOptions, setOptions };


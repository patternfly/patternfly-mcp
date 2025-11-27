import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { type GlobalOptions } from './options';
import { DEFAULT_OPTIONS, type LoggingSession, type DefaultOptions } from './options.defaults';

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
 * - Applies a unique session ID and logging channel name
 *
 * @param {Partial<DefaultOptions>} [options] - Optional options to set in context. Merged with DEFAULT_OPTIONS.
 * @returns {GlobalOptions} Cloned frozen default options object with session.
 */
const setOptions = (options?: Partial<DefaultOptions>): GlobalOptions => {
  const base = { ...DEFAULT_OPTIONS, ...options } as DefaultOptions;
  const sessionId = (process.env.NODE_ENV === 'local' && '1234d567-1ce9-123d-1413-a1234e56c789') || randomUUID();
  const channelName = `${base.logging.baseName}:${sessionId}`;
  const loggingSession: LoggingSession = { ...base.logging, channelName };
  const merged = { ...base, sessionId, logging: loggingSession } as unknown as GlobalOptions;
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
 * Get logging options from the current context.
 *
 * @returns {LoggingSession} Logging options from context.
 */
const getLoggerOptions = (): LoggingSession => getOptions().logging;

/**
 * Run a function with specific options context. Useful for testing or programmatic usage.
 *
 * @param options - Options to use in context
 * @param callback - Function to apply options context against
 * @returns Result of function
 */
const runWithOptions = async <TReturn=unknown>(
  options: GlobalOptions,
  callback: () => TReturn | Promise<TReturn>
) => {
  const frozen = Object.freeze(structuredClone(options));

  return optionsContext.run(frozen, callback);
};

export { getOptions, getLoggerOptions, optionsContext, runWithOptions, setOptions };


import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { type GlobalOptions } from './options';
import { DEFAULT_OPTIONS, LOG_BASENAME, type LoggingSession, type DefaultOptions } from './options.defaults';
import { mergeObjects, freezeObject, isPlainObject } from './server.helpers';

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
 * - Certain settings are not allowed to be overridden by the caller to ensure consistency across instances
 *
 * @param {Partial<DefaultOptions>} [options] - Optional options to set in context. Merged with DEFAULT_OPTIONS.
 * @returns {GlobalOptions} Cloned frozen default options object with session.
 */
const setOptions = (options?: Partial<DefaultOptions>): GlobalOptions => {
  const base = mergeObjects(DEFAULT_OPTIONS, options, { allowNullValues: false, allowUndefinedValues: false });
  const sessionId = (process.env.NODE_ENV === 'local' && '1234d567-1ce9-123d-1413-a1234e56c789') || randomUUID();

  const baseLogging = isPlainObject(base.logging) ? base.logging : DEFAULT_OPTIONS.logging;
  const baseName = LOG_BASENAME;
  const channelName = `${baseName}:${sessionId}`;
  const merged: GlobalOptions = {
    ...base,
    sessionId,
    logging: {
      level: baseLogging.level,
      stderr: baseLogging.stderr,
      protocol: baseLogging.protocol,
      transport: baseLogging.transport,
      baseName,
      channelName
    },
    resourceMemoOptions: DEFAULT_OPTIONS.resourceMemoOptions,
    toolMemoOptions: DEFAULT_OPTIONS.toolMemoOptions
  };

  const frozen = freezeObject(structuredClone(merged));

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
  const frozen = freezeObject(structuredClone(options));

  return optionsContext.run(frozen, callback);
};

export { getOptions, getLoggerOptions, optionsContext, runWithOptions, setOptions };


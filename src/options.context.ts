import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { type Session, type GlobalOptions } from './options';
import { DEFAULT_OPTIONS, LOG_BASENAME, type LoggingSession, type DefaultOptions } from './options.defaults';
import { mergeObjects, freezeObject, isPlainObject } from './server.helpers';

/**
 * AsyncLocalStorage instance for a per-instance session state.
 *
 * The `sessionContext` allows sharing a common context without explicitly
 * passing it as a parameter.
 */
const sessionContext = new AsyncLocalStorage<Session>();

/**
 * Initialize and return session data.
 *
 * @returns {Session} Immutable session with a session ID and channel name.
 */
const initializeSession = (): Session => {
  const sessionId = (process.env.NODE_ENV === 'local' && '1234d567-1ce9-123d-1413-a1234e56c789') || randomUUID();
  const channelName = `${LOG_BASENAME}:${sessionId}`;

  return freezeObject({ sessionId, channelName });
};

/**
 * Set and return the current session options.
 *
 * @param {Session} [session]
 * @returns {Session}
 */
const setSessionOptions = (session: Session = initializeSession()) => {
  sessionContext.enterWith(session);

  return session;
};

/**
 * Get the current session options or set a new session with defaults.
 */
const getSessionOptions = (): Session => sessionContext.getStore() || setSessionOptions();

const runWithSession = async <TReturn>(
  session: Session,
  callback: () => TReturn | Promise<TReturn>
) => {
  const frozen = freezeObject(structuredClone(session));

  return sessionContext.run(frozen, callback);
};

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
 * @param {Partial<DefaultOptions>} [options] - Optional options to set in context. Merged with DEFAULT_OPTIONS.
 * @returns {GlobalOptions} Cloned frozen default options object with session.
 */
const setOptions = (options?: Partial<DefaultOptions>): GlobalOptions => {
  const base = mergeObjects(DEFAULT_OPTIONS, options, { allowNullValues: false, allowUndefinedValues: false });
  const baseLogging = isPlainObject(base.logging) ? base.logging : DEFAULT_OPTIONS.logging;
  const merged: GlobalOptions = {
    ...base,
    logging: {
      level: baseLogging.level,
      logger: baseLogging.logger,
      stderr: baseLogging.stderr,
      protocol: baseLogging.protocol,
      transport: baseLogging.transport
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
const getOptions = (): GlobalOptions => optionsContext.getStore() || setOptions();

/**
 * Get logging options from the current context.
 *
 * @param {Session} [session] - Session options to use in context.
 * @returns {LoggingSession} Logging options from context.
 */
const getLoggerOptions = (session = getSessionOptions()): LoggingSession => {
  const base = getOptions().logging;

  return { ...base, channelName: session.channelName };
};

/**
 * Run a function with specific options context. Useful for testing or programmatic usage.
 *
 * @template TReturn
 * @param options - Options to use in context
 * @param callback - Function to apply options context against
 * @returns Result of function
 */
const runWithOptions = async <TReturn>(
  options: GlobalOptions,
  callback: () => TReturn | Promise<TReturn>
) => {
  const frozen = freezeObject(structuredClone(options));

  return optionsContext.run(frozen, callback);
};

export {
  getLoggerOptions,
  getOptions,
  getSessionOptions,
  initializeSession,
  optionsContext,
  runWithOptions,
  runWithSession,
  sessionContext,
  setOptions,
  setSessionOptions
};


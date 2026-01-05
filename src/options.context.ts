import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { type AppSession, type GlobalOptions, type DefaultOptionsOverrides } from './options';
import { DEFAULT_OPTIONS, LOG_BASENAME, type LoggingSession, type StatsSession } from './options.defaults';
import { mergeObjects, freezeObject, isPlainObject, hashCode } from './server.helpers';

/**
 * AsyncLocalStorage instance for a per-instance session state.
 *
 * The `sessionContext` allows sharing a common context without explicitly
 * passing it as a parameter.
 */
const sessionContext = new AsyncLocalStorage<AppSession>();

/**
 * Generates a consistent, one-way hash of the sessionId for public exposure.
 *
 * @param sessionId
 */
const getPublicSessionHash = (sessionId: string): string =>
  hashCode(sessionId, { algorithm: 'sha256', encoding: 'hex' }).substring(0, 12);

/**
 * Initialize and return session data.
 *
 * @returns {AppSession} Immutable session with a session ID and channel name.
 */
const initializeSession = (): AppSession => {
  const sessionId = (process.env.NODE_ENV === 'local' && '1234d567-1ce9-123d-1413-a1234e56c789') || randomUUID();
  const channelName = `${LOG_BASENAME}:${sessionId}`;
  const publicSessionId = getPublicSessionHash(sessionId);

  return freezeObject({ sessionId, channelName, publicSessionId });
};

/**
 * Set and return the current session options.
 *
 * @param {AppSession} [session]
 * @returns {AppSession}
 */
const setSessionOptions = (session: AppSession = initializeSession()) => {
  sessionContext.enterWith(session);

  return session;
};

/**
 * Get the current session options or set a new session with defaults.
 */
const getSessionOptions = (): AppSession => sessionContext.getStore() || setSessionOptions();

const runWithSession = async <TReturn>(
  session: AppSession,
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
 * @note Look at adding a re-validation helper here, and potentially in `runWithOptions`, that aligns with
 * CLI options parsing. We need to account for both CLI and programmatic use.
 *
 * @param {DefaultOptionsOverrides} [options] - Optional overrides merged with DEFAULT_OPTIONS.
 * @returns {GlobalOptions} Cloned frozen default options object with session.
 */
const setOptions = (options?: DefaultOptionsOverrides): GlobalOptions => {
  const base = mergeObjects(DEFAULT_OPTIONS, options, { allowNullValues: false, allowUndefinedValues: false });
  const baseLogging = isPlainObject(base.logging) ? base.logging : DEFAULT_OPTIONS.logging;
  const basePluginIsolation = ['strict', 'none'].includes(base.pluginIsolation) ? base.pluginIsolation : DEFAULT_OPTIONS.pluginIsolation;

  const merged: GlobalOptions = {
    ...base,
    logging: {
      level: ['debug', 'info', 'warn', 'error'].includes(baseLogging.level) ? baseLogging.level : DEFAULT_OPTIONS.logging.level,
      logger: baseLogging.logger,
      stderr: baseLogging.stderr,
      protocol: baseLogging.protocol,
      transport: ['stdio', 'mcp'].includes(baseLogging.transport) ? baseLogging.transport : DEFAULT_OPTIONS.logging.transport
    },
    pluginIsolation: basePluginIsolation,
    resourceMemoOptions: DEFAULT_OPTIONS.resourceMemoOptions,
    toolMemoOptions: DEFAULT_OPTIONS.toolMemoOptions
  };

  // Avoid cloning toolModules
  const originalToolModules = Array.isArray(merged.toolModules) ? merged.toolModules : [];
  const cloned = structuredClone({ ...merged, toolModules: [] as unknown[] });
  const restoreOriginalToolModules: GlobalOptions = { ...cloned, toolModules: originalToolModules } as GlobalOptions;
  const frozen = freezeObject(restoreOriginalToolModules);

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
 * @param {AppSession} [session] - Session options to use in context.
 * @returns {LoggingSession} Logging options from context.
 */
const getLoggerOptions = (session = getSessionOptions()): LoggingSession => {
  const base = getOptions().logging;

  return { ...base, channelName: session.channelName };
};

/**
 * Get stat channel options from the current context.
 *
 * @param {AppSession} [options] - Session options to use in context.
 * @returns {StatsSession} Stats options from context.
 */
const getStatsOptions = (options = getSessionOptions()): StatsSession => {
  const base = getOptions().stats;
  const publicSessionId = options.publicSessionId;
  const health = `pf-mcp:stats:health:${publicSessionId}`;
  const session = `pf-mcp:stats:session:${publicSessionId}`;
  const transport = `pf-mcp:stats:transport:${publicSessionId}`;
  const traffic = `pf-mcp:stats:traffic:${publicSessionId}`;
  const channels = { health, transport, traffic, session };

  return { ...base, publicSessionId, channels };
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
  // Avoid cloning toolModules
  const originalToolModules = Array.isArray((options as any).toolModules) ? (options as any).toolModules : [];
  const cloned = structuredClone({ ...(options as any), toolModules: [] as unknown[] });
  const restoreOriginalToolModules = { ...cloned, toolModules: originalToolModules } as GlobalOptions;
  const frozen = freezeObject(restoreOriginalToolModules);

  return optionsContext.run(frozen, callback);
};

export {
  getLoggerOptions,
  getOptions,
  getPublicSessionHash,
  getSessionOptions,
  getStatsOptions,
  initializeSession,
  optionsContext,
  runWithOptions,
  runWithSession,
  sessionContext,
  setOptions,
  setSessionOptions
};


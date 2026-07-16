import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import {
  EXPERIMENTAL_OPTIONS,
  type AppSession,
  type ExperimentalOptionKey,
  type GlobalOptions,
  type ProgrammaticOptions
} from './options';
import {
  DEFAULT_OPTIONS,
  CHANNEL_BASENAME,
  MODE_LEVELS,
  PLUGIN_ISOLATION,
  type LoggingSession,
  type StatsSession
} from './options.defaults';
import { mergeObjects, freezeObject, isPlainObject, hashCode } from './server.helpers';
import { assertProtocol } from './options.assertions';

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
 * @note Potential breaking change: Channel names now include `mode`. Consumers
 * who leverage the logging callback, from server core, remain unaffected.
 *
 * @returns {AppSession} Immutable session with a session ID and channel name.
 */
const initializeSession = (): AppSession => {
  const { mode } = getOptions();
  const sessionId = (process.env.NODE_ENV === 'local' && '1234d567-1ce9-123d-1413-a1234e56c789') || randomUUID();
  const channelName = `${CHANNEL_BASENAME}:${mode}:log:${sessionId}`;
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
 * @note This function performs a two-stage configuration setup:
 * 1. Structural Merge: `mergeObjects` handles initial deep merging and filters out null/undefined.
 * 2. Runtime Guards & Policy Enforcement: Explicit redeclarations act as guards to:
 *    - Validate values against allowed sets (e.g., MODE_LEVELS).
 *    - Ensure structural integrity for nested objects (e.g., `logging`) if malformed inputs are passed.
 *    - Enforce internal invariants (like memoization limits) that are strictly non-overridable.
 *
 * @note When to add a redeclaration (guard):
 * Add a property to the `merged` object redeclaration list if it meets any of these criteria:
 * - Choice-based: It is an enum or string-literal type that must match a specific set of values.
 * - Deeply Nested: It belongs to an object branch that programmatic users might accidentally
 *   overwrite with a non-object value (e.g. `logging: "none"`).
 * - Invariant: It represents a performance or stability limit (like cache TTLs) that the
 *   server must control internally to prevent leaks.
 * - Parity: It is already sanitized in `parseCliOptions` and needs matching protection
 *   for programmatic consumers.
 *
 * @note In the future, look at adding a re-validation helper here, and potentially in `runWithOptions`,
 * that aligns with CLI options parsing. We need to account for both CLI and programmatic use.
 *
 * @param [options] - Consumer optional overrides to be merged with DEFAULT_OPTIONS.
 * @param [settings] - Function settings
 * @param [settings.experimentalOptions] - Available experimental options list for comparison and filtering.
 * @returns {GlobalOptions} Cloned frozen default options object with session.
 */
const setOptions = (
  options?: ProgrammaticOptions & { experimental?: string[] },
  {
    experimentalOptions = EXPERIMENTAL_OPTIONS
  }: { experimentalOptions?: Set<ExperimentalOptionKey> } = {}
): GlobalOptions => {
  const base = mergeObjects(DEFAULT_OPTIONS as GlobalOptions, options, { allowNullValues: false, allowUndefinedValues: false });

  assertProtocol(base.whitelist.urls, base.whitelist.protocols);

  const baseLogging = isPlainObject(base.logging) ? base.logging : DEFAULT_OPTIONS.logging;
  const basePluginIsolation = PLUGIN_ISOLATION.includes(base.pluginIsolation) ? base.pluginIsolation : DEFAULT_OPTIONS.pluginIsolation;

  const baseExperimental = base.experimental.filter(
    option => experimentalOptions.has(option as ExperimentalOptionKey) &&
      base[option as ExperimentalOptionKey] !== (DEFAULT_OPTIONS as unknown as Record<string, unknown>)[option]
  );

  const merged: GlobalOptions = {
    ...base,
    experimental: baseExperimental,
    mode: MODE_LEVELS.includes(base.mode) ? base.mode : DEFAULT_OPTIONS.mode,
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
 * @note Potential breaking change: Channel names now include `mode`. Consumers
 * who leverage the stat's callback, from server core, remain unaffected.
 *
 * @param {AppSession} [options] - Session options to use in context.
 * @returns {StatsSession} Stats options from context.
 */
const getStatsOptions = (options = getSessionOptions()): StatsSession => {
  const { stats: base, mode } = getOptions();
  const publicSessionId = options.publicSessionId;
  const channel = (type: string) => `${CHANNEL_BASENAME}:${mode}:stats:${type}:${publicSessionId}`;

  const channels = {
    health: channel('health'),
    transport: channel('transport'),
    traffic: channel('traffic'),
    session: channel('session')
  };

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


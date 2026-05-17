import {
  DEFAULT_OPTIONS,
  MODE_LEVELS,
  PLUGIN_ISOLATION,
  type DefaultOptions,
  type DefaultOptionsOverrides,
  type LoggingOptions,
  type HttpOptions,
  type ModeOptions
} from './options.defaults';
import { type LogLevel, logSeverity } from './logger';
import { isUrl, portValid } from './server.helpers';

/**
 * Session defaults, not user-configurable
 */
type AppSession = {
  readonly sessionId: string;
  readonly publicSessionId: string;
  readonly channelName: string
};

/**
 * Global options, convenience type for `DefaultOptions`
 */
type GlobalOptions = DefaultOptions;

/**
 * Options parsed from CLI arguments
 *
 * @note `pluginIsolation` preset for external plugins (CLI-provided). If omitted, defaults
 * to 'strict' when external tools are requested, otherwise 'none'.
 */
type CliOptions = {
  mode?: DefaultOptions['mode'];
  modeOptions?: Partial<ModeOptions>;
  http?: Partial<HttpOptions>;
  isHttp: boolean;
  logging: Partial<LoggingOptions>;
  toolModules: string[];
  pluginIsolation: DefaultOptions['pluginIsolation'] | undefined;
};

/**
 * Get argument value from argv (defaults to `process.argv`).
 *
 * @param flag - CLI flag to search for
 * @param [options] - Options
 * @param [options.defaultValue] - Default arg value
 * @param [options.argv] - Command-line arguments to parse. Defaults to `process.argv`.
 */
const getArgValue = (flag: string, { defaultValue, argv = process.argv }: { defaultValue?: unknown, argv?: string[] } = {}) => {
  const index = argv.indexOf(flag);

  if (index === -1) {
    return defaultValue;
  }

  const value = argv[index + 1];

  if (!value || value.startsWith('-')) {
    return defaultValue;
  }

  if (typeof defaultValue === 'number') {
    const num = parseInt(value, 10);

    if (isNaN(num)) {
      return defaultValue;
    }

    return num;
  }

  return value;
};

/**
 * Parse CLI configuration options.
 * - Parses `process.argv` options
 *
 * Available options:
 * - `--mode <mode>`: Specifies the mode of operation. Valid values are `cli`, `programmatic`, and `test`.
 * - `--mode-test-url`: Specifies the base URL for testing mode.
 * - `--log-level <level>`: Specifies the logging level. Valid values are `debug`, `info`, `warn`, and `error`.
 * - `--verbose`: Log all severity levels. Shortcut to set the logging level to `debug`.
 * - `--log-stderr`: Enables terminal logging of channel events
 * - `--log-protocol`: Enables MCP protocol logging. Forward server logs to MCP clients (requires advertising `capabilities.logging`).
 * - `--http`: Indicates if the `--http` option is enabled.
 * - `--port`: The port number specified via `--port`
 * - `--host`: The host name specified via `--host`
 * - `--allowed-origins`: List of allowed origins derived from the `--allowed-origins` parameter, split by commas, or undefined if not provided.
 * - `--allowed-hosts`: List of allowed hosts derived from the `--allowed-hosts` parameter, split by commas, or undefined if not provided.
 * - `--plugin-isolation <none|strict>`: Isolation preset for external tools-as-plugins.
 * - `--tool <tool-spec>`: Either a repeatable single tool-as-plugin specification or a comma-separated list of tool-as-plugin specifications. Each tool-as-plugin
 *     specification is a local module name or path.
 *
 * @note Review removing `programmatic` mode from this function path.
 *
 * @param [argv] - User-defined CLI configuration options (overrides).
 * @returns An object with parsed command-line options and used experimental options.
 */
const parseCliOptions = (argv: string[] = process.argv): CliOptions => {
  const modeIndex = argv.indexOf('--mode');
  const modeTestUrl = argv.indexOf('--mode-test-url');
  const modeOptions: ModeOptions = {
    ...DEFAULT_OPTIONS.modeOptions
  };
  const levelIndex = argv.indexOf('--log-level');
  const logging: LoggingOptions = {
    ...DEFAULT_OPTIONS.logging,
    stderr: argv.includes('--log-stderr'),
    protocol: argv.includes('--log-protocol')
  };

  let mode: CliOptions['mode'] | undefined;

  if (modeIndex >= 0) {
    const maybeMode = String(argv[modeIndex + 1] || '').toLowerCase();

    if (MODE_LEVELS.includes(maybeMode as DefaultOptions['mode'])) {
      mode = argv[modeIndex + 1] as DefaultOptions['mode'];
    }
  }

  if (modeTestUrl >= 0) {
    const maybeBaseUrl = String(argv[modeTestUrl + 1] || '').trim();

    if (isUrl(maybeBaseUrl)) {
      modeOptions.test ??= {};
      modeOptions.test.baseUrl = maybeBaseUrl;
    }
  }

  if (argv.includes('--verbose')) {
    logging.level = 'debug';
  } else if (levelIndex >= 0) {
    const maybeLevel = String(argv[levelIndex + 1] || '').toLowerCase();

    if (logSeverity(maybeLevel as LogLevel) > -1) {
      logging.level = maybeLevel as LoggingOptions['level'];
    }
  }

  const isHttp = argv.includes('--http');
  const http: Partial<HttpOptions> = {};

  if (isHttp) {
    const rawPort = getArgValue('--port', { argv });
    const parsedPort = portValid(rawPort);
    const host = getArgValue('--host', { argv });

    const allowedOrigins = (getArgValue('--allowed-origins', { argv }) as string)
      ?.split(',')
      ?.map((origin: string) => origin.trim())
      ?.filter(Boolean);

    const allowedHosts = (getArgValue('--allowed-hosts', { argv }) as string)
      ?.split(',')
      ?.map((host: string) => host.trim())
      ?.filter(Boolean);

    const port = parsedPort;

    if (port !== undefined) {
      http.port = port;
    }

    if (typeof host === 'string') {
      http.host = host;
    }

    if (Array.isArray(allowedHosts) && allowedHosts.length) {
      http.allowedHosts = allowedHosts;
    }

    if (Array.isArray(allowedOrigins) && allowedOrigins.length) {
      http.allowedOrigins = allowedOrigins;
    }
  }

  // Parse external tool modules: single canonical flag `--tool`
  // Supported forms:
  //   --tool a --tool b      (repeatable)
  //   --tool a,b             (comma-separated)
  const toolModules: string[] = [];
  const seenSpecs = new Set<string>();

  const addSpec = (spec?: string) => {
    const trimmed = String(spec || '').trim();

    if (!trimmed || seenSpecs.has(trimmed)) {
      return;
    }

    seenSpecs.add(trimmed);
    toolModules.push(trimmed);
  };

  for (let argIndex = 0; argIndex < argv.length; argIndex += 1) {
    const token = argv[argIndex];
    const next = argv[argIndex + 1];

    if (token === '--tool' && typeof next === 'string' && !next.startsWith('-')) {
      next
        .split(',')
        .map(value => value.trim())
        .filter(Boolean)
        .forEach(addSpec);

      argIndex += 1;
    }
  }

  // Parse isolation preset: --plugin-isolation <none|strict>
  let pluginIsolation: CliOptions['pluginIsolation'];// = DEFAULT_OPTIONS.pluginIsolation;
  const isolationIndex = argv.indexOf('--plugin-isolation');

  if (isolationIndex >= 0) {
    const maybePluginIsolation = String(argv[isolationIndex + 1] || '').toLowerCase();

    if (PLUGIN_ISOLATION.includes(maybePluginIsolation as DefaultOptions['pluginIsolation'])) {
      pluginIsolation = maybePluginIsolation as DefaultOptions['pluginIsolation'];
    }
  }

  return {
    ...(mode ? { mode } : {}),
    modeOptions,
    logging,
    isHttp,
    http,
    toolModules,
    pluginIsolation
  };
};

export {
  parseCliOptions,
  getArgValue,
  type AppSession,
  type CliOptions,
  type DefaultOptions,
  type DefaultOptionsOverrides,
  type GlobalOptions,
  type HttpOptions,
  type LoggingOptions
};

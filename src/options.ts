import { DEFAULT_OPTIONS, type DefaultOptions, type DefaultOptionsOverrides, type LoggingOptions, type HttpOptions } from './options.defaults';
import { type LogLevel, logSeverity } from './logger';

/**
 * Session defaults, not user-configurable
 */
type AppSession = {
  readonly sessionId: string;
  readonly channelName: string
};

/**
 * Global options, convenience type for `DefaultOptions`
 */
type GlobalOptions = DefaultOptions;

/**
 * Options parsed from CLI arguments
 */
type CliOptions = {
  docsHost: boolean;
  http?: Partial<HttpOptions>;
  isHttp: boolean;
  logging: Partial<LoggingOptions>;
  toolModules: string[];

  /**
   * Isolation preset for external plugins (CLI-provided). If omitted, defaults
   * to 'strict' when external tools are requested, otherwise 'none'.
   */
  pluginIsolation: 'none' | 'strict' | undefined;
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
 * Parses CLI options and return config options for the application.
 *
 * Available options:
 * - `--docs-host`: A flag indicating whether the documentation host should be enabled.
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
 * @param [argv] - Command-line arguments to parse. Defaults to `process.argv`.
 * @returns Parsed command-line options.
 */
const parseCliOptions = (argv: string[] = process.argv): CliOptions => {
  const docsHost = argv.includes('--docs-host');
  const levelIndex = argv.indexOf('--log-level');
  const logging: LoggingOptions = {
    ...DEFAULT_OPTIONS.logging,
    stderr: argv.includes('--log-stderr'),
    protocol: argv.includes('--log-protocol')
  };

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
    const parsedPort = Number.parseInt(String(rawPort || ''), 10);
    const host = getArgValue('--host', { argv });

    const allowedOrigins = (getArgValue('--allowed-origins', { argv }) as string)
      ?.split(',')
      ?.map((origin: string) => origin.trim())
      ?.filter(Boolean);

    const allowedHosts = (getArgValue('--allowed-hosts', { argv }) as string)
      ?.split(',')
      ?.map((host: string) => host.trim())
      ?.filter(Boolean);

    const isPortValid = Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort < 65536;
    const port = isPortValid ? parsedPort : undefined;

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
    const val = String(argv[isolationIndex + 1] || '').toLowerCase();

    switch (val) {
      case 'none':
      case 'strict':
        pluginIsolation = val;
    }
  }

  return {
    docsHost,
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

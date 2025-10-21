import { DEFAULT_OPTIONS, type DefaultOptions, type LoggingOptions, type HttpOptions } from './options.defaults';
import { type LogLevel, logSeverity } from './logger';

/**
 * Session defaults, not user-configurable
 */
type Session = {
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
  http: HttpOptions | undefined;
  isHttp: boolean;
  logging: LoggingOptions;
};

/**
 * Get argument value from process.argv
 *
 * @param flag - CLI flag to search for
 * @param defaultValue - Default arg value
 */
const getArgValue = (flag: string, defaultValue?: unknown) => {
  const index = process.argv.indexOf(flag);

  if (index === -1) {
    return defaultValue;
  }

  const value = process.argv[index + 1];

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
 * - `--log-level <level>`: Specifies the logging level. Valid values are `debug`, `info`, `warn`, and `error`. Defaults to `info`.
 * - `--verbose`: Log all severity levels. Shortcut to set the logging level to `debug`.
 * - `--log-stderr`: Enables terminal logging of channel events
 * - `--log-protocol`: Enables MCP protocol logging. Forward server logs to MCP clients (requires advertising `capabilities.logging`).
 * - `--http`: Indicates if the `--http` option is enabled.
 * - `--port`: The port number specified via `--port`, or defaults to `3000` if not provided.
 * - `--host`: The host name specified via `--host`, or defaults to `'127.0.0.1'` if not provided.
 * - `--allowed-origins`: List of allowed origins derived from the `--allowed-origins` parameter, split by commas, or undefined if not provided.
 * - `--allowed-hosts`: List of allowed hosts derived from the `--allowed-hosts` parameter, split by commas, or undefined if not provided.
 *
 * @param argv - Command-line arguments to parse. Defaults to `process.argv`.
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
  let http: HttpOptions | undefined;

  if (isHttp) {
    let port = getArgValue('--port');
    const host = getArgValue('--host');
    const allowedOrigins = (getArgValue('--allowed-origins') as string)?.split(',')?.filter((origin: string) => origin.trim());
    const allowedHosts = (getArgValue('--allowed-hosts') as string)?.split(',')?.filter((host: string) => host.trim());

    const isPortValid = (typeof port === 'number') && (port > 0 && port < 65536);

    port = isPortValid ? port : undefined;

    http = {
      port,
      host,
      allowedHosts,
      allowedOrigins
    } as HttpOptions;
  }

  return { docsHost, logging, isHttp, http };
};

export {
  parseCliOptions,
  getArgValue,
  type CliOptions,
  type DefaultOptions,
  type GlobalOptions,
  type HttpOptions,
  type LoggingOptions,
  type Session
};

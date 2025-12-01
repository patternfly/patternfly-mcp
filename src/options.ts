import { DEFAULT_OPTIONS, type DefaultOptions, type DefaultSession, type LoggingOptions } from './options.defaults';
import { type LogLevel, logSeverity } from './logger';

/**
 * Combined options object
 */
type GlobalOptions = DefaultSession;

/**
 * Options parsed from CLI arguments
 */
type CliOptions = { docsHost: boolean; logging: LoggingOptions };

/**
 * Parses CLI options and return config options for the application.
 *
 * Available options:
 * - `--docs-host`: A flag indicating whether the documentation host should be enabled.
 * - `--log-level <level>`: Specifies the logging level. Valid values are `debug`, `info`, `warn`, and `error`. Defaults to `info`.
 * - `--verbose`: Log all severity levels. Shortcut to set the logging level to `debug`.
 * - `--log-stderr`: Enables terminal logging of channel events
 * - `--log-protocol`: Enables MCP protocol logging. Forward server logs to MCP clients (requires advertising `capabilities.logging`).
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

  return { docsHost, logging };
};

export {
  parseCliOptions,
  type CliOptions,
  type LoggingOptions,
  type DefaultOptions,
  type GlobalOptions
};

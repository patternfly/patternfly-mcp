import {
  type CliOptions,
  type ExperimentalOptions,
  type ProgrammaticOptions
} from './options';
import { parseCliOptions, parseProgrammaticOptions } from './options.parser';
import { getSessionOptions, setOptions, runWithSession } from './options.context';
import {
  runServer,
  type ServerInstance,
  type ServerSettings,
  type ServerOnLog,
  type ServerOnLogHandler,
  type ServerLogEvent,
  type ServerStatReport,
  type ServerStats,
  type ServerGetStats,
  type ServerOptions
} from './server';
import {
  createMcpTool,
  type ToolCreator,
  type ToolModule,
  type ToolConfig,
  type ToolMultiConfig,
  type ToolExternalOptions,
  type ToolInternalOptions
} from './server.toolsUser';

/**
 * Server instance with shutdown capability
 *
 * Alias of {@link ServerInstance} (Internal type).
 */
type PfMcpInstance = ServerInstance;

/**
 * Subscribes a handler function, `PfMcpOnLogHandler`, to server logs. Automatically unsubscribed on server shutdown.
 *
 * Alias of {@link ServerOnLog} (Internal type).
 */
type PfMcpOnLog = ServerOnLog;

/**
 * The handler function passed by `onLog`, `PfMcpOnLog`, to subscribe to server logs. Automatically unsubscribed on server shutdown.
 *
 * Alias of {@link ServerOnLogHandler} (Internal type).
 */
type PfMcpOnLogHandler = ServerOnLogHandler;

/**
 * The log event passed to the `onLog` handler, `PfMcpOnLogHandler`.
 *
 * Alias of {@link ServerLogEvent} (Internal type).
 */
type PfMcpLogEvent = ServerLogEvent;

/**
 * Get statistics about the server.
 *
 * Alias of {@link ServerGetStats} (Internal type).
 */
type PfMcpGetStats = ServerGetStats;

/**
 * Statistics about the server.
 *
 * Alias of {@link ServerStats} (Internal type).
 */
type PfMcpStats = ServerStats;

/**
 * Statistics report about the server.
 *
 * Alias of {@link ServerStatReport} (Internal type).
 */
type PfMcpStatReport = ServerStatReport;

/**
 * Available experimental option keys (without prefixes).
 *
 * @see {@link MakeExperimental} for how these are transformed for consumers.
 */
type PfMcpExperimentalOptions = ExperimentalOptions;

/**
 * Exposed options for CLI use. A focused options interface.
 *
 * Available CLI options:
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
 * @note Type is not a 1:1 match for available options.
 * @note Experimental options appear as `--experimental-<lorem-ipsum>` when available.
 * @note Alias of {@link CliOptions} (Internal type).
 */
type PfMcpCliOptions = CliOptions;

/**
 * `CliOptions` renamed to `PfMcpCliOptions` to avoid conflicts with internal naming.
 *
 * @deprecated Use {@link PfMcpCliOptions} instead.
 */
type DeprecatedCliOptions = PfMcpCliOptions;

/**
 * Exposed options for programmatic use. A limited `DefaultOptions` interface.
 *
 * @property [docsPaths] - Local documentation search paths.
 * @property [name] - The server display name.
 * @property [http] - HTTP server options.
 * @property [isHttp] - Enable HTTP transport.
 * @property [logging] - Logging configuration.
 * @property [mode] - Specifies the mode of operation.
 * @property [modeOptions] - Options for `mode`. Currently, limited to the base URL for `test` mode.
 * @property [pluginIsolation] - Isolation preset for external tools-as-plugins.
 * @property [toolModules] - Programmatic tool registrations.
 * @property [version] - The server display version.
 *
 * @note Experimental options appear as `experimental<LoremIpsum>` when available.
 * @note Alias of {@link ProgrammaticOptions} (Internal type).
 */
type PfMcpOptions = ProgrammaticOptions;

/**
 * Additional settings for programmatic control.
 *
 * @property {boolean} allowProcessExit - Override process exits. Useful for tests
 *     or programmatic use to avoid exiting.
 *     - Setting directly overrides `mode` property defaults.
 *     - When `mode=cli` or `mode=programmatic` or `undefined`, defaults to `true`.
 *     - When `mode=test`, defaults to `false`.
 */
type PfMcpSettings = Pick<ServerSettings, 'allowProcessExit'>;

/**
 * Main function - Programmatic and CLI entry point with optional overrides
 *
 * @param [pfMcpOptions] - User configurable options
 * @param [pfMcpSettings] - MCP server settings
 *
 * @returns {Promise<PfMcpInstance>} Server-instance with shutdown capability
 *
 * @throws {Error} If `allowProcessExit` is set to `false` an error will be thrown rather than exiting
 *     the process. Server errors are noted as options or start failures.
 *
 * @example Programmatic: A MCP server with STDIO (Standard Input Output) transport.
 * import { start } from '@patternfly/patternfly-mcp';
 * const { stop, isRunning } = await start();
 *
 * if (isRunning()) {
 *   stop();
 * }
 *
 * @example Programmatic: A MCP server with HTTP transport.
 * import { start } from '@patternfly/patternfly-mcp';
 * const { stop, isRunning } = await start({ http: { port: 8000 } });
 *
 * if (isRunning()) {
 *   stop();
 * }
 *
 * @example Programmatic: Listening for server stats
 * import { subscribe, unsubscribe } from 'node:diagnostics_channel';
 * import { start, createMcpTool } from '@patternfly/patternfly-mcp';
 *
 * const { stop, isRunning, getStats } = await start();
 * const stats = await getStats();
 * const statsChannel = subscribe(stats.health.channelId, (healthStats: PfMcpHealthStats) => {
 *   stderr.write(`Health uptime: ${healthStats.uptime}\n`);
 * })
 *
 * if (isRunning()) {
 *   unsubscribe(stats.health.channelId);
 *   stop();
 * }
 *
 * @example Programmatic: A MCP server with inline tool configuration and JSON inputSchema.
 * import { start, createMcpTool } from '@patternfly/patternfly-mcp';
 *
 * const myToolModule = createMcpTool({
 *   name: 'my-tool',
 *   description: 'My tool description',
 *   inputSchema: { type: 'object', properties: {} },
 *   handler: async (args) => args
 * });
 *
 * const { stop, isRunning } = await start({ toolModules: [myToolModule] });
 *
 * if (isRunning()) {
 *   stop();
 * }
 */
const main = async (
  pfMcpOptions: PfMcpOptions = {},
  pfMcpSettings: PfMcpSettings = {}
): Promise<PfMcpInstance> => {
  const { mode: programmaticMode, ...options } = pfMcpOptions;
  const { allowProcessExit } = pfMcpSettings;

  // Check early for allowing process exits
  let updatedAllowProcessExit = allowProcessExit ?? programmaticMode !== 'test';
  let mergedOptions: ServerOptions;

  // If allowed, exit the process on error otherwise log then throw the error.
  const processExit = (message: string, error: unknown) => {
    console.error(message, error);

    if (updatedAllowProcessExit) {
      process.exit(1);
    }

    throw error;
  };

  try {
    const { options: cliOptions, experimentalOptions: cliExp } = parseCliOptions(process.argv);
    const { options: progOptions, experimentalOptions: progExp } = parseProgrammaticOptions(options);

    // Apply `mode` separately because `cli.ts` applies it programmatically. Doing this allows us to set mode through `CLI options`.
    mergedOptions = setOptions({
      ...cliOptions,
      ...progOptions,
      experimental: [...new Set([...cliExp, ...progExp])],
      mode: cliOptions.mode ?? programmaticMode
    });

    // Finalize exit policy after merging options
    updatedAllowProcessExit = allowProcessExit ?? mergedOptions.mode !== 'test';
  } catch (error) {
    processExit('Set options error, failed to start server:', error);
  }

  try {
    // Generate session options
    const session = getSessionOptions();

    // Start the server, apply session values, then apply merged options to ensure stable hashing.
    return await runWithSession(session, async () =>
      await runServer.memo(mergedOptions, { allowProcessExit: updatedAllowProcessExit }));
  } catch (error) {
    processExit('Failed to start server:', error);
  }

  // Unreachable, processExit exits or throws. Kept for type satisfaction.
  return undefined as never;
};

export {
  createMcpTool,
  main,
  main as start,
  type DeprecatedCliOptions as CliOptions,
  type PfMcpCliOptions,
  type PfMcpExperimentalOptions,
  type PfMcpOptions,
  type PfMcpSettings,
  type PfMcpInstance,
  type PfMcpLogEvent,
  type PfMcpOnLog,
  type PfMcpOnLogHandler,
  type PfMcpStatReport,
  type PfMcpStats,
  type PfMcpGetStats,
  type ToolCreator,
  type ToolModule,
  type ToolConfig,
  type ToolMultiConfig,
  type ToolExternalOptions,
  type ToolInternalOptions
};

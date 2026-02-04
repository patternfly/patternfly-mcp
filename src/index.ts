import { parseCliOptions, type CliOptions, type DefaultOptionsOverrides } from './options';
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
 * Options for "programmatic" use. Extends the `DefaultOptions` interface.
 */
type PfMcpOptions = DefaultOptionsOverrides;

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
 * Server instance with shutdown capability
 *
 * @alias ServerInstance
 */
type PfMcpInstance = ServerInstance;

/**
 * Subscribes a handler function, `PfMcpOnLogHandler`, to server logs. Automatically unsubscribed on server shutdown.
 *
 * @alias ServerOnLog
 */
type PfMcpOnLog = ServerOnLog;

/**
 * The handler function passed by `onLog`, `PfMcpOnLog`, to subscribe to server logs. Automatically unsubscribed on server shutdown.
 *
 * @alias ServerOnLogHandler
 */
type PfMcpOnLogHandler = ServerOnLogHandler;

/**
 * The log event passed to the `onLog` handler, `PfMcpOnLogHandler`.
 *
 * @alias ServerLogEvent
 */
type PfMcpLogEvent = ServerLogEvent;

/**
 * Get statistics about the server.
 *
 * @alias ServerGetStats
 */
type PfMcpGetStats = ServerGetStats;

/**
 * Statistics about the server.
 *
 * @alias ServerStats
 */
type PfMcpStats = ServerStats;

/**
 * Statistics report about the server.
 *
 * @alias ServerStatReport
 */
type PfMcpStatReport = ServerStatReport;

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
 * @example Programmatic: A MCP server with inline tool configuration.
 * import { start, createMcpTool } from '@patternfly/patternfly-mcp';
 *
 * const myToolModule = createMcpTool({
 *   name: 'my-tool',
 *   description: 'My tool description',
 *   inputSchema: {},
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

  // If allowed, exit the process on error
  const processExit = (message: string, error: unknown) => {
    console.error(message, error);

    if (updatedAllowProcessExit) {
      process.exit(1);
    }
  };

  try {
    // Parse CLI options
    const { mode: cliMode, ...cliOptions } = parseCliOptions();

    // Apply `mode` separately because `cli.ts` applies it programmatically. Doing this allows us to set mode through `CLI options`.
    mergedOptions = setOptions({ ...cliOptions, ...options, mode: cliMode ?? programmaticMode });

    // Finalize exit policy after merging options
    updatedAllowProcessExit = allowProcessExit ?? mergedOptions.mode !== 'test';
  } catch (error) {
    processExit('Set options error, failed to start server:', error);
    throw error;
  }

  try {
    // Generate session options
    const session = getSessionOptions();

    // Start the server, apply session values, then apply merged options to ensure stable hashing.
    return await runWithSession(session, async () =>
      await runServer.memo(mergedOptions, { allowProcessExit: updatedAllowProcessExit }));
  } catch (error) {
    processExit('Failed to start server:', error);
    throw error;
  }
};

export {
  createMcpTool,
  main,
  main as start,
  type CliOptions,
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

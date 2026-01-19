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
  type ServerGetStats
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
 *
 * @property {('cli' | 'programmatic' | 'test')} [mode] - Optional string property that specifies the mode of operation.
 *     Defaults to `'programmatic'`.
 *     - `'cli'`: Functionality is being executed in a cli context. Allows process exits.
 *     - `'programmatic'`: Functionality is invoked programmatically. Allows process exits.
 *     - `'test'`: Functionality is being tested. Does NOT allow process exits.
 */
type PfMcpOptions = DefaultOptionsOverrides & {
  mode?: 'cli' | 'programmatic' | 'test';
};

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
 * @throws {Error} If the server fails to start or any error occurs during initialization,
 *     and `allowProcessExit` is set to `false`, the error will be thrown rather than exiting
 *     the process.
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
  const { mode, ...options } = pfMcpOptions;
  const { allowProcessExit } = pfMcpSettings;

  const modes = ['cli', 'programmatic', 'test'];
  const updatedMode = mode && modes.includes(mode) ? mode : 'programmatic';
  const updatedAllowProcessExit = allowProcessExit ?? updatedMode !== 'test';

  try {
    const cliOptions = parseCliOptions();
    const mergedOptions = setOptions({ ...cliOptions, ...options });
    const session = getSessionOptions();

    // use runWithSession to enable session in listeners
    return await runWithSession(session, async () =>
      // `runServer` doesn't require options in the memo key, but we pass fully merged options for stable hashing
      await runServer.memo(mergedOptions, { allowProcessExit: updatedAllowProcessExit }));
  } catch (error) {
    console.error('Failed to start server:', error);

    if (updatedAllowProcessExit) {
      process.exit(1);
    } else {
      throw error;
    }
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

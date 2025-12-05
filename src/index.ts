import { parseCliOptions, type CliOptions, type DefaultOptionsOverrides } from './options';
import { getSessionOptions, setOptions, runWithSession } from './options.context';
import {
  runServer,
  type ServerInstance,
  type ServerSettings,
  type ServerOnLog,
  type ServerOnLogHandler,
  type ServerLogEvent
} from './server';

/**
 * Options for "programmatic" use. Extends the `DefaultOptions` interface.
 *
 * @interface
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
 * Main function - CLI entry point with optional programmatic overrides
 *
 * @param [pfMcpOptions] - User configurable options
 * @param [pfMcpSettings] - MCP server settings
 *
 * @returns {Promise<ServerInstance>} Server-instance with shutdown capability
 *
 * @throws {Error} If the server fails to start or any error occurs during initialization,
 *     and `allowProcessExit` is set to `false`, the error will be thrown rather than exiting
 *     the process.
 */
const main = async (
  pfMcpOptions: PfMcpOptions = {},
  pfMcpSettings: PfMcpSettings = {}
): Promise<ServerInstance> => {
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
      // `runServer` doesn't require it, but `memo` does for "uniqueness", pass in the merged options for a hashable argument
      runServer.memo(mergedOptions, { allowProcessExit: updatedAllowProcessExit }));
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
  main,
  main as start,
  type CliOptions,
  type PfMcpOptions,
  type PfMcpSettings,
  type ServerInstance,
  type ServerLogEvent,
  type ServerOnLog,
  type ServerOnLogHandler
};

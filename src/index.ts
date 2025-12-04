import { parseCliOptions, type CliOptions, type DefaultOptions } from './options';
import { setOptions } from './options.context';
import { runServer, type ServerInstance } from './server';

/**
 * Main function - CLI entry point with optional programmatic overrides
 *
 * @param programmaticOptions - Optional programmatic options that override CLI options
 * @returns {Promise<ServerInstance>} Server-instance with shutdown capability
 */
const main = async (programmaticOptions?: Partial<DefaultOptions>): Promise<ServerInstance> => {
  try {
    // Parse CLI options
    const cliOptions = parseCliOptions();

    // Apply options to context. setOptions merges with session and DEFAULT_OPTIONS internally
    setOptions({ ...cliOptions, ...programmaticOptions });

    return await runServer();
  } catch (error) {
    // Use console.error, log.error requires initialization
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

export { main, main as start, type CliOptions, type ServerInstance };

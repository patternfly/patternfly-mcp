#!/usr/bin/env node

import { freezeOptions, parseCliOptions, type CliOptions } from './options';
import { runServer, type ServerInstance } from './server';

/**
 * Main function - CLI entry point with optional programmatic overrides
 *
 * @param programmaticOptions - Optional programmatic options that override CLI options
 * @returns {Promise<ServerInstance>} Server-instance with shutdown capability
 */
const main = async (programmaticOptions?: Partial<CliOptions>): Promise<ServerInstance> => {
  try {
    // Parse CLI options
    const cliOptions = parseCliOptions();

    // Merge programmatic options with CLI options (programmatic takes precedence)
    const finalOptions = { ...cliOptions, ...programmaticOptions };

    // Freeze options to prevent further changes
    freezeOptions(finalOptions);

    // Create and return server-instance
    return await runServer();
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
if (process.env.NODE_ENV !== 'local') {
  main().catch(error => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}

export { main, main as start, type CliOptions, type ServerInstance };

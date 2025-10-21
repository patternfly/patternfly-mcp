#!/usr/bin/env node

import { freezeOptions, parseCliOptions } from './options';
import { runServer } from './server';

/**
 * Main function - CLI entry point
 */
const main = async (): Promise<void> => {
  try {
    // Temporary parse for CLI options until we move to yargs or commander
    const cliOptions = parseCliOptions();

    // Freeze options to prevent further changes
    freezeOptions(cliOptions);

    // Create and run the server
    await runServer();
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

export { main, runServer };

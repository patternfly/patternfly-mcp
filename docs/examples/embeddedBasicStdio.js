/**
 * An embedded basic STDIO Transport example.
 *
 * This example demonstrates how to start the PatternFly MCP Server
 * with default stdio transport.
 */
import { start } from '@patternfly/patternfly-mcp';

/**
 * The main entry point for embedding a basic PatternFly MCP Server.
 *
 * - Avoid using console.log and info they pollute STDOUT.
 * - Terminal logging can be enabled by setting `logging.stderr` to `true`, or you can use custom logging with the returned `server.onLog` callback.
 * - Server instance returns `isRunning`, `getStats`, `onLog`, and `stop` methods.
 */
const main = async () => {
  // Start the server with default (stdio) transport and terminal logging.
  const server = await start({ logging: { stderr: true, level: 'info' } });

  // Graceful shutdown, Press Ctrl+C to stop.
  process.on('SIGINT', async () => {
    await server.stop();
    process.exit(0);
  });
};

main().catch(console.error);

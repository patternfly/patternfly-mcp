/**
 * Embedding inline tools example.
 *
 * This example demonstrates how to embed the PatternFly MCP Server
 * inside your application with custom tools.
 */
// @ts-expect-error: Cannot find module '@patternfly/patternfly-mcp' - Remove this line if you're copying this example
import { start, createMcpTool, type PfMcpInstance, type PfMcpLogEvent, type PfMcpStats, type ToolModule } from '@patternfly/patternfly-mcp';

/**
 * Echo tool - A custom tool that echoes back the provided user message.
 *
 * - Use "content" property with "TextContent" array for the response.
 */
const echoTool: ToolModule = createMcpTool({
  name: 'echoAMessage',
  description: 'Echo back the provided user message.',
  inputSchema: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'The message to echo back'
      }
    },
    required: ['message']
  },
  handler: async (args: { message: string }) => ({
    content: [
      {
        type: 'text',
        text: `You said: ${args.message}`
      }
    ]
  })
});

/**
 * Main entry point for embedding the PatternFly MCP Server.
 *
 * - Avoid using console.log and info they pollute STDOUT.
 * - Terminal logging can be enabled by setting `logging.stderr` to `true`, or you can favor custom logging with the returned `server.onLog` callback.
 * - Server instance returns `isRunning`, `getStats`, `onLog`, and `stop` methods.
 */
const main = async () => {
  console.warn('Embedding PatternFly MCP Server...');

  // Start a server with custom tools.
  const server: PfMcpInstance = await start({
    toolModules: [
      echoTool
      // Add additional inline tools here
    ]
  });

  console.warn('Server embedded successfully!');
  console.warn(`Server is running: ${server.isRunning()}`);

  // Optional: Observe refined server logs in-process
  server.onLog((event: PfMcpLogEvent) => {
    if (event.level !== 'debug') {
      console.warn(`[${event.level}] ${event.msg || ''}`);
    }
  });

  // Get server statistics
  const stats: PfMcpStats = await server.getStats();

  console.warn('Server statistics:', stats);

  // Graceful shutdown, Press Ctrl+C to stop.
  process.on('SIGINT', async () => {
    console.warn('\nShutting down embedded server...');
    await server.stop();
    console.warn('Server stopped.');
    process.exit(0);
  });

  // Example: Your application logic here
  console.warn('Your application is running with embedded MCP server.');
  console.warn('Press Ctrl+C to stop.');

  // Keep the process alive
  // In a real application, you would have your application logic here
};

main().catch(error => {
  console.error('Failed to embed server:', error);
  process.exit(1);
});

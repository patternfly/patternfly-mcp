/**
 * An embedded basic HTTP Transport example.
 *
 * This example demonstrates how to start the PatternFly MCP Server
 * with HTTP transport and security configuration.
 */
import { start } from '@patternfly/patternfly-mcp';

const main = async () => {
  console.warn('Embedding PatternFly MCP Server with HTTP transport...');

  // Start server with HTTP transport
  const server = await start({
    http: {
      port: 8080,
      host: '127.0.0.1',
      allowedOrigins: ['https://app.example.com'],
      allowedHosts: ['localhost', '127.0.0.1']
    },
    logging: {
      stderr: true,
      level: 'info'
    }
  });

  console.warn('Server started on http://127.0.0.1:8080');
  console.warn(`Server is running: ${server.isRunning()}`);

  // Optional: Listen to server logs
  server.onLog(event => {
    console.warn(`[${event.level.toUpperCase()}] ${event.msg || ''}`);
  });

  // Get server statistics
  const stats = await server.getStats();

  console.warn('Server stats:', stats);

  // Graceful shutdown, Press Ctrl+C to stop.
  process.on('SIGINT', async () => {
    console.warn('\nShutting down server...');

    await server.stop();

    console.warn('Server stopped.');
    process.exit(0);
  });

  console.warn('Server is running. Press Ctrl+C to stop.');
  console.warn('Connect to: http://127.0.0.1:8080');
};

main().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

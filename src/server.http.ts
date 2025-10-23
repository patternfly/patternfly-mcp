import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { OPTIONS } from './options';

/**
 * Create Streamable HTTP transport
 *
 * @param options - Global options (default parameter)
 */
const createStreamableHttpTransport = (options = OPTIONS): StreamableHTTPServerTransport => {
  const transportOptions: any = {
    sessionIdGenerator: () => crypto.randomUUID(),
    enableJsonResponse: false, // Use SSE streaming
    enableDnsRebindingProtection: true,
    onsessioninitialized: (sessionId: string) => {
      console.log(`Session initialized: ${sessionId}`);
    },
    onsessionclosed: (sessionId: string) => {
      console.log(`Session closed: ${sessionId}`);
    }
  };

  // Only include optional properties if they have values
  if (options.allowedOrigins) {
    transportOptions.allowedOrigins = options.allowedOrigins;
  }
  if (options.allowedHosts) {
    transportOptions.allowedHosts = options.allowedHosts;
  }

  return new StreamableHTTPServerTransport(transportOptions);
};

/**
 * Handle Streamable HTTP requests
 *
 * @param req - HTTP request object
 * @param res - HTTP response object
 * @param transport - Streamable HTTP transport
 */
const handleStreamableHttpRequest = async (
  req: IncomingMessage,
  res: ServerResponse,
  transport: StreamableHTTPServerTransport
): Promise<void> => {
  // Single endpoint handles all operations
  await transport.handleRequest(req, res);
};

/**
 * Start HTTP transport server
 *
 * @param mcpServer - MCP server instance
 * @param options - Global options (default parameter)
 */
const startHttpTransport = async (mcpServer: McpServer, options = OPTIONS): Promise<void> => {
  const transport = createStreamableHttpTransport(options);

  // Connect MCP server to transport
  await mcpServer.connect(transport);

  // Set up request handler
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    handleStreamableHttpRequest(req, res, transport);
  });

  // Start server
  return new Promise((resolve, reject) => {
    server.listen(options.port || 3000, options.host || 'localhost', () => {
      console.log(`PatternFly MCP server running on http://${options.host || 'localhost'}:${options.port || 3000}`);
      resolve();
    });
    server.on('error', reject);
  });
};

export {
  startHttpTransport
};

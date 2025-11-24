/**
 * HTTP Transport Client for E2E Testing
 * Uses the MCP SDK's built-in Client and StreamableHTTPClientTransport
 */
// @ts-nocheck - E2E test file that imports from dist/index.js (compiled output)
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ListToolsResultSchema, ResultSchema } from '@modelcontextprotocol/sdk/types.js';
// E2E tests import from dist/index.js (compiled entry point) - tests the actual production build
import { start } from '../../dist/index.js';

export interface StartHttpServerOptions {
  port?: number;
  host?: string;
  allowedOrigins?: string[];
  allowedHosts?: string[];
  docsHost?: boolean;
}

export interface RpcResponse {
  jsonrpc?: '2.0';
  id: number | string | null;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface HttpTransportClient {
  baseUrl: string;
  sessionId?: string | undefined;
  send: (request: { method: string; params?: any }) => Promise<RpcResponse>;
  initialize: () => Promise<RpcResponse>;
  close: () => Promise<void>;
}

/**
 * Start an HTTP server using the programmatic API and return a client for testing
 *
 * @param options - Server configuration options
 */
export const startHttpServer = async (options: StartHttpServerOptions = {}): Promise<HttpTransportClient> => {
  const {
    port = 3000,
    host = '127.0.0.1',
    allowedOrigins,
    allowedHosts,
    docsHost = false
  } = options;

  // Build programmatic options (will override any CLI options from process.argv)
  const programmaticOptions: Partial<CliOptions> = {
    http: true,
    port,
    host,
    docsHost
  };

  if (allowedOrigins) {
    programmaticOptions.allowedOrigins = allowedOrigins;
  }

  if (allowedHosts) {
    programmaticOptions.allowedHosts = allowedHosts;
  }

  // Start server using public API from dist/index.js (tests the actual compiled output)
  const server = await start(programmaticOptions);

  // Verify server is running
  if (!server?.isRunning()) {
    throw new Error(`Server failed to start on port ${port}`);
  }

  // Construct base URL from options
  const baseUrl = `http://${host}:${port}/mcp`;

  // Create MCP SDK client and transport
  const transport = new StreamableHTTPClientTransport(new URL(baseUrl));
  const mcpClient = new Client(
    {
      name: 'test-client',
      version: '1.0.0'
    },
    {
      capabilities: {}
    }
  );

  // Track whether we're intentionally closing the client
  // This allows us to suppress expected disconnection errors during cleanup
  let isClosing = false;

  // Set up error handler - only log unexpected errors
  mcpClient.onerror = error => {
    // Only log errors that occur when not intentionally closing
    // SSE stream disconnection during cleanup is expected behavior
    if (!isClosing) {
      console.error('MCP Client error:', error);
    }
  };

  // Connect client to transport (this automatically initializes the session)
  await mcpClient.connect(transport);

  // Minimal wait for server to be ready (reduced from 200ms for faster tests)
  // The server should be ready immediately after start() resolves
  await new Promise(resolve => {
    const timer = setTimeout(resolve, 50);

    timer.unref();
  });

  return {
    baseUrl: `http://${host}:${port}`,
    sessionId: transport.sessionId,

    async send(request: { method: string; params?: any }): Promise<RpcResponse> {
      // Use the SDK client's request method
      // For tools/list, use the proper schema
      if (request.method === 'tools/list') {
        const result = await mcpClient.request(request, ListToolsResultSchema);

        return {
          jsonrpc: '2.0',
          id: null,
          result: result as any
        };
      }
      // For other requests, use the client's request method with generic ResultSchema
      const result = await mcpClient.request(request as any, ResultSchema);

      return {
        jsonrpc: '2.0',
        id: null,
        result: result as any
      };
    },

    async initialize(): Promise<RpcResponse> {
      // Client is already initialized via connect(), but return the initialize result
      // We can't get it back, so we'll just return a success response
      return {
        jsonrpc: '2.0',
        id: null,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          serverInfo: {
            name: '@patternfly/patternfly-mcp',
            version: '0.1.0'
          }
        }
      } as RpcResponse;
    },

    async close(): Promise<void> {
      // Mark that we're intentionally closing to suppress expected disconnection errors
      isClosing = true;

      // Remove error handler to prevent any error logging during cleanup
      mcpClient.onerror = null;

      // Close transport first (this closes all connections and sessions)
      // This may trigger SSE stream disconnection, which is expected
      await transport.close();

      // Wait for transport cleanup to complete
      // This ensures all event listeners and connections are fully closed
      // before we shut down the server, preventing Jest worker process warnings
      // Increased delay to ensure SSE stream and all event listeners are cleaned up
      await new Promise(resolve => {
        const timer = setTimeout(resolve, 200);

        // Don't keep process alive if this is the only thing running
        timer.unref();
      });

      // Stop the server after transport is fully closed
      await server.stop();

      // Additional small delay after server stop to ensure all cleanup completes
      await new Promise(resolve => {
        const timer = setTimeout(resolve, 50);

        timer.unref();
      });
    }
  };
};

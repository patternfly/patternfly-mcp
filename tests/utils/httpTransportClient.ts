/**
 * HTTP Transport Client for E2E Testing
 * Uses the MCP SDK's built-in Client and StreamableHTTPClientTransport
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ListToolsResultSchema, ResultSchema, LoggingMessageNotificationSchema, type LoggingLevel } from '@modelcontextprotocol/sdk/types.js';

// @ts-ignore - dist/index.js isn't necessarily built yet, remember to build before running tests
import { start, type PfMcpOptions, type PfMcpSettings, type ServerLogEvent } from '../../dist/index.js';

export type { Request as RpcRequest } from '@modelcontextprotocol/sdk/types.js';

export type StartHttpServerOptions = {
  docsHost?: boolean;
  http?: Partial<PfMcpOptions['http']>;
  isHttp?: boolean;
  logging?: Partial<PfMcpOptions['logging']> & { level?: LoggingLevel };
};

export type StartHttpServerSettings = PfMcpSettings;

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
  logs: () => string[];
  inProcessLogs: () => string[];
  protocolLogs: () => string[];
}

/**
 * Start an HTTP server using the programmatic API and return a client for testing
 *
 * @param options - Server configuration options
 * @param settings - Additional settings for the server (e.g., allowProcessExit)
 */
export const startServer = async (
  options: StartHttpServerOptions = {},
  settings: StartHttpServerSettings = {}
): Promise<HttpTransportClient> => {
  const updatedOptions: PfMcpOptions = {
    isHttp: true,
    docsHost: false,
    ...options,
    http: {
      port: 5000,
      host: '127.0.0.1',
      allowedOrigins: [],
      allowedHosts: [],
      ...options.http
    },
    logging: {
      logger: '@patternfly/patternfly-mcp',
      level: options.logging?.level || 'info',
      stderr: options.logging?.stderr || false,
      protocol: options.logging?.protocol || false,
      transport: 'mcp'
    },
    mode: 'test'
  };

  const { host, port } = updatedOptions.http || {};

  // Start server using public API from dist/index.js (tests the actual compiled output)
  const server = await start(updatedOptions, settings);

  // Collect all server logs in-process
  const inProcessLogs: string[] = [];

  server.onLog((event: ServerLogEvent) => {
    inProcessLogs.push(event.msg || JSON.stringify(event));
  });

  // Verify server is running
  if (!server?.isRunning()) {
    throw new Error(`Server failed to start on port ${port}`);
  }

  let httpClientUrl: URL;

  try {
    // Construct base URL from options
    const baseUrl = `http://${host}:${port}/mcp`;
    httpClientUrl = new URL(baseUrl);
  } catch (error) {
    throw new Error(`Failed to construct base URL: ${error}, host: ${host}, port: ${port}`);
  }

  // Create MCP SDK client and transport
  const transport = new StreamableHTTPClientTransport(httpClientUrl);
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

  // Collect protocol logs (MCP notifications/message) when enabled via CLI arg
  const protocolLogs: any[] = [];

  // Register the handler BEFORE connect so we don't miss early server messages
  if (updatedOptions.logging?.protocol) {
    try {
      mcpClient.setNotificationHandler(LoggingMessageNotificationSchema, (params: any) => {
        protocolLogs.push(params);
      });
    } catch {}
  }

  // Connect client to transport (this automatically initializes the session)
  await mcpClient.connect(transport as any);

  // Negotiate protocol logging level if the server advertises it
  if (updatedOptions.logging?.protocol) {
    try {
      await mcpClient.setLoggingLevel(updatedOptions.logging.level as LoggingLevel);
    } catch {}
  }

  // Wait for the server to be ready
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
      // @ts-ignore
      mcpClient.onerror = null;

      // Close transport first (this closes all connections and sessions)
      // This may trigger SSE stream disconnection, which is expected
      await transport.close();

      // Minor wait for transport cleanup to complete. Increase delay to ensure SSE stream and all event listeners are cleaned up
      await new Promise(resolve => {
        const timer = setTimeout(resolve, 50);

        timer.unref();
      });
      // Stop the server after transport is fully closed
      await server.stop();

      // Additional small delay after server stop to ensure all cleanup completes
      await new Promise(resolve => {
        const timer = setTimeout(resolve, 50);

        timer.unref();
      });
    },

    inProcessLogs: () => inProcessLogs.slice(),
    logs: () => [
      ...inProcessLogs,
      ...protocolLogs
    ],
    protocolLogs: () => protocolLogs.slice()
  };
};

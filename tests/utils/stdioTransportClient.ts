/**
 * STDIO Transport Client for E2E Testing
 * Uses the MCP SDK's built-in Client and StdioClientTransport
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ResultSchema } from '@modelcontextprotocol/sdk/types.js';

export interface StartOptions {
  command?: string;
  serverPath?: string;
  args?: string[];
  env?: Record<string, string | undefined>;
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

export interface StdioTransportClient {
  send: (request: { method: string; params?: any }, opts?: { timeoutMs?: number }) => Promise<RpcResponse>;
  stop: (signal?: NodeJS.Signals) => Promise<void>;
  close: () => Promise<void>; // Alias for stop()
}

/**
 * Start the MCP server process and return a client with send/stop APIs.
 *
 * Uses the MCP SDK's StdioClientTransport and Client for high-level MCP protocol handling.
 *
 * @param options - Server configuration options
 * @param options.command - Node command to run (default: 'node')
 * @param options.serverPath - Path to built server (default: process.env.SERVER_PATH || 'dist/index.js')
 * @param options.args - Additional args to pass to server (e.g., ['--docs-host'])
 * @param options.env - Environment variables for the child process
 */
export const startServer = async ({
  command = 'node',
  serverPath = process.env.SERVER_PATH || 'dist/index.js',
  args = [],
  env = {}
}: StartOptions = {}): Promise<StdioTransportClient> => {
  // Create stdio transport - this will spawn the server process
  // Set stderr to 'pipe' so we can handle server logs separately from JSON-RPC messages
  const transport = new StdioClientTransport({
    command,
    args: [serverPath, ...args],
    env: { ...process.env, ...env } as any,
    stderr: 'pipe' // Pipe stderr so server logs don't interfere with JSON-RPC on stdout
  });

  // Create MCP SDK client
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
  // This allows us to suppress expected errors during cleanup
  let isClosing = false;

  // Set up error handler - only log unexpected errors
  // Note: JSON parse errors from server console.log/info messages are expected
  // The server logs to stdout, which the SDK tries to parse as JSON-RPC messages
  mcpClient.onerror = error => {
    // Only log errors that occur when not intentionally closing
    // Ignore JSON parse errors - happens when the server logs to stdout (expected behavior)
    // The SDK will skip non-JSON lines and continue processing
    if (!isClosing) {
      const isJsonParseError = error instanceof SyntaxError &&
        (error.message.includes('is not valid JSON') || error.message.includes('Unexpected token'));

      if (!isJsonParseError) {
        console.error('MCP Client error:', error);
      }
    }
  };

  // Connect client to transport (this automatically starts transport and initializes the session)
  await mcpClient.connect(transport);

  // Access stderr stream if available to handle server logs
  // This prevents server logs from interfering with JSON-RPC parsing
  if (transport.stderr) {
    transport.stderr.on('data', (_data: Buffer) => {
      // Server logs go to stderr, we can optionally log them for debugging,
      // but we don't need to do anything with them for the tests to work
    });
  }

  // Wait for the server to be ready
  await new Promise(resolve => {
    const timer = setTimeout(resolve, 50);

    timer.unref();
  });

  const stop = async (_signal: NodeJS.Signals = 'SIGINT'): Promise<void> => {
    if (isClosing) {
      return;
    }

    isClosing = true;

    // Remove the error handler to prevent any error logging during cleanup
    mcpClient.onerror = null as any;

    // Close client first
    await mcpClient.close();

    // Close transport (this will kill the child process)
    await transport.close();

    // Small delay to ensure cleanup completes
    await new Promise(resolve => {
      const timer = setTimeout(resolve, 50);

      timer.unref();
    });
  };

  return {
    async send(request: { method: string; params?: any }, _opts?: { timeoutMs?: number }): Promise<RpcResponse> {
      try {
        // Use high-level SDK methods when available for better type safety
        if (request.method === 'tools/list') {
          const result = await mcpClient.listTools(request.params);

          return {
            jsonrpc: '2.0',
            id: null,
            result: result as any
          };
        }

        if (request.method === 'tools/call' && request.params?.name) {
          const result = await mcpClient.callTool({
            name: request.params.name,
            arguments: request.params.arguments || {}
          });

          return {
            jsonrpc: '2.0',
            id: null,
            result: result as any
          };
        }

        // For other requests, use the client's request method
        // Note: The SDK's request method expects a properly formatted request
        const result = await mcpClient.request({
          method: request.method,
          params: request.params
        } as any, ResultSchema);

        return {
          jsonrpc: '2.0',
          id: null,
          result: result as any
        };
      } catch (error) {
        // If request fails, return error response
        return {
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -1,
            message: error instanceof Error ? error.message : String(error)
          }
        };
      }
    },

    stop,
    close: stop
  };
};

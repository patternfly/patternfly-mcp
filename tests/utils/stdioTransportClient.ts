/**
 * STDIO Transport Client for E2E Testing
 * Uses the MCP SDK's built-in Client and StdioClientTransport
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ResultSchema, LoggingMessageNotificationSchema, type LoggingLevel } from '@modelcontextprotocol/sdk/types.js';
import { parseCliOptions } from '../../src/options';

export type { Request as RpcRequest } from '@modelcontextprotocol/sdk/types.js';

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
  logs: () => string[];
  stderrLogs: () => string[];
  protocolLogs: () => string[];
}

/**
 * Start the MCP server process and return a client with send/stop APIs.
 *
 * Uses the MCP SDK's StdioClientTransport and Client for high-level MCP protocol handling.
 *
 * @param options - Server configuration options
 * @param options.command - Node command to run (default: 'node')
 * @param options.serverPath - Path to built server (default: 'dist/cli.js')
 * @param options.args - Additional args to pass to server, see app `CliOptions` for the full list (e.g., ['--docs-host'])
 * @param options.env - Environment variables for the child process
 */
export const startServer = async ({
  command = 'node',
  serverPath = 'dist/cli.js',
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

  const parsedArgs = parseCliOptions(args);
  const loggingArgs = parsedArgs?.logging || {};

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

  // Collect protocol logs (MCP notifications/message) when enabled via CLI arg
  const protocolLogs: any[] = [];

  // Register the handler BEFORE connect so we don't miss early server messages
  if (loggingArgs.protocol) {
    try {
      mcpClient.setNotificationHandler(LoggingMessageNotificationSchema, (params: any) => {
        protocolLogs.push(params);
      });
    } catch {}
  }

  // Connect client to transport. This automatically starts transport and initializes the session
  await mcpClient.connect(transport);

  // Negotiate protocol logging level if the server advertises it
  if (loggingArgs.protocol) {
    try {
      await mcpClient.setLoggingLevel(loggingArgs.level as LoggingLevel);
    } catch {}
  }

  // Access stderr stream if available. stderr is used to prevent logs from interfering with JSON-RPC parsing
  // Collect server stderr logs
  const stderrLogs: string[] = [];

  if (transport.stderr) {
    transport.stderr.on('data', (data: Buffer) => {
      stderrLogs.push(data.toString());
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
            result
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
            result
          };
        }

        // Note: The SDK's request method expects a properly formatted request.
        // For other requests, use the client's request method with generic ResultSchema
        const result = await mcpClient.request({
          method: request.method,
          params: request.params
        } as any, ResultSchema);

        return {
          jsonrpc: '2.0',
          id: null,
          result
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

    logs: () => [
      ...stderrLogs,
      ...protocolLogs
    ],
    stderrLogs: () => stderrLogs.slice(),
    protocolLogs: () => protocolLogs.slice(),
    stop,
    close: stop // Alias for stop, align with the http transport client
  };
};

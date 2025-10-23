#!/usr/bin/env node

// HTTP transport client for E2E testing of StreamableHTTPServerTransport
import { spawn } from 'node:child_process';
import { type IncomingMessage } from 'node:http';

// JSON-like value used in requests/responses
export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

export interface RpcError {
  code: number;
  message: string;
  data?: Json;
}

export interface RpcResultCommon {
  content?: Array<({ text?: string } & Record<string, unknown>)>;
  tools?: Array<({ name: string } & Record<string, unknown>)>;
  [k: string]: unknown;
}

export interface RpcResponse {
  jsonrpc?: '2.0';
  id: number | string;
  result?: RpcResultCommon;
  error?: RpcError;
}

export interface RpcRequest {
  jsonrpc?: '2.0';
  id?: number | string;
  method: string;
  params?: Json;
}

export interface StartHttpServerOptions {
  port?: number;
  host?: string;
  allowedOrigins?: string[];
  allowedHosts?: string[];
  args?: string[];
  env?: Record<string, string | undefined>;
}

export interface HttpTransportClient {
  baseUrl: string;
  sessionId?: string | undefined;
  send: (request: RpcRequest, opts?: { timeoutMs?: number; headers?: Record<string, string> }) => Promise<RpcResponse>;
  initialize: () => Promise<RpcResponse>;
  close: () => Promise<void>;
}

interface PendingEntry {
  resolve: (value: RpcResponse) => void;
  reject: (reason?: Error) => void;
  timer: NodeJS.Timeout;
}

/**
 * Start an HTTP server with the MCP server and return a client for testing
 *
 * @param options - Server configuration options
 */
export const startHttpServer = (options: StartHttpServerOptions = {}): Promise<HttpTransportClient> => new Promise((resolve, reject) => {
  const {
    port = 3000, // Use a default port instead of 0
    host = 'localhost',
    allowedOrigins,
    allowedHosts,
    args = [],
    env = {}
  } = options;

  // Build command arguments
  const serverArgs = ['--http', '--port', port.toString(), '--host', host, ...args];

  if (allowedOrigins) {
    serverArgs.push('--allowed-origins', allowedOrigins.join(','));
  }

  if (allowedHosts) {
    serverArgs.push('--allowed-hosts', allowedHosts.join(','));
  }

  // Start the MCP server process
  const proc = spawn('node', ['dist/index.js', ...serverArgs], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...env }
  });

  let serverUrl = '';
  let sessionId: string | undefined;
  const pendingRequests = new Map<string, PendingEntry>();
  let requestId = 0;

  // Handle server output to get the URL
  proc.stdout.on('data', (data: Buffer) => {
    const output = data.toString();
    const urlMatch = output.match(/PatternFly MCP server running on (http:\/\/[^\s]+)/);

    if (urlMatch && urlMatch[1]) {
      serverUrl = urlMatch[1];
      resolve(createClient());
    }
  });

  // Handle server errors
  proc.stderr.on('data', (data: Buffer) => {
    const error = data.toString();

    if (error.includes('Error:') || error.includes('EADDRINUSE')) {
      reject(new Error(`Server error: ${error}`));
    }
  });

  proc.on('error', error => {
    reject(new Error(`Failed to start server: ${error.message}`));
  });

  proc.on('exit', code => {
    if (code !== 0 && code !== null) {
      reject(new Error(`Server exited with code ${code}`));
    }
  });

  /**
     * Create HTTP transport client
     */
  function createClient(): HttpTransportClient {
    return {
      baseUrl: serverUrl,
      sessionId,

      async send(request: RpcRequest, opts: { timeoutMs?: number; headers?: Record<string, string> } = {}): Promise<RpcResponse> {
        const { timeoutMs = 10000, headers = {} } = opts;

        return new Promise((resolve, reject) => {
          const id = (requestId += 1).toString();
          const timer = setTimeout(() => {
            pendingRequests.delete(id);
            reject(new Error(`Request timeout after ${timeoutMs}ms`));
          }, timeoutMs);

          pendingRequests.set(id, { resolve, reject, timer });

          // Prepare headers
          const requestHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
            ...headers
          };

          // Add session ID if available
          if (sessionId) {
            requestHeaders['mcp-session-id'] = sessionId;
          }

          // Make HTTP request
          const postData = JSON.stringify(request);
          const url = new URL('/mcp', serverUrl);

          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const httpRequest = require('http').request({
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: 'POST',
            headers: requestHeaders
          }, (response: IncomingMessage) => {
            let data = '';

            response.on('data', (chunk: Buffer) => {
              data += chunk.toString();
            });

            response.on('end', () => {
              try {
                // Handle SSE response
                if (response.headers['content-type']?.includes('text/event-stream')) {
                  // Extract session ID from headers
                  const sessionIdHeader = response.headers['mcp-session-id'];

                  if (sessionIdHeader && typeof sessionIdHeader === 'string') {
                    sessionId = sessionIdHeader;
                  }

                  // Parse SSE data
                  const lines = data.split('\n');

                  for (const line of lines) {
                    if (line.startsWith('data: ')) {
                      const jsonData = line.substring(6);

                      if (jsonData.trim()) {
                        const parsed = JSON.parse(jsonData);
                        const entry = pendingRequests.get(id);

                        if (entry) {
                          clearTimeout(entry.timer);
                          pendingRequests.delete(id);
                          entry.resolve(parsed);
                        }

                        return;
                      }
                    }
                  }
                } else {
                  // Handle regular JSON response
                  const parsed = JSON.parse(data);

                  // Extract session ID from response if available
                  if (parsed.result?.sessionId && typeof parsed.result.sessionId === 'string') {
                    sessionId = parsed.result.sessionId;
                  }

                  const entry = pendingRequests.get(id);

                  if (entry) {
                    clearTimeout(entry.timer);
                    pendingRequests.delete(id);
                    entry.resolve(parsed);
                  }
                }
              } catch (error) {
                const entry = pendingRequests.get(id);

                if (entry) {
                  clearTimeout(entry.timer);
                  pendingRequests.delete(id);
                  entry.reject(new Error(`Failed to parse response: ${error}`));
                }
              }
            });
          });

          httpRequest.on('error', (error: Error) => {
            const entry = pendingRequests.get(id);

            if (entry) {
              clearTimeout(entry.timer);
              pendingRequests.delete(id);
              entry.reject(error);
            }
          });

          httpRequest.write(postData);
          httpRequest.end();
        });
      },

      async initialize(): Promise<RpcResponse> {
        const response = await this.send({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-06-18',
            capabilities: {},
            clientInfo: {
              name: 'test-client',
              version: '1.0.0'
            }
          }
        });

        // Extract session ID from response if available
        if (response.result?.sessionId && typeof response.result.sessionId === 'string') {
          sessionId = response.result.sessionId;
        }

        return response;
      },

      async close(): Promise<void> {
        // Clear pending requests
        for (const [_id, entry] of pendingRequests) {
          clearTimeout(entry.timer);
          entry.reject(new Error('Client closed'));
        }
        pendingRequests.clear();

        // Kill the server process
        if (proc && !proc.killed) {
          proc.kill('SIGTERM');

          // Wait a bit for graceful shutdown
          await new Promise(resolve => setTimeout(resolve, 100));

          // Force kill if still running
          if (!proc.killed) {
            proc.kill('SIGKILL');
          }
        }
      }
    };
  }
});

/**
 * Helper function to create a simple HTTP client for testing
 *
 * @param baseUrl - Base URL for the HTTP client
 */
export const createHttpClient = (baseUrl: string): HttpTransportClient => {
  let sessionId: string | undefined;
  let requestId = 0;

  return {
    baseUrl,
    sessionId,

    async send(request: RpcRequest, opts: { timeoutMs?: number; headers?: Record<string, string> } = {}): Promise<RpcResponse> {
      const { timeoutMs = 10000, headers = {} } = opts;

      return new Promise((resolve, reject) => {
        const _id = (requestId += 1).toString();

        void _id; // Suppress unused variable warning
        const timer = setTimeout(() => {
          reject(new Error(`Request timeout after ${timeoutMs}ms`));
        }, timeoutMs);

        // Prepare headers
        const requestHeaders: Record<string, string> = {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          ...headers
        };

        // Add session ID if available
        if (sessionId) {
          requestHeaders['mcp-session-id'] = sessionId;
        }

        // Make HTTP request
        const postData = JSON.stringify(request);
        const url = new URL('/mcp', baseUrl);

        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const httpRequest = require('http').request({
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          method: 'POST',
          headers: requestHeaders
        }, (response: IncomingMessage) => {
          let data = '';

          response.on('data', (chunk: Buffer) => {
            data += chunk.toString();
          });

          response.on('end', () => {
            clearTimeout(timer);
            try {
              // Handle SSE response
              if (response.headers['content-type']?.includes('text/event-stream')) {
                // Extract session ID from headers
                const sessionIdHeader = response.headers['mcp-session-id'];

                if (sessionIdHeader && typeof sessionIdHeader === 'string') {
                  sessionId = sessionIdHeader;
                }

                // Parse SSE data
                const lines = data.split('\n');

                for (const line of lines) {
                  if (line.startsWith('data: ')) {
                    const jsonData = line.substring(6);

                    if (jsonData.trim()) {
                      const parsed = JSON.parse(jsonData);

                      resolve(parsed);

                      return;
                    }
                  }
                }
              } else {
                // Handle regular JSON response
                const parsed = JSON.parse(data);

                // Extract session ID from response if available
                if (parsed.result?.sessionId && typeof parsed.result.sessionId === 'string') {
                  sessionId = parsed.result.sessionId;
                }

                resolve(parsed);
              }
            } catch (error) {
              reject(new Error(`Failed to parse response: ${error}`));
            }
          });
        });

        httpRequest.on('error', (error: Error) => {
          clearTimeout(timer);
          reject(error);
        });

        httpRequest.write(postData);
        httpRequest.end();
      });
    },

    async initialize(): Promise<RpcResponse> {
      const response = await this.send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: {
            name: 'test-client',
            version: '1.0.0'
          }
        }
      });

      // Extract session ID from response if available
      if (response.result?.sessionId && typeof response.result.sessionId === 'string') {
        sessionId = response.result.sessionId;
      }

      return response;
    },

    async close(): Promise<void> {
      // No-op for simple client
    }
  };
};

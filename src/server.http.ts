import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { type Socket } from 'node:net';
import { execSync } from 'node:child_process';
import { platform } from 'node:os';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport, type StreamableHTTPServerTransportOptions } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { portToPid } from 'pid-port';
import { getOptions } from './options.context';
import { log } from './logger';

/**
 * Fixed base path for MCP transport endpoints.
 *
 * @note Clients should use http://host:port/mcp and transport-managed subpaths like `/mcp/sse`.
 */
const MCP_BASE_PATH = '/mcp';

/**
 * The base URL of the MCP server.
 */
const MCP_HOST = 'http://mcp.local';

/**
 * Get process information for a port
 *
 * @param port - Port number to check
 * @returns Process info or undefined if port is free
 */
const getProcessOnPort = async (port: number) => {
  if (!port) {
    return undefined;
  }

  try {
    // Cross-platform PID lookup using pid-port
    const pid = await portToPid(port);

    if (!pid) {
      return undefined;
    }

    // Minimal OS-specific code for command name
    const isWindows = platform() === 'win32';
    let command = 'unknown';

    try {
      if (isWindows) {
        // Use PowerShell to get the full command with arguments (for error messages)
        try {
          const psCmd = `powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter \\"ProcessId=${pid}\\").CommandLine"`;

          command = execSync(psCmd, {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore']
          }).trim();
        } catch {
          // Fallback to "tasklist" if PowerShell fails (only provides process name, not full command line)
          try {
            command = execSync(`tasklist /FI "PID eq ${pid}" /FO LIST /NH`, {
              encoding: 'utf8',
              stdio: ['ignore', 'pipe', 'ignore']
            }).trim();
          } catch {
            // Ignore - command stays 'unknown'
          }
        }
      } else {
        try {
          command = execSync(`ps -p ${pid} -o command=`, {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe']
          }).trim();
        } catch {
          // If ps fails, confirm pid then construct the command from process.argv
          if (pid === process.pid) {
            const argv = process.argv;

            if (argv && argv.length > 0) {
              command = argv.join(' ');
            }
          }
        }
      }
    } catch {
      // Ignore - command stays 'unknown'
    }

    return { pid, command };
  } catch {
    return undefined;
  }
};

/**
 * Create Streamable HTTP transport
 *
 * @param {GlobalOptions} [options]
 */
const createStreamableHttpTransport = (options = getOptions()) => {
  const { http } = options;

  const transportOptions: StreamableHTTPServerTransportOptions = {
    sessionIdGenerator: () => randomUUID(),
    enableJsonResponse: false, // Use SSE streaming
    enableDnsRebindingProtection: true,
    onsessioninitialized: (sessionId: string) => {
      log.info(`Session initialized: ${sessionId}`);
    },
    onsessionclosed: (sessionId: string) => {
      log.info(`Session closed: ${sessionId}`);
    }
  };

  if (http?.allowedOrigins) {
    transportOptions.allowedOrigins = http.allowedOrigins;
  }

  if (http?.allowedHosts) {
    transportOptions.allowedHosts = http.allowedHosts;
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
) => {
  await transport.handleRequest(req, res);
};

/**
 * HTTP server handle for lifecycle management
 */
type HttpServerHandle = {
  close: () => Promise<void>;
};

/**
 * Start the HTTP transport server
 *
 * @param {McpServer} mcpServer
 * @param {GlobalOptions} [options]
 * @returns Handle with close method for server lifecycle management
 */
const startHttpTransport = async (mcpServer: McpServer, options = getOptions()): Promise<HttpServerHandle> => {
  const { name, http } = options;

  if (!http?.port || !http?.host) {
    throw new Error('Port and host options are required for HTTP transport');
  }

  const transport = createStreamableHttpTransport(options);

  // Connect MCP server to transport
  await mcpServer.connect(transport);

  // Set up
  const connections = new Set<Socket>();

  // Gate handling to a fixed base path to avoid exposing the transport on arbitrary routes
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    try {
      const url = new URL(req.url || '/', MCP_HOST);

      const pathname = (url.pathname || '/').toLowerCase();
      const basePath = MCP_BASE_PATH.toLowerCase();

      const isExactBasePath = pathname === basePath;
      const isUnderBasePath = pathname.startsWith(`${basePath}/`);

      if (!isExactBasePath && !isUnderBasePath) {
        throw new Error('Unexpected path', { cause: { statusCode: 404, message: 'Not Found' } });
      }
    } catch (error) {
      const cause = (error as { cause?: unknown })?.cause as { statusCode?: unknown; message?: unknown } | undefined;
      const statusCode = typeof cause?.statusCode === 'number' ? cause.statusCode : 400;
      const message = typeof cause?.message === 'string' ? cause.message : 'Bad Request';
      const method = req?.method || 'UNKNOWN';
      const remote = req?.socket?.remoteAddress || 'unknown';
      const path = req?.url || '<empty>';

      log.warn(`HTTP ${statusCode} [${method}] from ${remote}, unexpected path: ${path}`);
      res.statusCode = statusCode;
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      // Ensure socket closes after res.end()
      res.shouldKeepAlive = false;
      res.end(message);

      return;
    }

    void handleStreamableHttpRequest(req, res, transport);
  });

  // Start the server. Port conflicts will be handled in the error handler below
  await new Promise<void>((resolve, reject) => {
    server.listen(http.port, http.host, () => {
      log.info(`${name} server running on http://${http.host}:${http.port}`);
      resolve();
    });

    server.on('connection', socket => {
      connections.add(socket);
      socket.on('close', () => connections.delete(socket));
    });

    server.on('error', async (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        const processInfo = await getProcessOnPort(http.port);
        const errorMessage = `Port ${http.port} is already in use${processInfo ? ` by PID ${processInfo.pid}` : ''}.`;

        log.error(errorMessage);
        reject(processInfo ? new Error(errorMessage, { cause: processInfo }) : error);
      } else {
        log.error(`HTTP server error: ${error}`);
        reject(error);
      }
    });
  });

  return {
    close: async () => {
      // 1) Stop accepting new connections and finish requests quickly
      // If the transport exposes a close/shutdown, call it here (pseudo):
      // await transport.close?.(); // not in current SDK surface but keep as a future hook

      // 2) Proactively destroy open sockets (SSE/keep-alive)
      for (const socket of connections) {
        try {
          socket.destroy();
        } catch {}
      }

      // 3) Close the HTTP server
      await new Promise<void>(resolve => {
        server.close(() => resolve());
      });
    }
  };
};

export {
  createStreamableHttpTransport,
  getProcessOnPort,
  handleStreamableHttpRequest,
  startHttpTransport,
  MCP_BASE_PATH,
  MCP_HOST,
  type HttpServerHandle
};

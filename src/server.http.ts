import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { execSync } from 'node:child_process';
import { platform } from 'node:os';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport, type StreamableHTTPServerTransportOptions } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { portToPid } from 'pid-port';
import { getOptions } from './options.context';

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
 * Format a helpful error message for port conflicts
 *
 * @param port - Port number
 * @param processInfo - Process information (optional)
 * @param processInfo.pid - Process ID
 * @param processInfo.command - Command string
 * @returns Formatted error message
 */
const formatPortConflictError = (port: number, processInfo?: { pid: number; command: string }) =>
  `Port ${port} is already in use${processInfo ? ` by PID ${processInfo.pid}` : ''}. Please use a different port or stop the process using this port.`;

/**
 * Create Streamable HTTP transport
 *
 * @param options - Global options (default parameter)
 */
const createStreamableHttpTransport = (options = getOptions()) => {
  const transportOptions: StreamableHTTPServerTransportOptions = {
    sessionIdGenerator: () => randomUUID(),
    enableJsonResponse: false, // Use SSE streaming
    enableDnsRebindingProtection: true,
    onsessioninitialized: (sessionId: string) => {
      console.log(`Session initialized: ${sessionId}`);
    },
    onsessionclosed: (sessionId: string) => {
      console.log(`Session closed: ${sessionId}`);
    }
  };

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
 * @param mcpServer - MCP server instance
 * @param options - Global options (default parameter)
 * @returns Handle with close method for server lifecycle management
 */
const startHttpTransport = async (mcpServer: McpServer, options = getOptions()): Promise<HttpServerHandle> => {
  const { port, name, host } = options;

  if (!port || !host) {
    throw new Error('Port and host options are required for HTTP transport');
  }

  const transport = createStreamableHttpTransport(options);

  // Connect MCP server to transport
  await mcpServer.connect(transport);

  // Set up
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    void handleStreamableHttpRequest(req, res, transport);
  });

  // Start the server. Port conflicts will be handled in the error handler below
  await new Promise<void>((resolve, reject) => {
    server.listen(port, host, () => {
      console.log(`${name} server running on http://${host}:${port}`);
      resolve();
    });

    server.on('error', async (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        // Port is in use - get process info and provide helpful error
        const processInfo = await getProcessOnPort(port);
        const errorMessage = formatPortConflictError(port, processInfo);

        console.error(errorMessage);
        reject(processInfo
          ? new Error(`Port ${port} is already in use by PID ${processInfo.pid}`, { cause: processInfo })
          : error);
      } else {
        console.error(`HTTP server error: ${error}`);
        reject(error);
      }
    });
  });

  return {
    close: async () => {
      await new Promise<void>(resolve => {
        server.close(() => resolve());
      });
    }
  };
};

export {
  createStreamableHttpTransport,
  formatPortConflictError,
  getProcessOnPort,
  handleStreamableHttpRequest,
  startHttpTransport,
  type HttpServerHandle
};

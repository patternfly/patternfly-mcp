import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { execSync } from 'node:child_process';
import { platform } from 'node:os';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport, type StreamableHTTPServerTransportOptions } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { portToPid } from 'pid-port';
import fkill from 'fkill';
import packageJson from '../package.json';
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
        // Use PowerShell to get full command line with arguments (required for isSameMcpServer detection)
        try {
          const psCmd = `powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter \\"ProcessId=${pid}\\").CommandLine"`;

          command = execSync(psCmd, {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore']
          }).trim();
        } catch {
          // Fallback to tasklist if PowerShell fails (only provides process name, not full command line)
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
        command = execSync(`ps -p ${pid} -o command=`, {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore']
        }).trim();
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
 * Tokens that identify this MCP server process
 * Dynamically generated from package.json bin entries plus the built entry point
 */
const SAME_SERVER_TOKENS = [
  // Direct node invocation of our built entry
  'dist/index.js',
  // Installed bin names from package.json#bin
  ...Object.keys(packageJson.bin || {})
];

/**
 * Check if a process is the same MCP server instance (HTTP mode)
 *
 * We consider it a match if the command line appears to invoke our binary or
 * the built entry point AND includes the `--http` flag.
 *
 * @param rawCommand - Raw command string to check
 * @returns True if it's the same MCP server
 */
const isSameMcpServer = (rawCommand: string): boolean => {
  if (!rawCommand) return false;

  // Normalize to improve cross-platform matching
  const cmd = rawCommand
    .replace(/\\/g, '/') // Windows paths → forward slashes
    .replace(/\s+/g, ' ') // Collapse whitespace
    .trim()
    .toLowerCase();

  // Check for --http flag with word boundaries
  const hasHttpFlag = /(^|\s)--http(\s|$)/.test(cmd);

  if (!hasHttpFlag) return false;

  return SAME_SERVER_TOKENS.some(t => cmd.includes(t.toLowerCase()));
};

/**
 * Kill a process by PID using fkill
 *
 * @param pid - Process ID to kill
 * @param settings - Optional settings object
 * @param settings.maxWait - Maximum time to wait for graceful shutdown before force kill (default: 1000ms)
 * @returns Promise that resolves to true if successful, false otherwise
 */
const killProcess = async (pid: number, { maxWait = 1000 } = {}): Promise<boolean> => {
  console.log(`Attempting to kill process ${pid}`);

  try {
    // Use fkill with graceful shutdown, then force after timeout
    await fkill(pid, {
      forceAfterTimeout: maxWait,
      waitForExit: maxWait + 1000,
      silent: true
    });

    console.log(`Process ${pid} has exited`);

    return true;
  } catch (error) {
    console.log(`Process ${pid} has failed to shutdown. You may need to stop the process or use a different port.`, error);

    return false;
  }
};

/**
 * Format a helpful error message for port conflicts
 *
 * @param port - Port number
 * @param processInfo - Process information
 * @param processInfo.pid - Process ID
 * @param processInfo.command - Command string
 * @returns Formatted error message
 */
const formatPortConflictError = (port: number, processInfo?: { pid: number; command: string }) => {
  const message = [
    `\n❌ Port ${port} is already in use.`
  ];

  if (processInfo && isSameMcpServer(processInfo.command)) {
    message.push(
      `\tProcess: PID ${processInfo.pid}`,
      `\tCommand: ${processInfo.command}`,
      `\n\tThis appears to be another instance of the server.`,
      `\tRecommended: rerun with --kill-existing flag to stop it automatically.`,
      `\tOr use a different port: --port <different-port>`
    );
  } else {
    message.push(
      `\n\tThis may be a different process. To use this port, you will need to:`,
      `\t1. Stop the process`,
      `\t2. Or use a different port: --port <different-port>`
    );
  }

  return message.join('\n');
};

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
 * Start HTTP transport server
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

  // Check for port conflicts and handle kill-existing BEFORE creating the Promise
  if (options.killExisting) {
    const processInfo = await getProcessOnPort(port);

    if (processInfo) {
      if (isSameMcpServer(processInfo.command)) {
        await killProcess(processInfo.pid);
      } else {
        throw new Error(`Port ${port} is in use by a different process`, { cause: processInfo });
      }
    }
  }

  // Start server (port should be free now, or we'll get an error)
  await new Promise<void>((resolve, reject) => {
    server.listen(port, host, () => {
      console.log(`${name} server running on http://${host}:${port}`);
      resolve();
    });

    server.on('error', async (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        const processInfo = await getProcessOnPort(port);

        console.error(formatPortConflictError(port, processInfo));

        if (processInfo) {
          reject(new Error(`Port ${port} is already in use by PID ${processInfo.pid}`, { cause: processInfo }));
        } else {
          reject(error);
        }
      } else {
        console.error('HTTP server error:', error);
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
  isSameMcpServer,
  killProcess,
  SAME_SERVER_TOKENS,
  startHttpTransport
};

export type { HttpServerHandle };

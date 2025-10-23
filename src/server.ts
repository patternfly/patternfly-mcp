import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { usePatternFlyDocsTool } from './tool.patternFlyDocs';
import { fetchDocsTool } from './tool.fetchDocs';
import { OPTIONS } from './options';

type McpTool = [string, { description: string; inputSchema: any }, (args: any) => Promise<any>];

type McpToolCreator = () => McpTool;

type StopServerOptions = { exitProcess?: boolean };

/**
 * Server instance with shutdown capability
 */
interface ServerInstance {

  /**
   * Stop the server gracefully
   */
  stop(options?: StopServerOptions): Promise<void>;

  /**
   * Check if server is running
   */
  isRunning(): boolean;
}

/**
 * Create and run a server with shutdown, register tool and errors.
 *
 * @param options
 * @param settings
 * @param settings.tools
 * @param settings.enableSigint
 */
const runServer = async (options = OPTIONS, {
  tools = [
    usePatternFlyDocsTool,
    fetchDocsTool
  ],
  enableSigint = true
}: { tools?: McpToolCreator[]; enableSigint?: boolean } = {}): Promise<ServerInstance> => {
  let server: McpServer | null = null;
  let transport: StdioServerTransport | null = null;
  let running = false;

  const stopServer = async ({ exitProcess = true }: StopServerOptions = {}) => {
    if (server && running) {
      await server?.close();
      running = false;
      transport = null;
      console.log('PatternFly MCP server stopped');

      if (exitProcess === true) {
        process.exit(0);
      }

      /*
      try {
        // Close the server first
        await server?.close();

        // Close the transport if it exists
        if (transport) {
          // StdioServerTransport doesn't have a close method, but we can set it to null
          transport = null;
        }

        running = false;
        console.log('PatternFly MCP server stopped');

        // Only exit process if not in test environment
        if (process.env.NODE_ENV !== 'test') {
          process.exit(0);
        }
      } catch (error) {
        console.error('Error stopping server:', error);
        running = false;
      }
      */
    }
  };

  try {
    server = new McpServer(
      {
        name: options.name,
        version: options.version
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    tools.forEach(toolCreator => {
      const [name, schema, callback] = toolCreator();

      console.info(`Registered tool: ${name}`);
      server?.registerTool(name, schema, callback);
    });

    if (enableSigint && process.env.NODE_ENV !== 'test') {
      process.on('SIGINT', async () => stopServer());
    }

    transport = new StdioServerTransport();

    await server.connect(transport);

    running = true;
    console.log('PatternFly MCP server running on stdio');
  } catch (error) {
    console.error('Error creating MCP server:', error);
    throw error;
  }

  return {
    async stop(options?: StopServerOptions): Promise<void> {
      return await stopServer(options);
    },

    isRunning(): boolean {
      return running;
    }
  };
};

export {
  runServer,
  type McpTool,
  type McpToolCreator,
  type ServerInstance
};

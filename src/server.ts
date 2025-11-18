import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { usePatternFlyDocsTool } from './tool.patternFlyDocs';
import { fetchDocsTool } from './tool.fetchDocs';
import { componentSchemasTool } from './tool.componentSchemas';
import { getOptions, runWithOptions } from './options.context';
import { type GlobalOptions } from './options';
import { startHttpTransport, type HttpServerHandle } from './server.http';

type McpTool = [string, { description: string; inputSchema: any }, (args: any) => Promise<any>];

type McpToolCreator = (options?: GlobalOptions) => McpTool;

/**
 * Server instance with shutdown capability
 */
interface ServerInstance {

  /**
   * Stop the server gracefully
   */
  stop(): Promise<void>;

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
 * @param settings.allowProcessExit
 */
const runServer = async (options = getOptions(), {
  tools = [
    usePatternFlyDocsTool,
    fetchDocsTool,
    componentSchemasTool
  ],
  enableSigint = true,
  allowProcessExit = true
}: { tools?: McpToolCreator[]; enableSigint?: boolean, allowProcessExit?: boolean } = {}): Promise<ServerInstance> => {
  let server: McpServer | null = null;
  let transport: StdioServerTransport | null = null;
  let httpHandle: HttpServerHandle | null = null;
  let running = false;

  const stopServer = async () => {
    if (server && running) {
      // Close HTTP server if it exists
      if (httpHandle) {
        await httpHandle.close();
        httpHandle = null;
      }

      await server?.close();
      running = false;
      console.log(`${options.name} server stopped`);

      if (allowProcessExit) {
        process.exit(0);
      }
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
      const [name, schema, callback] = toolCreator(options);

      console.info(`Registered tool: ${name}`);
      server?.registerTool(name, schema, (args = {}) => runWithOptions(options, async () => await callback(args)));
    });

    if (enableSigint) {
      process.on('SIGINT', async () => stopServer());
    }

    if (options.http) {
      httpHandle = await startHttpTransport(server, options);
      // HTTP transport logs its own message
    } else {
      transport = new StdioServerTransport();

      await server.connect(transport);
      // STDIO log
      console.log(`${options.name} server running on stdio`);
    }

    running = true;
  } catch (error) {
    console.error(`Error creating ${options.name} server:`, error);
    throw error;
  }

  return {
    async stop(): Promise<void> {
      return await stopServer();
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

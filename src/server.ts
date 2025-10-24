import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { usePatternFlyDocsTool } from './tool.patternFlyDocs';
import { fetchDocsTool } from './tool.fetchDocs';
import { componentSchemasTool } from './tool.componentSchemas';
import { OPTIONS } from './options';

type McpTool = [string, { description: string; inputSchema: any }, (args: any) => Promise<any>];

type McpToolCreator = (options?: any) => McpTool;

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
 */
const runServer = async (options = OPTIONS, {
  tools = [
    usePatternFlyDocsTool,
    fetchDocsTool,
    componentSchemasTool
  ],
  enableSigint = true
}: { tools?: McpToolCreator[]; enableSigint?: boolean } = {}): Promise<ServerInstance> => {
  let server: McpServer | null = null;
  let transport: StdioServerTransport | null = null;
  let running = false;

  const stopServer = async () => {
    if (server && running) {
      await server?.close();
      running = false;
      console.log('PatternFly MCP server stopped');
      process.exit(0);
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
      server?.registerTool(name, schema, callback);
    });

    if (enableSigint) {
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

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { usePatternFlyDocsTool } from './tool.patternFlyDocs';
import { fetchDocsTool } from './tool.fetchDocs';
import { componentSchemasTool } from './tool.componentSchemas';
import { getOptions, runWithOptions } from './options.context';
import { type GlobalOptions } from './options';
import { log } from './logger';
import { createServerLogger } from './server.logger';

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
 * @param [options]
 * @param [settings]
 * @param [settings.tools]
 * @param [settings.enableSigint]
 */
const runServer = async (options = getOptions(), {
  tools = [
    usePatternFlyDocsTool,
    fetchDocsTool,
    componentSchemasTool
  ],
  enableSigint = true
}: { tools?: McpToolCreator[]; enableSigint?: boolean } = {}): Promise<ServerInstance> => {
  let server: McpServer | null = null;
  let transport: StdioServerTransport | null = null;
  let unsubscribeServerLogger: (() => void) | null = null;
  let running = false;

  const stopServer = async () => {
    if (server && running) {
      await server?.close();
      running = false;
      log.info('PatternFly MCP server stopped');
      unsubscribeServerLogger?.();
      process.exit(0);
    }
  };

  try {
    const enableProtocolLogging = options?.logging?.protocol;

    server = new McpServer(
      {
        name: options.name,
        version: options.version
      },
      {
        capabilities: {
          tools: {},
          ...(enableProtocolLogging ? { logging: {} } : {})
        }
      }
    );

    unsubscribeServerLogger = createServerLogger.memo(server);

    tools.forEach(toolCreator => {
      const [name, schema, callback] = toolCreator(options);

      log.info(`Registered tool: ${name}`);
      server?.registerTool(name, schema, (args = {}) => runWithOptions(options, async () => await callback(args)));
    });

    if (enableSigint) {
      process.on('SIGINT', async () => stopServer());
    }

    transport = new StdioServerTransport();

    await server.connect(transport);

    running = true;
    log.info('PatternFly MCP server running on stdio');
  } catch (error) {
    log.error('Error creating MCP server:', error);
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

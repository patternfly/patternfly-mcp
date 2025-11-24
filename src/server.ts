import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { usePatternFlyDocsTool } from './tool.patternFlyDocs';
import { fetchDocsTool } from './tool.fetchDocs';
import { componentSchemasTool } from './tool.componentSchemas';
import { getOptions, memoWithOptions, runWithOptions } from './options.context';
import { startHttpTransport, type HttpServerHandle } from './server.http';
import { type GlobalOptions } from './options';

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
   * Is the server running?
   */
  isRunning(): boolean;
}

/**
 * Create and run a server with shutdown, register tool and errors.
 *
 * @param options - Server options
 * @param settings - Server settings (tools, signal handling, etc.)
 * @param settings.tools
 * @param settings.enableSigint
 * @param settings.allowProcessExit
 * @returns Server instance
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

/**
 * Memoized version of runServer.
 * - Automatically cleans up servers when cache entries are rolled off (cache limit reached)
 * - Prevents port conflicts by returning the same server instance via memoization
 * - `onCacheRollout` closes servers that were rolled out of caching due to cache limit
 * - Cache limit is configurable via `--cache-limit` CLI option (default: 3)
 * - Uses memoWithOptions to read cacheLimit from options context
 */
runServer.memo = memoWithOptions(
  runServer,
  {
    onCacheRollout: async ({ removed }) => {
      const results: PromiseSettledResult<ServerInstance>[] = await Promise.allSettled(removed);

      for (const result of results) {
        if (result.status === 'fulfilled') {
          const server = result.value;

          if (server?.isRunning?.()) {
            try {
              await server.stop();
            } catch (error) {
              console.error(`Error stopping server: ${error}`);
            }
          }
        } else {
          console.error(`Error cleaning up server: ${result?.reason?.message || result?.reason || 'Unknown error'}`);
        }
      }
    }
  }
);

export {
  runServer,
  type McpTool,
  type McpToolCreator,
  type ServerInstance
};

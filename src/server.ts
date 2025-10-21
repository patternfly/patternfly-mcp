import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { usePatternFlyDocsTool } from './tool.patternFlyDocs';
import { fetchDocsTool } from './tool.fetchDocs';
import { componentSchemasTool } from './tool.componentSchemas';
import { startHttpTransport, type HttpServerHandle } from './server.http';
import { memo } from './server.caching';
import { log, type LogEvent } from './logger';
import { createServerLogger } from './server.logger';
import { type GlobalOptions } from './options';
import {
  getOptions,
  getSessionOptions,
  runWithOptions,
  runWithSession
} from './options.context';
import { DEFAULT_OPTIONS } from './options.defaults';

type McpTool = [string, { description: string; inputSchema: any }, (args: any) => Promise<any>];

type McpToolCreator = (options?: GlobalOptions) => McpTool;

/**
 * Server options. Equivalent to GlobalOptions.
 */
type ServerOptions = GlobalOptions;

/**
 * Represents the configuration settings for a server.
 *
 * @interface ServerSettings
 *
 * @property {McpToolCreator[]} [tools] - An optional array of tool creators used by the server.
 * @property [enableSigint] - Indicates whether SIGINT signal handling is enabled.
 * @property [allowProcessExit] - Determines if the process is allowed to exit explicitly.
 */
interface ServerSettings {
  tools?: McpToolCreator[];
  enableSigint?: boolean;
  allowProcessExit?: boolean;
}

/**
 * Server log event.
 */
type ServerLogEvent = LogEvent;

/**
 * A handler function to subscribe to server logs. Automatically unsubscribed on server shutdown.
 *
 * @param {ServerLogEvent} entry
 */
type ServerOnLogHandler = (entry: ServerLogEvent) => void;

/**
 * Subscribes a handler function to server logs. Automatically unsubscribed on server shutdown.
 */
type ServerOnLog = (handler: ServerOnLogHandler) => () => void;

/**
 * Server instance with shutdown capability
 *
 * @property stop - Stops the server, gracefully.
 * @property isRunning - Indicates whether the server is running.
 * @property {ServerOnLog} onLog - Subscribes to server logs. Automatically unsubscribed on server shutdown.
 */
interface ServerInstance {
  stop(): Promise<void>;
  isRunning(): boolean;
  onLog: ServerOnLog;
}

/**
 * Create and run a server with shutdown, register tool and errors.
 *
 * @param [options] Server options
 * @param [settings] Server settings (tools, signal handling, etc.)
 * @param [settings.tools]
 * @param [settings.enableSigint]
 * @param [settings.allowProcessExit]
 * @returns Server instance
 */
const runServer = async (options: ServerOptions = getOptions(), {
  tools = [
    usePatternFlyDocsTool,
    fetchDocsTool,
    componentSchemasTool
  ],
  enableSigint = true,
  allowProcessExit = true
}: ServerSettings = {}): Promise<ServerInstance> => {
  const session = getSessionOptions();

  let server: McpServer | null = null;
  let transport: StdioServerTransport | null = null;
  let httpHandle: HttpServerHandle | null = null;
  let unsubscribeServerLogger: (() => void) | null = null;
  let running = false;
  let onLogSetup: ServerOnLog = () => () => {};

  const stopServer = async () => {
    log.info(`\n${options.name} server shutting down... `);

    if (server && running) {
      log.info(`${options.name} shutting down...`);

      if (httpHandle) {
        log.info('...closing HTTP transport');
        await httpHandle.close();
        httpHandle = null;
      }

      log.info('...closing Server');
      await server?.close();
      running = false;

      log.info(`${options.name} closed!\n`);
      unsubscribeServerLogger?.();

      if (allowProcessExit) {
        process.exit(0);
      }
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

    const subUnsub = createServerLogger.memo(server);

    if (subUnsub) {
      const { subscribe, unsubscribe } = subUnsub;

      // Track active logging subscriptions to clean up on stop()
      unsubscribeServerLogger = unsubscribe;

      // Setup server logging for external handlers
      onLogSetup = (handler: ServerOnLogHandler) => subscribe(handler);
    }

    tools.forEach(toolCreator => {
      const [name, schema, callback] = toolCreator(options);

      log.info(`Registered tool: ${name}`);
      server?.registerTool(name, schema, (args = {}) =>
        runWithSession(session, async () =>
          runWithOptions(options, async () => await callback(args))));
    });

    if (enableSigint) {
      process.on('SIGINT', () => {
        void stopServer();
      });
    }

    if (options.isHttp) {
      httpHandle = await startHttpTransport(server, options);
    } else {
      transport = new StdioServerTransport();
      await server.connect(transport);
    }

    if (!httpHandle && !transport) {
      throw new Error('No transport available');
    }

    log.info(`${options.name} server running on ${options.isHttp ? 'HTTP' : 'stdio'} transport`);
    running = true;
  } catch (error) {
    log.error(`Error creating ${options.name} server:`, error);
    throw error;
  }

  return {
    async stop(): Promise<void> {
      return await stopServer();
    },

    isRunning(): boolean {
      return running;
    },

    onLog(handler: ServerOnLogHandler): () => void {
      return onLogSetup(handler);
    }
  };
};

/**
 * Memoized version of runServer.
 * - Automatically cleans up servers when cache entries are rolled off (cache limit reached)
 * - Prevents port conflicts by returning the same server instance via memoization
 * - `onCacheRollout` closes servers that were rolled out of caching due to cache limit
 */
runServer.memo = memo(
  runServer,
  {
    ...DEFAULT_OPTIONS.resourceMemoOptions.default,
    debug: info => {
      log.debug(`Server memo: ${JSON.stringify(info, null, 2)}`);
    },
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
  type ServerInstance,
  type ServerLogEvent,
  type ServerOnLog,
  type ServerOnLogHandler,
  type ServerOptions,
  type ServerSettings
};

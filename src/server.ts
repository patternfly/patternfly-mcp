import { McpServer, type ResourceTemplate, type ResourceMetadata } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { usePatternFlyDocsTool } from './tool.patternFlyDocs';
import { searchPatternFlyDocsTool } from './tool.searchPatternFlyDocs';
import { componentSchemasTool } from './tool.componentSchemas';
import { patternFlyComponentsIndexResource } from './resource.patternFlyComponentsIndex';
import { patternFlyContextResource } from './resource.patternFlyContext';
import { patternFlyDocsIndexResource } from './resource.patternFlyDocsIndex';
import { patternFlyDocsTemplateResource } from './resource.patternFlyDocsTemplate';
import { patternFlySchemasIndexResource } from './resource.patternFlySchemasIndex';
import { patternFlySchemasTemplateResource } from './resource.patternFlySchemasTemplate';
import { startHttpTransport, type HttpServerHandle } from './server.http';
import { memo } from './server.caching';
import { log, type LogEvent } from './logger';
import { createServerLogger } from './server.logger';
import { composeTools, sendToolsHostShutdown } from './server.tools';
import { composeResources } from './server.resources';
import { type GlobalOptions } from './options';
import {
  getOptions,
  getSessionOptions,
  runWithOptions,
  runWithSession
} from './options.context';
import { DEFAULT_OPTIONS } from './options.defaults';
import { isZodRawShape, isZodSchema } from './server.schema';
import { isPlainObject, timeoutFunction } from './server.helpers';
import { createServerStats, type Stats } from './server.stats';
import { stat, type StatReport } from './stats';

/**
 * A tool registered with the MCP server.
 *
 * @note Use of `any` here is intentional as part of a pass-through policy around
 * `inputSchema`. Input schemas are actually reconstructed as part of the
 * tools-as-plugins architecture to help guarantee that a minimal tool schema is
 * always available and minimally valid.
 */
type McpTool = [
  name: string,
  schema: {
    description: string;
    inputSchema: any;
  },
  handler: (arg?: unknown) => any | Promise<any>
];

/**
 * A function that creates a tool registered with the MCP server.
 */
type McpToolCreator = ((options?: GlobalOptions) => McpTool) & { toolName?: string };

/**
 * A resource registered with the MCP server.
 */
type McpResource = [
  name: string,
  uriOrTemplate: string | ResourceTemplate,
  config: ResourceMetadata,
  handler: (...args: any[]) => any | Promise<any>
];

/**
 * A function that creates a resource registered with the MCP server.
 */
type McpResourceCreator = ((options?: GlobalOptions) => McpResource) & { resourceName?: string };

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
 * @property {McpResourceCreator[]} [resources] - An optional array of resource creators used by the server.
 * @property [enableSigint] - Indicates whether SIGINT signal handling is enabled.
 * @property [allowProcessExit] - Determines if the process is allowed to exit explicitly.
 */
interface ServerSettings {
  tools?: McpToolCreator[];
  resources?: McpResourceCreator[];
  enableSigint?: boolean;
  allowProcessExit?: boolean;
}

/**
 * Server stats.
 *
 * @alias Stats
 */
type ServerStats = Stats;

/**
 * Server stats report.
 *
 * @alias StatReport
 */
type ServerStatReport = StatReport;

/**
 * A callback to Promise return server stats.
 */
type ServerGetStats = () => Promise<ServerStats>;

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
 *
 * @param {ServerOnLogHandler} handler - The function responsible for handling server log events.
 * @returns A cleanup function that unregisters the logging handler when called.
 */
type ServerOnLog = (handler: ServerOnLogHandler) => () => void;

/**
 * Server instance with shutdown capability
 *
 * @property stop - Stops the server, gracefully.
 * @property isRunning - Indicates whether the server is running.
 * @property {ServerGetStats} getStats - Resolves server stats.
 * @property {ServerOnLog} onLog - Subscribes to server logs. Automatically unsubscribed on server shutdown.
 */
interface ServerInstance {
  stop(): Promise<void>;
  isRunning(): boolean;
  getStats: ServerGetStats;
  onLog: ServerOnLog;
}

/**
 * Built-in tools.
 *
 * Array of built-in tools
 */
const builtinTools: McpToolCreator[] = [
  usePatternFlyDocsTool,
  searchPatternFlyDocsTool,
  componentSchemasTool
];

/**
 * Built-in resources.
 *
 * Array of built-in resources
 */
const builtinResources: McpResourceCreator[] = [
  patternFlyContextResource,
  patternFlyComponentsIndexResource,
  patternFlyDocsIndexResource,
  patternFlyDocsTemplateResource,
  patternFlySchemasIndexResource,
  patternFlySchemasTemplateResource
];

/**
 * Create and run the MCP server, register tools, and return a handle.
 *
 *  - Built-in and inline tools are realized in-process
 *  - External plugins are realized in the Tools Host (child).
 *
 * @param [options] Server options
 * @param [settings] Server settings (tools, signal handling, etc.)
 * @param [settings.tools] - Built-in tools to register.
 * @param [settings.enableSigint] - Indicates whether SIGINT signal handling is enabled.
 * @param [settings.allowProcessExit] - Determines if the process is allowed to exit explicitly, useful for testing.
 * @param settings.resources
 * @returns Server instance with `stop()`, `getStats()` `isRunning()`, and `onLog()` subscription.
 */
const runServer = async (options: ServerOptions = getOptions(), {
  tools = builtinTools,
  resources = builtinResources,
  enableSigint = true,
  allowProcessExit = true
}: ServerSettings = {}): Promise<ServerInstance> => {
  const session = getSessionOptions();

  let server: McpServer | null = null;
  let transport: StdioServerTransport | null = null;
  let httpHandle: HttpServerHandle | null = null;
  let unsubscribeServerLogger: (() => void) | null = null;
  let unsubscribeServerStats: (() => void) | null = null;
  let sigintHandler: (() => void) | null = null;
  let running = false;
  let onLogSetup: ServerOnLog = () => () => {};
  let getStatsSetup: ServerGetStats = () => Promise.resolve({} as ServerStats);

  const stopServer = async () => {
    log.debug(`${options.name} attempting shutdown.`);

    if (server && running) {
      log.info(`${options.name} shutting down...`);

      if (httpHandle) {
        log.debug('...closing HTTP transport');
        await httpHandle.close();
        httpHandle = null;
      }

      if (sigintHandler) {
        process.off('SIGINT', sigintHandler);
        sigintHandler = null;
      }

      log.debug('...closing Server');
      await server?.close();
      running = false;

      await sendToolsHostShutdown();

      log.info(`${options.name} closed!\n`);
      unsubscribeServerLogger?.();
      unsubscribeServerStats?.();

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
          resources: {},
          completions: {},
          ...(enableProtocolLogging ? { logging: {} } : {})
        }
      }
    );

    // Setup server logging.
    const loggerSubUnsub = createServerLogger.memo(server);

    log.info(`Server logging enabled.`);

    if (options?.logging?.stderr === undefined || enableProtocolLogging === undefined) {
      log.debug(
        `${options.name} server logging enabled with partial flags`,
        `isStderr = ${options?.logging?.stderr !== undefined}`,
        `isProtocol = ${enableProtocolLogging !== undefined};`
      );
    }

    const statsTracker = createServerStats();

    log.info(`Server stats enabled.`);

    // Compose resources after logging is set up.
    const updatedResources = await composeResources(resources);

    // Combine built-in tools with custom ones after logging is set up.
    const updatedTools = await composeTools(tools);

    if (loggerSubUnsub) {
      const { subscribe, unsubscribe } = loggerSubUnsub;

      // Track active logging subscriptions to clean up on stop()
      unsubscribeServerLogger = unsubscribe;

      // Setup server logging for external handlers
      onLogSetup = (handler: ServerOnLogHandler) => subscribe(handler);
    }

    if (statsTracker) {
      // Track active stat subscriptions to clean up on stop()
      unsubscribeServerStats = statsTracker.unsubscribe;

      // Setup server stats for external handlers
      getStatsSetup = () => statsTracker.getStats();
    }

    updatedResources.forEach(resourceCreator => {
      const [name, uri, config, callback] = resourceCreator(options);

      log.info(`Registered resource: ${name}`);

      // Note: uri is being cast as any to bypass a type mismatch introduced at the MCP SDK level. Rereview when SDK is updated.
      server?.registerResource(name, uri as any, config, (...args: unknown[]) =>
        runWithSession(session, async () =>
          runWithOptions(options, async () => {
            log.debug(
              `Running resource "${name}"`,
              `isArgs = ${args?.length > 0}`
            );

            const timedReport = stat.traffic();
            const resourceResult = await callback(...args);

            timedReport({ resource: name });

            return resourceResult;
          })));
    });

    updatedTools.forEach(toolCreator => {
      const [name, schema, callback] = toolCreator(options);
      // Do NOT normalize schemas here. This is by design and is a fallback check for malformed schemas.
      const isZod = isZodSchema(schema?.inputSchema) || isZodRawShape(schema?.inputSchema);
      const isSchemaDefined = schema?.inputSchema !== undefined;

      log.info(`Registered tool: ${name}`);

      if (!isZod) {
        log.warn(`Tool "${name}" has a non Zod inputSchema. This may cause unexpected issues.`);
        log.debug(
          `Tool "${name}" has received a non Zod inputSchema from the tool pipeline.`,
          `This will cause unexpected issues, such as failure to pass arguments.`,
          `MCP SDK requires Zod. Kneel before Zod.`
        );
      }

      // Lightweight check for malformed schemas that bypass validation.
      const isContextLike = (value: unknown) => isPlainObject(value) && 'requestId' in value && 'signal' in value;

      server?.registerTool(name, schema, (args: unknown = {}, ..._args: unknown[]) =>
        runWithSession(session, async () =>
          runWithOptions(options, async () => {
            // Basic track for remaining args to account for future MCP SDK alterations.
            log.debug(
              `Running tool "${name}"`,
              `isArgs = ${args !== undefined}`,
              `isRemainingArgs = ${_args?.length > 0}`
            );

            const timedReport = stat.traffic();
            const isContextLikeArgs = isContextLike(args);

            // Log potential Zod validation errors triggered by context fail.
            if (isContextLikeArgs) {
              log.debug(
                `Tool "${name}" handler received a context like object as the first parameter.`,
                'If this is unexpected this is likely an undefined schema or a schema not registering as Zod.',
                'Review the related schema definition and ensure it is defined and valid.',
                `Schema is Defined = ${isSchemaDefined}; Schema is Zod = ${isZod}; Context like = ${isContextLikeArgs};`
              );
            }

            const toolResult = await callback(args);

            timedReport({ tool: name });

            return toolResult;
          })));
    });

    if (enableSigint && !sigintHandler) {
      sigintHandler = () => {
        void stopServer();
      };
      process.on('SIGINT', sigintHandler);
    }

    if (options.isHttp) {
      httpHandle = await startHttpTransport(server, options);
    } else {
      transport = new StdioServerTransport();

      await timeoutFunction(
        server.connect(transport),
        {
          errorMessage: 'Transport connection timed out.'
        }
      );
    }

    if (!httpHandle && !transport) {
      throw new Error('No transport available');
    }

    running = true;
    log.info(`${options.name} server running on ${options.isHttp ? 'HTTP' : 'stdio'} transport`);
    statsTracker.setStats(httpHandle);
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

    async getStats(): Promise<ServerStats> {
      return await getStatsSetup();
    },

    onLog(handler: ServerOnLogHandler): () => void {
      // Simple one-off log event to notify the handler of the server startup.
      handler({ level: 'info', msg: `${options.name} running!`, transport: options.logging?.transport } as LogEvent);

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
              // Avoid engaging the contextual log channel on rollout.
              console.error(`Error stopping server: ${error}`);
            }
          }
        } else {
          // Avoid engaging the contextual log channel on rollout.
          console.error(`Error cleaning up server: ${result?.reason?.message || result?.reason || 'Unknown error'}`);
        }
      }
    }
  }
);

export {
  runServer,
  builtinTools,
  type McpTool,
  type McpToolCreator,
  type McpResource,
  type McpResourceCreator,
  type ServerInstance,
  type ServerLogEvent,
  type ServerOnLog,
  type ServerOnLogHandler,
  type ServerOptions,
  type ServerSettings,
  type ServerStatReport,
  type ServerStats,
  type ServerGetStats
};

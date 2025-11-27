import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type LoggingLevel } from '@modelcontextprotocol/sdk/types.js';
import { getOptions } from './options.context';
import { type GlobalOptions } from './options';
import { createLogger, logSeverity, subscribeToChannel, type LogEvent, type LogLevel } from './logger';
import { memo } from './server.caching';

type McpLoggingLevel = LoggingLevel;

/**
 * Convert a log level to an MCP-compatible level.
 *
 * @param {LogLevel} level
 */
const toMcpLevel = (level: LogLevel): McpLoggingLevel => {
  switch (level) {
    case 'debug':
      return 'debug';
    case 'info':
      return 'info';
    case 'warn':
      return 'warning';
    case 'error':
    default:
      return 'error';
  }
};

/**
 * Register a handler that forwards log events to connected MCP clients.
 *
 * - This requires the server to advertise `capabilities.logging`.
 * - Event is fire-and-forget, swallow errors to avoid affecting app flow
 *
 * @param {McpServer} server - MCP server instance
 * @param {GlobalOptions} options
 * @returns Unsubscribe function to remove the subscriber.
 */
const registerMcpSubscriber = (server: McpServer, { logging, name }: GlobalOptions) =>
  subscribeToChannel((event: LogEvent) => {
    if (logSeverity(event.level) < logSeverity(logging?.level)) {
      return;
    }

    const updatedMsg = event.msg && event?.args?.length ? { message: event.msg, args: event.args } : undefined;
    const data = updatedMsg || event.msg || event.args || {};

    try {
      void server
        .sendLoggingMessage({ level: toMcpLevel(event.level), logger: name, data })
        .catch(() => {});
    } catch {}
  });

/**
 * Create a logger for the server instance.
 *
 * @param {McpServer} server
 * @param {GlobalOptions} options
 */
const createServerLogger = (server: McpServer, options: GlobalOptions = getOptions()) => {
  const unsubscribeLoggerFuncs: (() => boolean | void)[] = [];

  if (options?.logging?.channelName) {
    // Register the diagnostics channel returns a function to unsubscribe
    unsubscribeLoggerFuncs.push(createLogger(options.logging));

    if (options.logging.protocol) {
      unsubscribeLoggerFuncs.push(registerMcpSubscriber(server, options));
    }
  }

  return () => unsubscribeLoggerFuncs.forEach(unsubscribe => unsubscribe());
};

/**
 * Memoize the server logger.
 */
createServerLogger.memo = memo(createServerLogger, { cacheLimit: 10 });

export { createServerLogger, registerMcpSubscriber, toMcpLevel, type McpLoggingLevel };

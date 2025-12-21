import { channel, unsubscribe, subscribe } from 'node:diagnostics_channel';
import { inspect } from 'node:util';
import { type LoggingSession } from './options.defaults';
import { getLoggerOptions } from './options.context';

type LogLevel = LoggingSession['level'];

/**
 * Unsubscribe function returned by `subscribeToChannel`.
 *
 * @note We purposefully don't handle the return `boolean` given by `diagnostics_channel.unsubscribe`. The `unsubscribe`
 * returns a function that returns a boolean indicating whether the subscription was successfully removed.
 * https://nodejs.org/api/diagnostics_channel.html#diagnostics_channel_channel_unsubscribe_listener
 */
type Unsubscribe = () => void;

/**
 * Log an event with detailed information about a specific action.
 *
 * @interface LogEvent
 * @property {LogLevel} level - Severity level of the event.
 * @property [msg] - Optional Message providing context or description of the event.
 * @property [args] - Optional additional arguments associated with the event.
 * @property [fields] - Optional key-value pairs for metadata associated with the event.
 * @property time - Event timestamp in epoch milliseconds.
 * @property [source] - Name of the module or subsystem generating the event, if available.
 * @property {LoggingSession['transport']} [transport] - Transport configuration used for this event.
 */
interface LogEvent {
  level: LogLevel;
  msg?: string;
  args?: unknown[];
  fields?: Record<string, unknown>;
  time: number; // epoch ms
  source?: string; // optional module/subsystem name
  transport?: LoggingSession['transport'];
}

/**
 * Log level ordering used for filtering. Levels are ordered specifically from the least to the most severe.
 */
const LOG_LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];

/**
 * Convert a severity level to a numeric representation from `LogLevel[]`.
 *
 * @param level - The log level to evaluate.
 * @returns Numeric index corresponding to `LogLevel[]` Returns
 *     -1 if the level is not found.
 */
const logSeverity = (level: unknown): number =>
  LOG_LEVELS.indexOf(level as LogLevel);

/**
 * Basic string HARD truncate.
 *
 * - Passing a non-string returns the original value.
 * - Suffix length is counted against `max`. If `suffix.length >= max`, only
 *    `suffix` is returned, which may exceed the set `max`.
 *
 * @param str
 * @param options
 * @param options.max
 * @param options.suffix - Appended suffix string. Suffix length is counted against max length.
 * @returns Truncated string, or the suffix only, or the original string, or the original non-string value.
 */
const truncate = (str: string, { max = 250, suffix = '...[truncated]' }: { max?: number, suffix?: string } = {}) => {
  if (typeof str === 'string') {
    const updatedMax = Math.max(0, max - suffix.length);

    if (updatedMax <= 0) {
      return suffix;
    }

    return str.length > updatedMax ? `${str.slice(0, updatedMax)}${suffix}` : str;
  }

  return str;
};

/**
 * Format an unknown value as a string, for logging.
 *
 * @param value
 * @returns Formatted string
 */
const formatUnknownError = (value: unknown): string => {
  if (value instanceof Error) {
    const message = value.stack || value.message;

    if (message) {
      return message;
    }

    try {
      return String(value);
    } catch {
      return Object.prototype.toString.call(value);
    }
  }

  if (typeof value === 'string') {
    return value;
  }

  try {
    return `Non-Error thrown: ${truncate(JSON.stringify(value))}`;
  } catch {
    try {
      return truncate(inspect(value, { depth: 3, maxArrayLength: 50, breakLength: 120 }));
    } catch {
      return Object.prototype.toString.call(value);
    }
  }
};

/**
 * Publish a structured log event to the diagnostics channel.
 *
 * @param level - Log level for the event
 * @param {LoggingSession} [options]
 * @param [msg] - Optional log message (string) or first argument
 * @param [args] - Optional additional arguments for the log event
 */
const publish = (level: LogLevel, options: LoggingSession = getLoggerOptions(), msg?: unknown, ...args: unknown[]) => {
  const channelName = options?.channelName;
  const timestamp = Date.now();
  const event: LogEvent = { level, time: timestamp };

  // If first arg is a string, treat it as the message and capture rest as args
  if (typeof msg === 'string') {
    event.msg = msg;

    if (args.length) {
      event.args = args;
    }
  } else {
    const arr = [msg, ...args].filter(value => value !== undefined);

    if (arr.length) {
      event.args = arr as unknown[];
    }
  }

  event.transport = options?.transport;

  if (channelName) {
    channel(channelName).publish(event);
  }
};

/**
 * Console-like API for publishing structured log events to the diagnostics channel.
 *
 * @property debug Logs messages with 'debug' level.
 * @property info Logs messages with 'info' level.
 * @property warn Logs messages with 'warn' level.
 * @property error Logs messages with 'error' level.
 */
const log = {
  debug: (msg?: unknown, ...args: unknown[]) => {
    const options = getLoggerOptions();

    return publish('debug', options, msg, ...args);
  },
  info: (msg?: unknown, ...args: unknown[]) => {
    const options = getLoggerOptions();

    return publish('info', options, msg, ...args);
  },
  warn: (msg?: unknown, ...args: unknown[]) => {
    const options = getLoggerOptions();

    return publish('warn', options, msg, ...args);
  },
  error: (msg?: unknown, ...args: unknown[]) => {
    const options = getLoggerOptions();

    return publish('error', options, msg, ...args);
  }
};

/**
 * Subscribe to the diagnostics channel and invoke a handler for each event.
 *
 * If the event doesn't contain a valid `level` property, the handler is not invoked.
 *
 * @param handler - Callback function to handle log events
 * @param {LoggingSession} [options]
 * @returns Function to unsubscribe from the log channel
 */
const subscribeToChannel = (
  handler: (message: LogEvent) => void,
  options: LoggingSession = getLoggerOptions()
): Unsubscribe => {
  const channelName = options?.channelName;

  if (!channelName) {
    throw new Error('subscribeToChannel called without a configured logging channelName');
  }

  const updatedHandler = (event: LogEvent) => {
    if (!event?.level) {
      return;
    }

    try {
      handler.call(null, event);
    } catch (error) {
      log.debug('Error invoking logging subscriber', event, error);
    }
  };

  subscribe(channelName, updatedHandler as (message: unknown) => void);

  return () => {
    unsubscribe(channelName, updatedHandler as (message: unknown) => void);
  };
};

/**
 * Register a handler that writes formatted log lines to `process.stderr`.
 *
 * Writes strictly to stderr to avoid corrupting STDIO with stdout.
 *
 * @param {LoggingSession} options
 * @param [formatter] - Optional custom formatter for log events. Default prints: `[LEVEL] msg ...args`
 * @returns Unsubscribe function to remove the subscriber
 */
const registerStderrSubscriber = (options: LoggingSession, formatter?: (e: LogEvent) => string): Unsubscribe => {
  const format = formatter || ((event: LogEvent) => {
    const eventLevel = `[${event.level.toUpperCase()}]`;
    const message = event.msg || '';
    const rest = event?.args?.map(arg => {
      try {
        return typeof arg === 'string' ? arg : JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    }).join(' ') || '';
    const separator = rest ? '\t:' : '';

    return `${eventLevel}: ${message}${separator}${rest}`.trim();
  });

  return subscribeToChannel((event: LogEvent) => {
    if (logSeverity(event.level) >= logSeverity(options.level)) {
      process.stderr.write(`${format(event)}\n`);
    }
  });
};

/**
 * Creates a logger initialization function and supports registering logging subscribers.
 *
 * @param {LoggingSession} [options]
 * @returns Unsubscribe function to remove all registered subscribers
 */
const createLogger = (options: LoggingSession = getLoggerOptions()): Unsubscribe => {
  const unsubscribeLoggerFuncs: Unsubscribe[] = [];

  if (options?.channelName && options?.stderr) {
    unsubscribeLoggerFuncs.push(registerStderrSubscriber(options));
  }

  return () => {
    unsubscribeLoggerFuncs.forEach(unsubscribe => {
      try {
        unsubscribe();
      } catch (error) {
        log.debug('Error unsubscribing from diagnostics channel', error);
      }
    });

    unsubscribeLoggerFuncs.length = 0;
  };
};

export {
  LOG_LEVELS,
  createLogger,
  formatUnknownError,
  log,
  logSeverity,
  publish,
  registerStderrSubscriber,
  subscribeToChannel,
  truncate,
  type LogEvent,
  type LogLevel,
  type Unsubscribe
};

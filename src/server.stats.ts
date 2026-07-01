import {
  getOptions,
  getStatsOptions
} from './options.context';
import { type HttpServerHandle } from './server.http';
import { publish, type StatReport } from './stats';
import { DEFAULT_OPTIONS, type StatsSession } from './options.defaults';
import { deferTask, type DeferTaskHandle } from './server.task';

/**
 * Transport-specific telemetry report.
 *
 * @interface TransportReport
 */
interface TransportReport extends StatReport {
  type: 'transport';
  method: 'stdio' | 'http';
  port?: number;
}

/**
 * Server stats.
 *
 * @interface Stats
 * @property {string} timestamp - Timestamp of the server stats.
 * @property reports - Object containing various server telemetry reports.
 * @property {TransportReport} reports.transport - Transport-specific telemetry report.
 * @property reports.health - Server health metrics (e.g., memory usage and uptime).
 * @property reports.traffic - Event-driven traffic metric (e.g., tool/resource execution).
 */
interface Stats {
  timestamp: string;
  reports: {
    transport: TransportReport & { channelId: string };
    health: { channelId: string };
    traffic: { channelId: string };
  };
}

/**
 * Reports server health metrics (e.g., memory usage and uptime).
 *
 * @param statsOptions - Session-specific stats options.
 */
const healthReport = (statsOptions: StatsSession) => {
  publish('health', {
    memory: process.memoryUsage(),
    uptime: process.uptime()
  }, statsOptions);
};

/**
 * Task for `healthReport`.
 *
 * @note `undefined` repeat means the task will run indefinitely.
 */
healthReport.deferTask = deferTask(healthReport, {
  intervalMs: DEFAULT_OPTIONS.stats.reportIntervalMs.health,
  repeat: undefined
});

/**
 * Creates a server stats report object.
 *
 * @param params - Report parameters.
 * @param params.httpPort - HTTP server port if available.
 * @param statsOptions - Session-specific stats options.
 * @returns {Stats} - Server stats and channel IDs.
 */
const statsReport = ({ httpPort }: { httpPort?: number | undefined } = {}, statsOptions: StatsSession): Stats => ({
  timestamp: new Date().toISOString(),
  reports: {
    transport: {
      type: 'transport',
      timestamp: new Date().toISOString(),
      method: httpPort ? 'http' : 'stdio',
      ...(httpPort ? { port: httpPort } : {}),
      channelId: statsOptions.channels.transport
    },
    health: { channelId: statsOptions.channels.health },
    traffic: { channelId: statsOptions.channels.traffic }
  }
});

/**
 * Reports server transport metrics (e.g., HTTP server port).
 *
 * @param params - Report parameters.
 * @param params.httpPort - HTTP server port if available.
 * @param statsOptions - Session-specific stats options.
 */
const transportReport = (
  { httpPort }: { httpPort?: number | undefined } = {},
  statsOptions: StatsSession
) => {
  publish('transport', {
    method: httpPort ? 'http' : 'stdio',
    port: httpPort
  }, statsOptions);
};

/**
 * Task for `transportReport`.
 *
 * @note `undefined` repeat means the task will run indefinitely.
 */
transportReport.deferTask = deferTask(transportReport, {
  intervalMs: DEFAULT_OPTIONS.stats.reportIntervalMs.transport,
  repeat: undefined
});

/**
 * Creates a telemetry tracker for a server instance.
 *
 * @param {StatsSession} [statsOptions] - Session-specific stats options.
 * @param {GlobalOptions} [options] - Global server options.
 * @returns - An object with methods to manage server telemetry:
 *  - `getStats`: Resolve server stats and channel IDs.
 *  - `startStats`: Start health and transport report timers.
 *  - `unsubscribe`: Cleans up timers and resources.
 */
const createServerStats = (statsOptions = getStatsOptions(), options = getOptions()) => {
  let healthTask: DeferTaskHandle<void>;
  let transportTask: DeferTaskHandle<void> | undefined;

  let resolveStatsPromise: (value: Stats) => void;

  const statsPromise: Promise<Stats> = new Promise(resolve => {
    resolveStatsPromise = resolve;
  });

  return {

    /**
     * Returns the server stats and channel IDs.
     *
     * @returns {Promise<Stats>} - Server stats and channel IDs.
     */
    getStats: (): Promise<Stats> => statsPromise,

    /**
     * Starts health and transport report timers and resolves stats.
     *
     * @param {HttpServerHandle} [httpHandle] - Handle for the HTTP server if available.
     */
    startStats: (httpHandle?: HttpServerHandle | null) => {
      const httpPort = options.isHttp ? httpHandle?.port : undefined;
      const stats = statsReport({ httpPort }, statsOptions);

      // Start the health report. Defining repeat as undefined keeps the loop infinite.
      healthTask = healthReport.deferTask(statsOptions);

      // Start the transport report. Defining repeat as undefined keeps the loop infinite.
      transportTask = transportReport.deferTask({ httpPort }, statsOptions);

      void healthTask.start();
      void transportTask.start();

      resolveStatsPromise(stats);
    },

    /**
     * Cleans up timers and resources.
     */
    unsubscribe: async () => Promise.allSettled([healthTask?.stop(), transportTask?.stop()])
  };
};

export { createServerStats, healthReport, statsReport, transportReport, type Stats };

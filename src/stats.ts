import { channel } from 'node:diagnostics_channel';
import { getStatsOptions } from './options.context';
import { type StatsSession } from './options.defaults';

/**
 * Valid report types for server statistics.
 */
type StatReportType = 'transport' | 'health' | 'traffic' | 'session';

/**
 * Base interface for all telemetry reports.
 */
interface StatReport {
  type: StatReportType;
  timestamp: string;
  [key: string]: unknown;
}

/**
 * Publishes a structured report to a faceted diagnostics channel if there is an active subscriber.
 *
 * @param type - The facet/type of the report (e.g., 'health').
 * @param data - Telemetry payload.
 * @param {StatsSession} [options] - Session options.
 */
const publish = (type: StatReportType, data: Record<string, unknown>, options: StatsSession = getStatsOptions()) => {
  const channelName = options.channels[type];
  const setChannel = channel(channelName);

  if (setChannel.hasSubscribers) {
    setChannel.publish({
      type,
      timestamp: new Date().toISOString(),
      ...data
    });
  }
};

/**
 * Creates a timed report that tracks the duration of an event without needing
 * to manually track the start time.
 *
 * - You can override the start time by passing a `start` property in the report data.
 *
 * @param type - The facet/type of the timed report (e.g., 'traffic').
 * @param {StatsSession} [options] - Session options.
 */
const timedReport = (type: StatReportType, options: StatsSession = getStatsOptions()) => {
  let start: number = 0;

  return {
    start: () => start = Date.now(),
    report: (data: Record<string, unknown>) => {
      const updatedStart = typeof data.start === 'number' ? data.start : start;
      const duration = Date.now() - updatedStart;
      const updatedData = { ...data, duration: duration > 0 ? duration : 0 };

      publish(type, updatedData, options);
    }
  };
};

/**
 * Console-like API for publishing structured stats to the diagnostics channel.
 *
 * @property traffic Records an event-driven traffic metric (e.g., tool/resource execution).
 */
const stat = {

  /**
   * Call the function to `start` a traffic report.
   *
   * - Call `traffic` to `start` the timed report.
   * - Close the returned `report` by calling the returned callback with the traffic metrics.
   *
   * @returns Callback function to report traffic metrics.
   */
  traffic: () => {
    const { start, report: statReport } = timedReport('traffic');

    start();

    return statReport;
  }
};

export {
  publish,
  stat,
  timedReport,
  type StatReport,
  type StatReportType
};

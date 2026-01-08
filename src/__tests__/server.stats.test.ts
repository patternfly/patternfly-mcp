import diagnostics_channel from 'node:diagnostics_channel';
import { healthReport, statsReport, transportReport, createServerStats } from '../server.stats';
import { getStatsOptions } from '../options.context';

describe('healthReport', () => {
  const statsOptions = getStatsOptions();

  it('should generate a health report', () => {
    const type = 'health';
    const channelName = statsOptions.channels[type];
    const channel = diagnostics_channel.channel(channelName);
    const handler = jest.fn();

    channel.subscribe(handler);

    const report = healthReport(statsOptions);

    expect(Object.keys(handler.mock.calls[0][0])).toEqual(expect.arrayContaining(['timestamp', 'type', 'memory', 'uptime']));

    clearTimeout(report);
  });
});

describe('statsReport', () => {
  const statsOptions = getStatsOptions();

  it.each([
    { description: 'stdio', httpPort: undefined },
    { description: 'http', httpPort: 3030 }
  ])('should generate a stats report, $description', ({ httpPort }) => {
    const report = statsReport({ httpPort }, statsOptions);

    expect(Object.keys(report)).toEqual(expect.arrayContaining(['timestamp', 'reports']));
    expect(Object.keys(report.reports.transport).includes('port')).toBe(httpPort !== undefined);

    expect(report.reports.transport.channelId).toBe(statsOptions.channels.transport);
    expect(report.reports.health.channelId).toBe(statsOptions.channels.health);
    expect(report.reports.traffic.channelId).toBe(statsOptions.channels.traffic);
  });
});

describe('transportReport', () => {
  const statsOptions = getStatsOptions();

  it('should generate a transport report', () => {
    const type = 'transport';
    const channelName = statsOptions.channels[type];
    const channel = diagnostics_channel.channel(channelName);
    const handler = jest.fn();

    channel.subscribe(handler);

    const report = transportReport({ httpPort: 9999 }, statsOptions);

    expect(Object.keys(handler.mock.calls[0][0])).toEqual(expect.arrayContaining(['timestamp', 'type', 'method', 'port']));

    clearTimeout(report);
  });
});

describe('createServerStats', () => {
  const statsOptions = getStatsOptions();

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should resolve stats promise after setStats is called', async () => {
    const tracker = createServerStats(statsOptions, { isHttp: true } as any);
    const httpHandle = { port: 9999, close: jest.fn() };

    tracker.setStats(httpHandle as any);

    const stats = await tracker.getStats();

    expect(stats.reports.transport.port).toBe(9999);
    expect(stats.reports.transport.method).toBe('http');

    tracker.unsubscribe();
  });

  it('should correctly clean up timers on unsubscribe', () => {
    const tracker = createServerStats();
    const spy = jest.spyOn(global, 'clearTimeout');

    tracker.unsubscribe();

    expect(spy).toHaveBeenCalledTimes(1);
  });
});

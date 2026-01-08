import diagnostics_channel from 'node:diagnostics_channel';
import { getStatsOptions } from '../options.context';
import { publish, stat, timedReport, type StatReportType } from '../stats';

describe('publish', () => {
  const statsOptions = getStatsOptions();

  it.each([
    {
      description: 'health channel',
      type: 'health',
      data: { memory: 1024 }
    },
    {
      description: 'traffic channel',
      type: 'traffic',
      data: { tool: 'test-tool', duration: 100 }
    },
    {
      description: 'transport channel',
      type: 'transport',
      data: { method: 'http', port: 8080 }
    }
  ])('should publish to the correct channel when subscribers exist: $description', ({ type, data }) => {
    const channelName = statsOptions.channels[type as StatReportType];
    const channel = diagnostics_channel.channel(channelName);
    const handler = jest.fn();

    channel.subscribe(handler);
    publish(type as any, data);

    expect(handler.mock.calls[0][0]).toEqual(expect.objectContaining(data));

    channel.unsubscribe(handler);
  });

  it('should not throw if no subscribers exist', () => {
    expect(() => publish('health', { foo: 'bar' })).not.toThrow();
  });
});

describe('timedReport', () => {
  const statsOptions = getStatsOptions();

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should calculate duration correctly', async () => {
    const duration = 11;
    const type = 'traffic';
    const channelName = statsOptions.channels[type];
    const channel = diagnostics_channel.channel(channelName);
    const handler = jest.fn();

    channel.subscribe(handler);

    const tracker = timedReport(type);

    tracker.start();

    jest.advanceTimersByTime(duration);

    tracker.report({ tool: 'delayed-tool' });

    expect(handler.mock.calls[0][0]).toEqual(expect.objectContaining({
      tool: 'delayed-tool',
      duration
    }));

    channel.unsubscribe(handler);
  });

  it('should allow overriding start time via data', () => {
    const duration = 11;
    const type = 'traffic';
    const channelName = statsOptions.channels[type];
    const channel = diagnostics_channel.channel(channelName);
    const handler = jest.fn();

    channel.subscribe(handler);

    const tracker = timedReport(type);

    tracker.start();

    jest.advanceTimersByTime(duration);

    tracker.report({ tool: 'delayed-tool', start: Date.now() });

    expect(handler.mock.calls[0][0]).toEqual(expect.objectContaining({
      tool: 'delayed-tool',
      duration: 0
    }));

    channel.unsubscribe(handler);
  });
});

describe('stat', () => {
  const statsOptions = getStatsOptions();

  it('should provide a console-like method for traffic', () => {
    const channelName = statsOptions.channels.traffic;
    const channel = diagnostics_channel.channel(channelName);
    const handler = jest.fn();

    channel.subscribe(handler);

    const report = stat.traffic();

    report({ tool: 'console-tool' });

    expect(handler.mock.calls[0][0]).toEqual(expect.objectContaining({
      type: 'traffic',
      tool: 'console-tool',
      duration: 0
    }));

    channel.unsubscribe(handler);
  });
});

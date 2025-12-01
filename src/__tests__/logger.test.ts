import diagnostics_channel from 'node:diagnostics_channel';
import { setOptions, getLoggerOptions } from '../options.context';
import { logSeverity, publish, subscribeToChannel, registerStderrSubscriber, createLogger } from '../logger';

describe('logSeverity', () => {
  it.each([
    {
      description: 'default',
      param: undefined
    },
    {
      description: 'debug',
      param: 'debug'
    },
    {
      description: 'info',
      param: 'info'
    },
    {
      description: 'warn',
      param: 'warn'
    },
    {
      description: 'error',
      param: 'error'
    }
  ])('should return log severity, $description', ({ param }) => {
    expect(logSeverity(param as any)).toMatchSnapshot();
  });
});

describe('publish', () => {
  let channelSpy: jest.SpyInstance;
  const mockPublish = jest.fn();

  beforeEach(() => {
    jest.useFakeTimers(); // Use modern fake timers
    jest.setSystemTime(new Date('2025-11-01T00:00:00Z'));
    channelSpy = jest.spyOn(diagnostics_channel, 'channel');
    channelSpy.mockImplementation(() => ({ publish: mockPublish }));
  });

  afterEach(() => {
    mockPublish.mockClear();
    channelSpy.mockRestore();
    jest.useRealTimers();
  });

  it.each([
    {
      description: 'default',
      level: undefined,
      options: undefined,
      msg: undefined,
      args: []
    },
    {
      description: 'level',
      level: 'info',
      options: undefined,
      msg: undefined,
      args: []
    },
    {
      description: 'msg',
      level: 'info',
      options: undefined,
      msg: 'lorem ipsum, info',
      args: []
    },
    {
      description: 'args',
      level: 'info',
      options: undefined,
      msg: 'lorem ipsum, info',
      args: ['dolor', 'sit', 'amet']
    },
    {
      description: 'channel name',
      level: 'info',
      options: { channelName: 'custom-channel' },
      msg: 'lorem ipsum, info',
      args: ['dolor', 'sit', 'amet']
    }
  ])('should attempt to create a log entry, $description', ({ level, options, msg, args }) => {
    publish(level as any, options as any, msg, ...args);

    expect({
      channel: channelSpy.mock.calls,
      publish: mockPublish.mock.calls
    }).toMatchSnapshot();
  });
});

describe('subscribeToChannel', () => {
  let subscribeSpy: jest.SpyInstance;
  let unsubscribeSpy: jest.SpyInstance;

  beforeEach(() => {
    subscribeSpy = jest.spyOn(diagnostics_channel, 'subscribe');
    unsubscribeSpy = jest.spyOn(diagnostics_channel, 'unsubscribe');
  });

  afterEach(() => {
    subscribeSpy.mockRestore();
    unsubscribeSpy.mockRestore();
  });

  it('should attempt to subscribe and unsubscribe from a channel', () => {
    const handler = jest.fn();
    const unsubscribe = subscribeToChannel(handler);

    unsubscribe();

    expect({
      subscribe: subscribeSpy.mock.calls,
      unsubscribe: unsubscribeSpy.mock.calls
    }).toMatchSnapshot('subscribe');
  });

  it('should throw an error attempting to subscribe and unsubscribe from a channel', () => {
    expect(() => subscribeToChannel(jest.fn(), { channelName: undefined } as any))
      .toThrowErrorMatchingSnapshot('missing channel name');
  });
});

describe('registerStderrSubscriber', () => {
  let subscribeSpy: jest.SpyInstance;
  let unsubscribeSpy: jest.SpyInstance;

  beforeEach(() => {
    setOptions({});
    subscribeSpy = jest.spyOn(diagnostics_channel, 'subscribe');
    unsubscribeSpy = jest.spyOn(diagnostics_channel, 'unsubscribe');
  });

  afterEach(() => {
    subscribeSpy.mockRestore();
    unsubscribeSpy.mockRestore();
  });

  it('should attempt to subscribe and unsubscribe from a channel', () => {
    const unsubscribe = registerStderrSubscriber({ channelName: 'loremIpsum', level: 'info' } as any);

    unsubscribe();

    expect({
      subscribe: subscribeSpy.mock.calls,
      unsubscribe: unsubscribeSpy.mock.calls
    }).toMatchSnapshot('subscribe');
  });

  it('should activate stderr subscriber writes only at or above level', () => {
    setOptions({ logging: { stderr: true, level: 'info' } as any });

    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true as any);

    const unsubscribe = registerStderrSubscriber(getLoggerOptions());
    publish('debug', getLoggerOptions(), 'debug suppressed');
    publish('info', getLoggerOptions(), 'lorem ipsum', 123, { a: 1 });

    expect(stderrSpy.mock.calls).toMatchSnapshot('stderr');

    unsubscribe();
    stderrSpy.mockRestore();
  });
});

describe('createLogger', () => {
  let subscribeSpy: jest.SpyInstance;
  let unsubscribeSpy: jest.SpyInstance;

  beforeEach(() => {
    setOptions({});
    subscribeSpy = jest.spyOn(diagnostics_channel, 'subscribe');
    unsubscribeSpy = jest.spyOn(diagnostics_channel, 'unsubscribe');
  });

  afterEach(() => {
    subscribeSpy.mockRestore();
    unsubscribeSpy.mockRestore();
  });

  it.each([
    {
      description: 'with stderr, and emulated channel to pass checks',
      channelName: 'loremIpsum',
      stderr: true
    },
    {
      description: 'with no logging options',
      channelName: undefined,
      stderr: false
    }
  ])('should attempt to subscribe and unsubscribe from a channel, $description', ({ channelName, stderr }) => {
    // Use channelName to pass conditions
    const unsubscribe = createLogger({ channelName, stderr } as any);

    unsubscribe();

    expect({
      subscribe: subscribeSpy.mock.calls,
      unsubscribe: unsubscribeSpy.mock.calls
    }).toMatchSnapshot('subscribe');
  });

  it('should activate stderr subscriber writes only at or above level', () => {
    setOptions({ logging: { stderr: true, level: 'info' } as any });

    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true as any);

    const unsubscribe = createLogger(getLoggerOptions());
    publish('debug', getLoggerOptions(), 'debug suppressed');
    publish('info', getLoggerOptions(), 'lorem ipsum', 123, { a: 1 });

    expect(stderrSpy.mock.calls).toMatchSnapshot('stderr');

    unsubscribe();
    stderrSpy.mockRestore();
  });
});

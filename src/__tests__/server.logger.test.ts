import diagnostics_channel from 'node:diagnostics_channel';
import { getLoggerOptions, setOptions } from '../options.context';
import { toMcpLevel, registerMcpSubscriber, createServerLogger } from '../server.logger';
import { log } from '../logger';

describe('toMcpLevel', () => {
  it.each([
    {
      description: 'default',
      level: undefined
    },
    {
      description: 'debug',
      level: 'debug'
    },
    {
      description: 'info',
      level: 'info'
    },
    {
      description: 'warn',
      level: 'warn'
    },
    {
      description: 'error',
      level: 'error'
    },
    {
      description: 'anything',
      level: 'lorem ipsum'
    }
  ])('should return log severity, $description', ({ level }) => {
    expect(toMcpLevel(level as any)).toMatchSnapshot();
  });
});

describe('registerMcpSubscriber', () => {
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
    const loggingSession = getLoggerOptions();
    const unsubscribe = registerMcpSubscriber((() => {}) as any, loggingSession);

    unsubscribe();

    expect({
      subscribe: subscribeSpy.mock.calls,
      unsubscribe: unsubscribeSpy.mock.calls
    }).toMatchSnapshot('subscribe');
  });
});

describe('createServerLogger', () => {
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
      options: { channelName: 'loremIpsum', stderr: true, protocol: false }
    },
    {
      description: 'with stderr, protocol, and emulated channel to pass checks',
      options: { channelName: 'loremIpsum', stderr: true, protocol: true }
    },
    {
      description: 'with no logging options',
      options: {},
      stderr: false
    }
  ])('should attempt to subscribe and unsubscribe from a channel, $description', ({ options }) => {
    // Use channelName to pass conditions
    const { unsubscribe } = createServerLogger((() => {}) as any, options as any);

    unsubscribe();

    expect({
      subscribe: subscribeSpy.mock.calls,
      unsubscribe: unsubscribeSpy.mock.calls
    }).toMatchSnapshot('subscribe');
  });

  it('should return a memoized server logger that avoids duplicate sinks; teardown stops emissions', () => {
    setOptions({ logging: { stderr: true, level: 'debug' } as any });

    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true as any);

    class MockServer { sendLoggingMessage = jest.fn(async () => {}); }
    const server = new MockServer() as any;

    // Create a single memoized server logger with two server-level subscription handlers
    const { subscribe: subscribeCallOne, unsubscribe: unsubscribeAllCallOne } = createServerLogger.memo(server);
    const { subscribe: subscribeCallTwo, unsubscribe: unsubscribeAllCallTwo } = createServerLogger.memo(server);

    // Create two lower-level subscription handlers
    const mockHandlerOne = jest.fn();
    const mockHandlerTwo = jest.fn();
    const unsubscribeMockHandlerOne = subscribeCallOne(mockHandlerOne);
    const unsubscribeMockHandlerTwo = subscribeCallTwo(mockHandlerTwo);

    log.debug('a');

    expect(mockHandlerOne).toHaveBeenCalledTimes(1);
    expect(mockHandlerTwo).toHaveBeenCalledTimes(1);

    // This removes the subscription for mockHandlerOne
    unsubscribeMockHandlerOne();

    log.debug('b');

    // This was removed earlier by the "unsubscribeMockHandlerOne()" call above
    expect(mockHandlerOne).toHaveBeenCalledTimes(1);
    // This continues to be called
    expect(mockHandlerTwo).toHaveBeenCalledTimes(2);

    log.info('lorem ipsum, dolor sit info');

    expect(unsubscribeAllCallOne).toBe(unsubscribeAllCallTwo);

    log.info('dolor sit amet');

    // This removes all subscriptions
    unsubscribeAllCallOne();

    log.info('hello world!');

    // This shouldn't throw an error since all subscriptions were removed
    unsubscribeAllCallTwo();

    log.debug('c');

    // This was removed earlier by the "unsubscribeMockHandlerOne()" call above
    expect(mockHandlerOne).toHaveBeenCalledTimes(1);
    // This was removed by the "unsubscribeAllCallOne()" call above
    expect(mockHandlerTwo).toHaveBeenCalledTimes(4);

    // This shouldn't throw an error since all subscriptions were removed
    unsubscribeMockHandlerTwo();

    log.info('goodbye world!');

    expect(stderrSpy.mock.calls).toMatchSnapshot('stderr');

    stderrSpy.mockRestore();
  });
});

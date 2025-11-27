import diagnostics_channel from 'node:diagnostics_channel';
import { getOptions, setOptions } from '../options.context';
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
    const options = getOptions();
    const unsubscribe = registerMcpSubscriber((() => {}) as any, options);

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
      options: { logging: { channelName: 'loremIpsum', stderr: true, protocol: false } }
    },
    {
      description: 'with stderr, protocol, and emulated channel to pass checks',
      options: { logging: { channelName: 'loremIpsum', stderr: true, protocol: true } }
    },
    {
      description: 'with no logging options',
      options: { logging: {} },
      stderr: false
    }
  ])('should attempt to subscribe and unsubscribe from a channel, $description', ({ options }) => {
    // Use channelName to pass conditions
    const unsubscribe = createServerLogger((() => {}) as any, options as any);

    unsubscribe();

    expect({
      subscribe: subscribeSpy.mock.calls,
      unsubscribe: unsubscribeSpy.mock.calls
    }).toMatchSnapshot('subscribe');
  });

  it('should return a memoized server logger that avoids duplicate sinks; teardown stops emissions', () => {
    setOptions({ logging: { stderr: true, level: 'info' } as any });

    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true as any);
    class MockServer { sendLoggingMessage = jest.fn(async () => {}); }
    const server = new MockServer() as any;

    const unsubscribeCallOne = createServerLogger.memo(server);
    const unsubscribeCallTwo = createServerLogger.memo(server);

    log.info('lorem ipsum, dolor sit info');

    expect(unsubscribeCallOne).toBe(unsubscribeCallTwo);

    log.info('dolor sit amet');

    unsubscribeCallOne();

    log.info('hello world!');

    expect(stderrSpy.mock.calls).toMatchSnapshot('stderr');

    stderrSpy.mockRestore();
  });
});

import { deferTask, delay } from '../server.task';
import { log } from '../logger';

describe('deferTask', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it.each([
    {
      description: 'sync',
      mockFunc: jest.fn().mockReturnValue('lorem ipsum'),
      expected: 'lorem ipsum'
    },
    {
      description: 'async',
      mockFunc: jest.fn().mockResolvedValue('lorem ipsum'),
      expected: 'lorem ipsum'
    },
    {
      description: 'sync options',
      mockFunc: jest.fn().mockReturnValue('lorem ipsum'),
      options: { repeat: 3 },
      expected: 'lorem ipsum'
    },
    {
      description: 'async options',
      mockFunc: jest.fn().mockResolvedValue('lorem ipsum'),
      options: { repeat: 3 },
      expected: 'lorem ipsum'
    }
  ])('should execute a task, $description', async ({ mockFunc, options, expected }) => {
    const debug = jest.fn();
    const handle = deferTask(mockFunc, { debug, intervalMs: 10, ...options })();
    const resultPromise = handle.start();

    if (options?.repeat) {
      for (let i = 1; i < options.repeat; i++) {
        await jest.advanceTimersByTimeAsync(10);
      }
    }

    const result = await resultPromise;

    expect(result).toBe(expected);
    expect(mockFunc).toHaveBeenCalledTimes(options?.repeat ?? 1);
    expect(debug.mock.calls).toMatchSnapshot();
  });

  it('should stop a task', async () => {
    const mockDebug = jest.fn();
    const mockFunc = jest.fn().mockReturnValue('stopped');
    const handle = deferTask(mockFunc, { debug: mockDebug, repeat: 5, intervalMs: 100 })();

    expect(handle.isRunning()).toBe(false);
    handle.start();
    expect(handle.isRunning()).toBe(true);

    handle.stop();
    expect(handle.isRunning()).toBe(false);

    expect(mockDebug.mock.calls).toMatchSnapshot();
    expect(mockFunc).toHaveBeenCalledTimes(1);
  });

  it('should cancel a task', async () => {
    const mockDebug = jest.fn();
    const mockFunc = jest.fn().mockReturnValue('lorem ipsum');
    const handle = deferTask(mockFunc, { debug: mockDebug, repeat: 5, cancelMs: 250, intervalMs: 100 })();

    expect(handle.isRunning()).toBe(false);

    await Promise.allSettled([
      handle.start(),
      jest.advanceTimersByTimeAsync(300)
    ]);

    expect(mockDebug.mock.calls.map(arr => ({ type: arr[0].type, value: arr[0].value() }))).toMatchSnapshot();

    expect(handle.isRunning()).toBe(false);
    expect(mockFunc).toHaveBeenCalledTimes(3);
  });

  it('should disable cutoff and warn if cancelMs <= intervalMs', async () => {
    const warnSpy = jest.spyOn(log, 'warn').mockImplementation(() => {});
    const mockFunc = jest.fn().mockReturnValue('ok');
    const handle = deferTask(mockFunc, { repeat: 1, cancelMs: 100, intervalMs: 100 })();
    const result = await handle.start();

    expect(result).toBe('ok');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('cancelMs (100) must be greater than intervalMs (100)')
    );
    expect(mockFunc).toHaveBeenCalledTimes(1);
  });

  it('should repeat indefinitely when repeat is Infinity until stopped', async () => {
    const mockFunc = jest.fn().mockReturnValue('polling');
    const handle = deferTask(mockFunc, { repeat: Infinity, intervalMs: 100 })();

    // Starts execution: Call 1 runs immediately at t = 0ms
    handle.start();

    // Advance timers for 2 intervals -> Call 2 (t=100ms) and Call 3 (t=200ms)
    await jest.advanceTimersByTimeAsync(100);
    await jest.advanceTimersByTimeAsync(100);

    expect(mockFunc).toHaveBeenCalledTimes(3);
    expect(handle.isRunning()).toBe(true);

    // Stop the loop
    await handle.stop();
    expect(handle.isRunning()).toBe(false);
  });

  it('should continue loop on error when continueOnError is true', async () => {
    const errorSpy = jest.spyOn(log, 'error').mockImplementation(() => {});
    const mockFunc = jest
      .fn()
      .mockRejectedValueOnce(new Error('transient network failure'))
      .mockResolvedValue('recovered');
    const handle = deferTask(mockFunc, { repeat: 2, intervalMs: 100, continueOnError: true })();
    const runPromise = handle.start();

    // Advance past iteration 1 error delay to iteration 2
    await jest.advanceTimersByTimeAsync(100);

    const result = await runPromise;

    expect(result).toBe('recovered');
    expect(mockFunc).toHaveBeenCalledTimes(2);
    expect(errorSpy).toHaveBeenCalledWith('Defer task error', expect.any(Error));
  });

  it('should enforce a timeout', async () => {
    const mockDebug = jest.fn();
    const mockFunc = jest.fn().mockImplementation(() => new Promise(resolve => setTimeout(resolve, 500)));
    const handle = deferTask(mockFunc, { debug: mockDebug, intervalMs: 100, errorMessage: 'Too slow' })();

    expect(handle.isRunning()).toBe(false);
    const result = handle.start();

    expect(handle.isRunning()).toBe(true);

    await Promise.all([
      expect(result).rejects.toThrow('Too slow'),
      jest.advanceTimersByTimeAsync(150)
    ]);

    expect(handle.isRunning()).toBe(false);
    expect(handle).toMatchSnapshot('handle');

    expect(mockDebug.mock.calls).toMatchSnapshot();
  });
});

describe('delay', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('should resolve after specified ms', async () => {
    const promise = delay({ ms: 100 });

    await Promise.all([
      expect(promise).resolves.toBeUndefined(),
      jest.advanceTimersByTimeAsync(100)
    ]);
  });

  it('should reject if signal is aborted beforehand', async () => {
    const controller = new AbortController();

    controller.abort();

    const promise = delay({ ms: 100, signal: controller.signal });

    await expect(promise).rejects.toThrow('Delay aborted');
  });

  it('should reject if signal is aborted during delay', async () => {
    const controller = new AbortController();
    const promise = delay({ ms: 100, signal: controller.signal });

    await Promise.all([
      expect(promise).rejects.toThrow('Delay aborted'),
      (async () => {
        await jest.advanceTimersByTimeAsync(50);
        controller.abort();
      })()
    ]);
  });
});

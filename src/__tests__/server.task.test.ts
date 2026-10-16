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

    if (typeof options?.repeat === 'number') {
      await jest.advanceTimersByTimeAsync(10 * options.repeat);
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

  it('should delay the first execution when delayStartMs is provided', async () => {
    const mockDebug = jest.fn();
    const mockFunc = jest.fn().mockReturnValue('delayed');
    const handle = deferTask(mockFunc, { debug: mockDebug, delayStartMs: 1000, intervalMs: 100, repeat: 1 })();
    const promise = handle.start();

    // Task delayed
    await jest.advanceTimersByTimeAsync(500);
    expect(mockFunc).not.toHaveBeenCalled();

    // Delay finishes and task executes
    await jest.advanceTimersByTimeAsync(500);
    const result = await promise;

    expect(result).toBe('delayed');
    expect(mockFunc).toHaveBeenCalledTimes(1);
    expect(mockDebug.mock.calls).toMatchSnapshot();
  });

  it('should evaluate dynamicContext on each repeating execution with prior resolved context', async () => {
    type RunContext = {
      run: number;
      previousRun?: number;
      initialRun?: number;
    };

    const dynamicContext = jest.fn(({ prev, args }: { prev?: unknown; args: [RunContext] }): RunContext => {
      const prevCtx = prev as RunContext | undefined;
      const initialCtx = args[0];

      return {
        run: prevCtx ? prevCtx.run + 1 : initialCtx.run + 1,
        previousRun: prevCtx ? prevCtx.run : initialCtx.run,
        initialRun: initialCtx.run
      };
    });
    const mockFunc = jest.fn((ctx: RunContext) => `result-${ctx.run}`);

    const handle = deferTask(mockFunc, { repeat: 3, intervalMs: 100, dynamicContext })({ run: 0 });
    const runPromise = handle.start();

    await jest.advanceTimersByTimeAsync(100);
    await jest.advanceTimersByTimeAsync(100);
    const result = await runPromise;

    expect(result).toBe('result-3');
    expect(dynamicContext).toHaveBeenCalledTimes(3);
    expect(dynamicContext).toHaveBeenNthCalledWith(1, { prev: undefined, args: [{ run: 0 }] });
    expect(dynamicContext).toHaveBeenNthCalledWith(2, { prev: { run: 1, previousRun: 0, initialRun: 0 }, args: [{ run: 0 }] });
    expect(dynamicContext).toHaveBeenNthCalledWith(3, { prev: { run: 2, previousRun: 1, initialRun: 0 }, args: [{ run: 0 }] });
    expect(mockFunc).toHaveBeenCalledTimes(3);
    expect(mockFunc).toHaveBeenNthCalledWith(1, { run: 1, previousRun: 0, initialRun: 0 });
    expect(mockFunc).toHaveBeenNthCalledWith(2, { run: 2, previousRun: 1, initialRun: 0 });
    expect(mockFunc).toHaveBeenNthCalledWith(3, { run: 3, previousRun: 2, initialRun: 0 });
  });

  it('should catch dynamicContext errors, log a warning, and fall back to initial arguments', async () => {
    const warnSpy = jest.spyOn(log, 'warn').mockImplementation(() => {});
    const dynamicContext = jest.fn().mockRejectedValue(new Error('dynamic context lookup failure'));
    const mockFunc = jest.fn((val: string) => `handled-${val}`);

    const handle = deferTask(mockFunc, { repeat: 1, intervalMs: 50, dynamicContext })('fallback-arg');
    const result = await handle.start();

    expect(result).toBe('handled-fallback-arg');
    expect(dynamicContext).toHaveBeenCalledWith({ prev: undefined, args: ['fallback-arg'] });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Defer task dynamicContext resolution failed: Error: dynamic context lookup failure')
    );
    expect(mockFunc).toHaveBeenCalledWith('fallback-arg');
  });

  it('should increment state count accurately and repeat correct number of times on dynamicContext fallback', async () => {
    jest.spyOn(log, 'warn').mockImplementation(() => {});
    const dynamicContext = jest.fn().mockRejectedValue(new Error('dynamic context error'));
    const mockFunc = jest.fn((val: string) => `handled-${val}`);

    const handle = deferTask(mockFunc, { repeat: 3, intervalMs: 50, dynamicContext })('fallback-arg');
    const resultPromise = handle.start();

    await jest.advanceTimersByTimeAsync(150);

    const result = await resultPromise;

    expect(result).toBe('handled-fallback-arg');
    expect(dynamicContext).toHaveBeenCalledTimes(3);
    expect(mockFunc).toHaveBeenCalledTimes(3);
  });

  it.each([
    {
      mode: 'apply' as const,
      result: ['left', 'right'],
      factoryArgs: ['seed-a', 'seed-b'],
      expectedResult: 'left/right',
      expectedCalls: ['left', 'right'],
      mockFunc: jest.fn((first: string, second: string) => `${first}/${second}`)
    },
    {
      mode: 'call' as const,
      result: ['a', 'b'],
      factoryArgs: [['seed']],
      expectedResult: 'a+b',
      expectedCalls: [['a', 'b']],
      mockFunc: jest.fn((items: string[]) => items.join('+'))
    }
  ])(
    'should pass dynamicContext results to func when dynamicContextInvoke is $mode',
    async ({ mode, result, factoryArgs, expectedResult, expectedCalls, mockFunc }) => {
      const dynamicContext = jest.fn(() => result);

      const handle = deferTask<unknown[], string>(mockFunc as (...args: unknown[]) => string, {
        repeat: 1,
        intervalMs: 50,
        dynamicContext,
        dynamicContextInvoke: mode
      })(...(factoryArgs as [unknown, unknown]));
      const output = await handle.start();

      expect(output).toBe(expectedResult);
      expect(mockFunc).toHaveBeenCalledWith(...expectedCalls);
    }
  );

  it('should support async dynamicContext suppliers', async () => {
    const dynamicContext = jest.fn(async () => 'async-context-value');
    const mockFunc = jest.fn((val: string) => val);

    const handle = deferTask(mockFunc, { repeat: 1, intervalMs: 50, dynamicContext })('initial');
    const result = await handle.start();

    expect(result).toBe('async-context-value');
    expect(dynamicContext).toHaveBeenCalledWith({ prev: undefined, args: ['initial'] });
    expect(mockFunc).toHaveBeenCalledWith('async-context-value');
  });

  it('should halt execution if stop is called while dynamicContext is resolving', async () => {
    let resolveContext: (val: string) => void = () => {};
    const dynamicContext = jest.fn(
      () => new Promise<string>(resolve => { resolveContext = resolve; })
    );
    const mockFunc = jest.fn((val: string) => `result-${val}`);

    const handle = deferTask(mockFunc, { repeat: 1, intervalMs: 50, dynamicContext })('initial');
    const runPromise = handle.start();
    const stopPromise = handle.stop();

    resolveContext('delayed-context');

    const [runResult] = await Promise.all([runPromise, stopPromise]);

    expect(dynamicContext).toHaveBeenCalledTimes(1);
    expect(mockFunc).not.toHaveBeenCalled();
    expect(runResult).toBeUndefined();
    expect(handle.isRunning()).toBe(false);
  });

  it.each([
    {
      mode: 'call' as const,
      expectedResult: 'received-undefined',
      expectedArgs: [undefined]
    },
    {
      mode: 'apply' as const,
      expectedResult: 'args-count-0',
      expectedArgs: []
    }
  ])(
    'should handle undefined dynamicContext in $mode mode without falling back to factory args',
    async ({ mode, expectedResult, expectedArgs }) => {
      const mockFunc = jest.fn((...args: unknown[]) =>
        (mode === 'call' ? `received-${args[0]}` : `args-count-${args.length}`));
      const dynamicContext = jest.fn(() => undefined);

      const handle = deferTask(mockFunc, {
        repeat: 1,
        intervalMs: 50,
        dynamicContext,
        dynamicContextInvoke: mode
      })('initial-factory-arg');
      const result = await handle.start();

      expect(result).toBe(expectedResult);
      expect(dynamicContext).toHaveBeenCalledWith({ prev: undefined, args: ['initial-factory-arg'] });
      expect(mockFunc).toHaveBeenCalledWith(...expectedArgs);
    }
  );
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

  it.each([
    {
      timing: 'beforehand',
      triggerAbort: (controller: AbortController) => controller.abort()
    },
    {
      timing: 'during delay',
      triggerAbort: async (controller: AbortController) => {
        await jest.advanceTimersByTimeAsync(50);
        controller.abort();
      }
    }
  ])('should reject if signal is aborted $timing', async ({ triggerAbort }) => {
    const controller = new AbortController();
    const abortAction = triggerAbort(controller);
    const promise = delay({ ms: 100, signal: controller.signal });

    await Promise.all([
      expect(promise).rejects.toThrow('Delay aborted'),
      abortAction
    ]);
  });
});

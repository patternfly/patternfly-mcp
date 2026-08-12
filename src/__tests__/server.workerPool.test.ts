import { Worker } from 'node:worker_threads';
import {
  buildPersistentPool,
  buildTransientPool,
  createPoolAbort,
  getHeavyPool,
  getWorkerScriptPath,
  resetWorkerPools,
  sendWorkerPoolsShutdown
} from '../server.workerPool';

const MockWorker = Worker as jest.MockedClass<typeof Worker>;

describe('createPoolAbort', () => {
  const payload = { moduleSpecifier: 'spec', args: {} };

  it.each([
    {
      description: 'runTask after abort',
      abortBeforeRun: true,
      expectedQueueLength: 0
    },
    {
      description: 'queued tasks when abort fires',
      abortBeforeRun: false,
      expectedQueueLength: 1
    },
    {
      description: 'in-flight tasks when abort fires',
      abortBeforeRun: false,
      expectedQueueLength: 1
    }
  ])('should reject $description', async ({ abortBeforeRun, expectedQueueLength }) => {
    const poolAbort = createPoolAbort();
    const queue: any[] = [];

    if (abortBeforeRun) {
      poolAbort.abort();
    }

    const task = poolAbort.runTask(payload, queued => {
      queue.push(queued);
    });

    if (!abortBeforeRun) {
      poolAbort.abort();
    }

    expect(queue).toHaveLength(expectedQueueLength);
    await expect(task).rejects.toThrow('Worker pool shutdown');
  });

  it('should resolve when the enqueue handler completes the task', async () => {
    const poolAbort = createPoolAbort();

    const task = poolAbort.runTask(payload, queued => {
      queued.resolve('ok');
    });

    await expect(task).resolves.toBe('ok');
  });

  it('should report aborted state after abort', () => {
    const poolAbort = createPoolAbort();

    expect(poolAbort.isAborted()).toBe(false);
    poolAbort.abort();
    expect(poolAbort.isAborted()).toBe(true);
  });
});

describe('getWorkerScriptPath', () => {
  it('should attempt to return the worker script path', () => {
    const workerScriptPath = getWorkerScriptPath();

    expect(workerScriptPath).toBeDefined();
  });
});

describe('buildPersistentPool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetWorkerPools();
  });

  it('should resolve payload on message success', async () => {
    const expected = 'task-success-result';
    const emit = { success: true, payload: expected };

    let messageCallback: any;
    const mockOn = jest.fn((mockEvent, mockCallback) => {
      if (mockEvent === 'message') {
        messageCallback = mockCallback;
      }
    });

    MockWorker.mockImplementation((): any => ({
      on: mockOn,
      off: jest.fn(),
      postMessage: jest.fn(() => {
        if (messageCallback) {
          messageCallback(emit);
        }
      })
    }));

    const pool = buildPersistentPool(2);

    const taskPromise = pool.runTask({
      moduleSpecifier: 'data:text/javascript;base64,KCkgPT4gbG9yZW1JcHVzbQ==',
      args: { test: true }
    });

    await expect(taskPromise).resolves.toEqual(expected);
  });

  it.each([
    {
      description: 'custom error message on message failure',
      event: 'message',
      emit: { success: false, error: 'Custom execution error' },
      expected: 'Custom execution error'
    },
    {
      description: 'standard error on worker thread error event',
      event: 'error',
      emit: new Error('Worker Thread Exception'),
      expected: 'Worker Thread Exception'
    }
  ])('should reject on event, $description', async ({ emit, event, expected }) => {
    let targetCallback: any;
    const mockOn = jest.fn((mockEvent, mockCallback) => {
      if (mockEvent === event) {
        targetCallback = mockCallback;
      }
    });

    MockWorker.mockImplementation((): any => ({
      on: mockOn,
      off: jest.fn(),
      postMessage: jest.fn(() => {
        if (targetCallback) {
          targetCallback(emit);
        }
      })
    }));

    const pool = buildPersistentPool(2);

    const taskPromise = pool.runTask({
      moduleSpecifier: 'data:text/javascript;base64,KCkgPT4gbG9yZW1JcHVzbQ==',
      args: { test: true }
    });

    await expect(taskPromise).rejects.toThrow(expected);
  });

  it('should handle tasks in queue when active workers exceed limit', async () => {
    const instances: any[] = [];

    MockWorker.mockImplementation((): any => {
      const listeners: Record<string, any> = {};
      const workerInstance = {
        on: jest.fn((event: string, cb: any): any => {
          listeners[event] = cb;

          return workerInstance;
        }),
        off: jest.fn((event: string, _cb: any): any => {
          delete listeners[event];

          return workerInstance;
        }),
        postMessage: jest.fn(),
        // Trigger events manually inside the test
        emit: (event: string, value: any) => {
          if (listeners[event]) {
            listeners[event](value);
          }
        }
      };

      instances.push(workerInstance);

      return workerInstance as any;
    });

    const pool = buildPersistentPool(2);

    // Initial warm up immediately spawns 2 workers
    expect(MockWorker).toHaveBeenCalledTimes(2);
    expect(instances).toHaveLength(2);

    // Queue 3 tasks concurrently
    const t1 = pool.runTask({ moduleSpecifier: 'spec-1', args: {} });
    const t2 = pool.runTask({ moduleSpecifier: 'spec-2', args: {} });
    const t3 = pool.runTask({ moduleSpecifier: 'spec-3', args: {} });

    // Resolve the first worker task
    instances[0].emit('message', { success: true, payload: 'result-1' });

    // Resolve the remaining active worker sessions
    instances[1].emit('message', { success: true, payload: 'result-2' });
    instances[0].emit('message', { success: true, payload: 'result-3' });

    // Verify all tasks resolve successfully with their respective values
    await expect(t1).resolves.toBe('result-1');
    await expect(t2).resolves.toBe('result-2');
    await expect(t3).resolves.toBe('result-3');
  });
});

describe('buildTransientPool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetWorkerPools();
  });

  it('should resolve payload on message success', async () => {
    const expected = 'task-success-result';
    const emit = { success: true, payload: expected };

    const mockOn = jest.fn((mockEvent, mockCallback) => {
      if (mockEvent === 'message') {
        mockCallback(emit);
      }
    });

    MockWorker.mockImplementation((): any => ({
      on: mockOn,
      postMessage: jest.fn(),
      terminate: jest.fn().mockResolvedValue(0)
    }));

    const pool = buildTransientPool(2);

    const taskPromise = pool.runTask({
      moduleSpecifier: 'data:text/javascript;base64,KCkgPT4gbG9yZW1JcHVzbQ==',
      args: { test: true }
    });

    await expect(taskPromise).resolves.toEqual(expected);
  });

  it.each([
    {
      description: 'custom error message on message failure',
      event: 'message',
      emit: { success: false, error: 'Custom execution error' },
      expected: 'Custom execution error'
    },
    {
      description: 'standard error on worker thread error event',
      event: 'error',
      emit: new Error('Worker Thread Exception'),
      expected: 'Worker Thread Exception'
    },
    {
      description: 'exit code info on unexpected exit event',
      event: 'exit',
      emit: 1,
      expected: 'Transient worker exited unexpectedly with code 1'
    }
  ])('should reject on event, $description', async ({ emit, event, expected }) => {
    const mockOn = jest.fn((mockEvent, mockCallback) => {
      if (mockEvent === event) {
        mockCallback(emit);
      }
    });

    MockWorker.mockImplementation((): any => ({
      on: mockOn,
      postMessage: jest.fn(),
      terminate: jest.fn().mockResolvedValue(0)
    }));

    const pool = buildTransientPool(2);

    const taskPromise = pool.runTask({
      moduleSpecifier: 'data:text/javascript;base64,KCkgPT4gbG9yZW1JcHVzbQ==',
      args: { test: true }
    });

    await expect(taskPromise).rejects.toThrow(expected);
  });

  it('should handle tasks in queue when active workers exceed limit', async () => {
    const instances: any[] = [];

    MockWorker.mockImplementation((): any => {
      const listeners: Record<string, any> = {};
      const workerInstance = {
        on: jest.fn((event: string, cb: any): any => {
          listeners[event] = cb;

          return workerInstance;
        }),
        postMessage: jest.fn(),
        terminate: jest.fn().mockResolvedValue(0),

        // Trigger events manually inside the test
        emit: (event: string, value: any) => {
          if (listeners[event]) {
            listeners[event](value);
          }
        }
      };

      instances.push(workerInstance);

      return workerInstance as any;
    });

    const pool = buildTransientPool(2);

    // Queue 3 tasks concurrently
    const t1 = pool.runTask({ moduleSpecifier: 'spec-1', args: {} });
    const t2 = pool.runTask({ moduleSpecifier: 'spec-2', args: {} });
    const t3 = pool.runTask({ moduleSpecifier: 'spec-3', args: {} });

    // Assert that exactly 2 worker threads are spawned initially, and the 3rd is queued
    expect(MockWorker).toHaveBeenCalledTimes(2);
    expect(instances).toHaveLength(2);

    // Resolve the first worker task and simulate its exit
    instances[0].emit('message', { success: true, payload: 'result-1' });
    instances[0].emit('exit', 0);

    // MockWorker should have been instantiated a third time for the queued task
    expect(MockWorker).toHaveBeenCalledTimes(3);
    expect(instances).toHaveLength(3);

    // Resolve the remaining active workers
    instances[1].emit('message', { success: true, payload: 'result-2' });
    instances[1].emit('exit', 0);

    instances[2].emit('message', { success: true, payload: 'result-3' });
    instances[2].emit('exit', 0);

    // Verify all tasks resolve successfully with their respective values
    await expect(t1).resolves.toBe('result-1');
    await expect(t2).resolves.toBe('result-2');
    await expect(t3).resolves.toBe('result-3');
  });

  it('should reject queued and in-flight tasks on shutdown', async () => {
    MockWorker.mockImplementation((): any => ({
      on: jest.fn(),
      postMessage: jest.fn(),
      terminate: jest.fn().mockResolvedValue(0)
    }));

    const pool = buildTransientPool(1);
    const activeTask = pool.runTask({ moduleSpecifier: 'spec-active', args: {} });
    const queuedTask = pool.runTask({ moduleSpecifier: 'spec-queued', args: {} });

    await pool.shutdown();

    await expect(activeTask).rejects.toThrow('Worker pool shutdown');
    await expect(queuedTask).rejects.toThrow('Worker pool shutdown');
  });
});

describe('worker pool registry', () => {
  beforeEach(() => {
    resetWorkerPools();
  });

  it('should return the same heavy pool instance from getHeavyPool', () => {
    const first = getHeavyPool();
    const second = getHeavyPool();

    expect(first).toBe(second);
  });

  it('should shutdown registered pools and clear the registry', async () => {
    const pool = getHeavyPool();

    await sendWorkerPoolsShutdown();

    const nextPool = getHeavyPool();

    expect(nextPool).not.toBe(pool);
  });
});

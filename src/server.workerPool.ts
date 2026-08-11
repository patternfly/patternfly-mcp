import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { availableParallelism } from 'node:os';
import { formatUnknownError } from './logger';

/**
 * Payload for a task execution, including module details, arguments, and configuration options.
 *
 * @interface TaskPayload
 *
 * @property moduleSpecifier Identifier for the module to be imported or executed as part of the
 *     task.
 * @property [exportName] Optional name of the exported function or variable from the specified
 *     module to be invoked or used.
 * @property [args] Optional arguments to be passed to the task or function being executed.
 * @property [options] Optional additional options or settings for executing the task.
 * @property [session] Optional session-specific data or context associated with the task
 *     execution.
 */
interface TaskPayload {
  moduleSpecifier: string;
  exportName?: string;
  args?: unknown;
  options?: unknown;
  session?: unknown;
}

/**
 * IPC payload posted between worker threads and the pool parent.
 */
interface WorkerIpcMessage {
  success: boolean;
  payload?: unknown;
  error?: unknown;
}

/**
 * Throttled worker thread pool for parallel execution.
 *
 * @interface QueuedTask
 *
 * @property payload Task payload.
 * @property resolve Promise resolve function.
 * @property reject Promise reject function.
 */
interface QueuedTask {
  payload: TaskPayload;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

/**
 * Throttled worker thread pool for parallel execution.
 *
 * @interface WorkerPoolInstance
 *
 * @property runTask Run task method.
 * @property shutdown Best-effort shutdown for queued and active workers.
 */
interface WorkerPoolInstance {
  runTask<T>(payload: TaskPayload): Promise<T>;
  shutdown(): Promise<void>;
}

/**
 * Registry keys for module-scoped worker pools.
 */
type PoolKind = 'heavy' | 'light';

/**
 * Registry for worker pools.
 */
const poolRegistry = new Map<PoolKind, WorkerPoolInstance>();

/**
 * Maximum number of queued tasks to prevent unbounded growth.
 *
 * @note In the future we can look at adding this to default options.
 */
const MAX_QUEUE_CAP = 50;

/**
 * Resolves the location of the worker entry script safely across bundling and testing frameworks.
 */
const getWorkerScriptPath = (): string => {
  try {
    return fileURLToPath(import.meta.resolve('#workerEntry'));
  } catch {
    return new URL('../dist/server.workerEntry.js', import.meta.url).pathname;
  }
};

/**
 * Pool-scoped abort for rejecting queued and in-flight tasks on shutdown.
 */
const createPoolAbort = () => {
  const controller = new AbortController();
  const shutdownError = new Error('Worker pool shutdown');

  const isAborted = (): boolean => controller.signal.aborted;

  const abort = (): void => {
    if (!controller.signal.aborted) {
      controller.abort(shutdownError);
    }
  };

  const runTask = <T>(payload: TaskPayload, enqueue: (task: QueuedTask) => void): Promise<T> => {
    if (isAborted()) {
      return Promise.reject(shutdownError);
    }

    return new Promise<T>((resolve, reject) => {
      const onAbort = (): void => {
        reject(controller.signal.reason ?? shutdownError);
      };

      controller.signal.addEventListener('abort', onAbort, { once: true });

      enqueue({
        payload,
        resolve: (value: unknown) => {
          controller.signal.removeEventListener('abort', onAbort);
          resolve(value as T);
        },
        reject: (reason: unknown) => {
          controller.signal.removeEventListener('abort', onAbort);
          reject(reason);
        }
      });
    });
  };

  return { isAborted, abort, runTask };
};

/**
 * Create a transient worker pool with the specified maximum number of workers.
 * Spawns a fresh thread per task, kills it instantly on completion
 *
 * @note Recommended use is for heavy memory usage, unpredictable processing, and
 * long-running scraping cycles.
 *
 * @private
 *
 * @param [maxWorkers] -Max number of workers that can run concurrently. Defaults to one
 *     less than the available parallelism of the system, with a minimum value of 1.
 * @returns {WorkerPoolInstance} - An instance of a worker pool, allowing tasks
 *     to be queued and executed using dedicated transient workers.
 */
const buildTransientPool = (maxWorkers = Math.max(1, availableParallelism() - 1)): WorkerPoolInstance => {
  let activeWorkers = 0;
  const queue: QueuedTask[] = [];
  const transientWorkers = new Set<Worker>();
  const workerScript = getWorkerScriptPath();
  const poolAbort = createPoolAbort();

  /**
   * Process the next task in the queue if there are available workers and tasks.
   */
  const next = (): void => {
    if (poolAbort.isAborted() || activeWorkers >= maxWorkers || queue.length === 0) {
      return;
    }

    const task = queue.shift();

    if (!task) {
      return;
    }

    activeWorkers += 1;
    spawnTransientWorker(task);
  };

  /**
   * Spawn worker, execute a task.
   *
   * @param task - The task to be executed.
   */
  const spawnTransientWorker = (task: QueuedTask): void => {
    const { payload, resolve, reject } = task;
    let resolved = false;

    try {
      // Pass workerData right away to trigger transient execution flow
      const worker = new Worker(workerScript, { workerData: payload });

      transientWorkers.add(worker);

      worker.on('message', (message: WorkerIpcMessage) => {
        resolved = true;
        if (message && message.success) {
          resolve(message.payload);
        } else {
          reject(new Error(formatUnknownError(message?.error ?? 'Unknown worker error')));
        }
      });

      worker.on('error', err => {
        if (!resolved) {
          resolved = true;
          reject(err);
        }
      });

      worker.on('exit', code => {
        transientWorkers.delete(worker);
        activeWorkers -= 1;

        if (!resolved) {
          resolved = true;
          reject(new Error(`Transient worker exited unexpectedly with code ${code}`));
        }

        next();
      });
    } catch (error) {
      activeWorkers -= 1;

      if (!resolved) {
        resolved = true;
        reject(error);
      }

      next();
    }
  };

  return {
    runTask: <T>(payload: TaskPayload): Promise<T> =>
      poolAbort.runTask<T>(payload, task => {
        // Backpressure: reject immediately if queue is full
        if (queue.length >= MAX_QUEUE_CAP) {
          const err: Error & { code: string } = Object.assign(
            new Error(`Worker queue full (${MAX_QUEUE_CAP}).`),
            { code: 'ERR_WORKER_QUEUE_FULL' }
          );

          task.reject(err);

          return;
        }
        queue.push(task);
        next();
      }),

    shutdown: async (): Promise<void> => {
      poolAbort.abort();
      queue.length = 0;

      await Promise.allSettled([...transientWorkers].map(worker => worker.terminate()));
      transientWorkers.clear();
      activeWorkers = 0;
    }
  };
};

/**
 * Create a persistent worker pool with pre-spawned worker threads for handling concurrent tasks.
 * Keeps warm threads active, route payloads via IPC messages.
 *
 * @note Recommended for rapid, light, or frequent computations requiring low-latency invocation.
 *
 * @private
 *
 * @param [maxWorkers] -Max number of workers that can run concurrently. Defaults to one
 *     less than the available parallelism of the system, with a minimum value of 1.
 * @returns {WorkerPoolInstance} Object exposing methods to interact with the worker pool,
 *     including submitting tasks for execution.
 */
const buildPersistentPool = (maxWorkers = Math.max(1, availableParallelism() - 1)): WorkerPoolInstance => {
  const queue: QueuedTask[] = [];
  const workers: { worker: Worker; active: boolean; reject?: (reason: unknown) => void }[] = [];
  const workerScript = getWorkerScriptPath();
  const poolAbort = createPoolAbort();

  const handleWorkerCrash = (index: number, exitCode?: number) => {
    const slot = workers[index];

    if (!slot) {
      return;
    }

    slot.worker?.removeAllListeners();

    if (slot.reject) {
      const message = exitCode !== undefined
        ? `Persistent worker exited unexpectedly with code ${exitCode}`
        : 'Persistent worker thread crashed';

      slot.reject(new Error(message));
    } else {
      slot.active = false;
    }

    slot.worker = new Worker(workerScript);
    slot.worker.on('error', () => handleWorkerCrash(index));
    slot.worker.on('exit', (code: number) => handleWorkerCrash(index, code));
    next();
  };

  const next = (): void => {
    if (poolAbort.isAborted() || queue.length === 0) {
      return;
    }

    const idleWorkerSlot = workers.find(worker => !worker.active);

    if (!idleWorkerSlot) {
      return;
    }

    const task = queue.shift();

    if (!task) {
      return;
    }

    idleWorkerSlot.active = true;
    const { worker } = idleWorkerSlot;
    const { payload, resolve, reject } = task;

    idleWorkerSlot.reject = reject;

    const onMessage = (message: WorkerIpcMessage) => {
      cleanup();
      if (message && message.success) {
        resolve(message.payload);
      } else {
        reject(new Error(formatUnknownError(message?.error ?? 'Unknown worker error')));
      }
    };

    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };

    const cleanup = () => {
      worker.off('message', onMessage);
      worker.off('error', onError);
      idleWorkerSlot.active = false;
      delete idleWorkerSlot.reject;

      next();
    };

    worker.on('message', onMessage);
    worker.on('error', onError);

    // Send the task data via postMessage channel to be captured by persistent listeners
    worker.postMessage(payload);
  };

  // Pre-spawn and warm up the permanent thread containers
  for (let i = 0; i < maxWorkers; i++) {
    const worker = new Worker(workerScript); // Instantiated WITHOUT initial workerData

    workers.push({ worker, active: false });
    worker.on('error', () => handleWorkerCrash(i));
    worker.on('exit', (code: number) => handleWorkerCrash(i, code));
  }

  return {
    runTask: <T>(payload: TaskPayload): Promise<T> =>
      poolAbort.runTask<T>(payload, task => {
        // Backpressure: reject immediately if queue is full
        if (queue.length >= MAX_QUEUE_CAP) {
          const err: Error & { code: string } = Object.assign(
            new Error(`Worker queue full (${MAX_QUEUE_CAP}).`),
            { code: 'ERR_WORKER_QUEUE_FULL' }
          );

          task.reject(err);

          return;
        }
        queue.push(task);
        next();
      }),

    shutdown: async (): Promise<void> => {
      poolAbort.abort();
      queue.length = 0;

      for (const slot of workers) {
        slot.worker.removeAllListeners();
        await slot.worker.terminate();
        slot.active = false;
        delete slot.reject;
      }
    }
  };
};

/**
 * Return the module-scoped pool for the requested kind, creating it on first use.
 *
 * @private
 * @param kind - Registry key for the pool.
 * @returns Cached worker pool instance.
 */
const getPool = (kind: PoolKind): WorkerPoolInstance => {
  const cached = poolRegistry.get(kind);

  if (cached) {
    return cached;
  }

  const pool = kind === 'heavy'
    ? buildTransientPool(2)
    : buildPersistentPool();

  poolRegistry.set(kind, pool);

  return pool;
};

/**
 * Transient pool for heavy or costly collection work.
 *
 * @returns Module-scoped transient worker pool.
 */
const getHeavyPool = (): WorkerPoolInstance => getPool('heavy');

/**
 * Persistent pool for light, frequent collection work.
 *
 * @returns Module-scoped persistent worker pool.
 */
const getLightPool = (): WorkerPoolInstance => getPool('light');

/**
 * Best-effort shutdown for all module-scoped worker pools.
 *
 * Policy mirrors {@link sendToolsHostShutdown}:
 * - Abort queued and in-flight tasks
 * - Terminate worker threads
 * - Clear the pool registry so a later start gets fresh pools
 */
const sendWorkerPoolsShutdown = async (): Promise<void> => {
  await Promise.allSettled(
    [...poolRegistry.values()].map(pool => pool.shutdown())
  );

  poolRegistry.clear();
};

/**
 * Clear the module-scoped pool registry.
 *
 * @private
 */
const resetWorkerPools = (): void => {
  poolRegistry.clear();
};

export {
  createPoolAbort,
  getWorkerScriptPath,
  buildTransientPool,
  buildPersistentPool,
  getHeavyPool,
  getLightPool,
  resetWorkerPools,
  sendWorkerPoolsShutdown,
  type TaskPayload,
  type QueuedTask,
  type WorkerPoolInstance
};

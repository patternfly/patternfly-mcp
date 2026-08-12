import { pathToFileURL } from 'node:url';
import { parentPort, workerData } from 'node:worker_threads';
import { runWithOptions, runWithSession } from './options.context';

/**
 * Data required to define and execute a worker task.
 *
 * @interface WorkerTaskData
 *
 * @property moduleSpecifier String that specifies the module to be imported or loaded.
 * @property [exportName] Optional string that specifies the name of the export within the module to invoke.
 * @property [args] Optional arguments to be passed to the task being executed.
 * @property [options] Optional configuration or metadata related to the task execution.
 * @property [session] Optional session information or context related to the task environment.
 */
interface WorkerTaskData {
  moduleSpecifier: string;
  exportName?: string;
  args?: unknown;
  options?: unknown;
  session?: unknown;
}

/**
 * Execute a task defined by the provided payload.
 *
 * - Dynamically import a module
 * - Identify the specified export (default or named)
 * - Invokes the callback with the given arguments.
 *
 * @param {WorkerTaskData} taskPayload - The task payload containing details about the module to load,
 *     the export to invoke, and arguments to pass to the export.
 * @param taskPayload.moduleSpecifier - The path or URL identifying the module to be imported.
 *     It must be a valid module specifier.
 * @param [taskPayload.exportName='default'] - The name of the export to invoke. Defaults to
 *     'default' if not specified.
 * @param taskPayload.args - Arguments to pass to the exported function when called.
 * @param [taskPayload.options] - Configuration options that define specific execution settings.
 * @param [taskPayload.session] - Data describing the session context for task isolation.
 * @throws {Error} If the `moduleSpecifier` is not provided, or if the specified export is not a function.
 * @returns A promise that resolves to the result of the invoked export function.
 */
const executeTask = async (
  { moduleSpecifier, exportName = 'default', args, options, session }: WorkerTaskData
): Promise<unknown> => {
  if (!moduleSpecifier) {
    throw new Error('No moduleSpecifier specified for worker task.');
  }

  let resolvedSpec = moduleSpecifier;

  if (resolvedSpec.startsWith('#')) {
    resolvedSpec = import.meta.resolve(resolvedSpec);
  } else if (!resolvedSpec.startsWith('file://') && !resolvedSpec.startsWith('data:')) {
    resolvedSpec = pathToFileURL(resolvedSpec).href;
  }

  // Bypass static bundler boundaries cleanly via scoped Function constructor
  const dynamicImport = new Function('spec', 'return import(spec)') as (spec: string) => Promise<Record<string, unknown>>;
  const module = await dynamicImport(resolvedSpec);

  // Map to default fallback hooks if explicit targets are missing
  const callback = module[exportName] || (exportName === 'default' ? module.default : undefined);

  if (typeof callback !== 'function') {
    throw new Error(`Exported module '${moduleSpecifier}' (export: '${exportName}') must be a function.`);
  }

  // Nest execution within both AsyncLocalStorage isolation layouts
  return runWithOptions((options as any) || {}, async () =>
    runWithSession((session as any) || {}, async () =>
      Promise.resolve(callback(args))));
};

/**
 * Make sure a worker thread stays alive by ref'ing the `parentPort` or setting a long-running
 * timeout as a fallback mechanism.
 *
 * @param [options] - Config options.
 * @param [options.throwOnParentPortError] - Whether to throw an error if `parentPort.ref` is
 *     not a function. If `false`, no error is thrown, and the fallback mechanism is used.
 * @param [options.timeoutMs] - Milliseconds for the fallback timeout. Defaults to `24` hours.
 * @returns Cleanup function that cancels the keep-alive mechanism, either by calling `parentPort.unref`
 *     or clearing the fallback timer.
 * @throws {Error} If `parentPort.ref` is not a function and `throwOnParentPortError` is `true`.
 */
const keepWorkerAlive = ({ throwOnParentPortError = true, timeoutMs = 86_400_000 } = {}): () => void => {
  if (parentPort && typeof parentPort.ref === 'function') {
    parentPort.ref();

    return () => {
      parentPort?.unref?.();
    };
  }

  if (throwOnParentPortError) {
    throw new Error('parentPort.ref is not a function — worker keep-alive failed');
  }

  const safeTimeout = Math.min(timeoutMs, 2_147_483_646);
  const timer = setTimeout(() => {}, safeTimeout);

  // By design, do not return the clearTimeout, ensure the timer gets wiped from memory
  return () => {
    clearTimeout(timer);
  };
};

/**
 * Route orchestration based on worker thread startup context.
 *
 * Two distinct routes:
 * 1. **Route A: Transient Execution**
 *    - If `workerData` is provided, the worker immediately processes the task using the
 *        provided data.
 *    - Upon task completion, a success or failure message is posted back to the parent thread
 *        via the `parentPort`.
 *
 * 2. **Route B: Persistent Execution**
 *    - If `workerData` is not available, the worker remains active and listens for incoming
 *        task payloads via `parentPort`.
 *    - When a task message is received, it processes the task and sends a success or failure
 *        message back to the parent thread.
 *
 * Both routes use async and handle errors gracefully to relate results or errors back to the parent.
 *
 * @param options - Function options.
 * @param options.throwOnParentPortError - If true, errors thrown by the parent port will be re-thrown.
 */
const runWorker = ({ throwOnParentPortError }: { throwOnParentPortError?: boolean | undefined } = {}): Promise<void> | void => {
  if (workerData) {
    /**
     * Route A: Transient execution (workerData is loaded immediately)
     */
    const clearKeepAlive = keepWorkerAlive({ throwOnParentPortError });

    return executeTask(workerData as WorkerTaskData)
      .then(result => {
        parentPort?.postMessage({ success: true, payload: result });
      })
      .catch((error: unknown) => {
        parentPort?.postMessage({
          success: false,
          error: {
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
          }
        });
      })
      .finally(() => {
        clearKeepAlive();
      });
  } else {
    /**
     * Route B: Persistent execution (Thread stays open waiting for stream events)
     */
    parentPort?.on('message', async (incomingPayload: WorkerTaskData) => {
      try {
        const result = await executeTask(incomingPayload);

        parentPort?.postMessage({ success: true, payload: result });
      } catch (error: unknown) {
        parentPort?.postMessage({
          success: false,
          error: {
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
          }
        });
      }
    });

    return undefined;
  }
};

export { executeTask, keepWorkerAlive, runWorker, type WorkerTaskData };

import { isAsync, isPromise, timeoutFunction } from './server.helpers';
import { log } from './logger';

/**
 * Debug handler callback invoked for deferTask lifecycle events.
 *
 * @template TReturn Return type of the memoized function.
 *
 * @param info - Event payload. Object containing debugging information.
 * @param info.type - Information debugging category. Available options:
 *   `start` | `run` | `run:stopped` | `run:error` | `run:cancel` | `stop`
 *   | `stop:error` | `isRunning`
 * @param info.value - Returns a snapshot of internal-state (`isRunning`,
 *   `count`, and optionally `error`).
 * @param {MemoCache<TReturn>} info.cache - MemoCache array
 */
type DeferTaskDebugHandler = (info: { type: string; value: unknown; [key: string]: unknown; }) => void;

/**
 * Handle for managing the deferred task's lifecycle.
 *
 * @interface DeferTaskHandle
 *
 * @property isRunning - Returns the current running state of the task.
 * @property start - Starts the task and returns the final result promise, after repeating.
 * @property stop - Stops the task and awaits its current execution/cleanup.
 */
interface DeferTaskHandle<TReturn> {
  isRunning: () => boolean;
  start: () => Promise<TReturn | undefined>;
  stop: () => Promise<void>;
}

/**
 * Options for the deferred task.
 *
 * @property [cancelMs] - Hard ms cutoff for cancellation. `undefined`
 *     disables the cutoff. (default `undefined`)
 * @property {DeferTaskDebugHandler} [debug] - Debug callback for lifecycle events.
 *     See {@link deferTask}.
 * @property [intervalMs] - Max time for both per-execution timeout AND
 *     the randomized base delay between repetitions. (default `1000`)
 * @property [repeat] - Number of loops. (default `1`)
 * @property [errorMessage] - Custom error for timeouts. (default `'Task timed out'`)
 */
interface DeferTaskOptions {
  cancelMs?: number;
  debug?: DeferTaskDebugHandler;
  intervalMs?: number;
  repeat?: number | undefined;
  errorMessage?: string;
}

/**
 * Creates a promise that resolves after a specified delay in milliseconds.
 *
 * @param params - The parameters for the delay.
 * @param {number} params.ms - The number of milliseconds to wait before resolving the promise.
 * @param {AbortSignal} [params.signal] - An optional AbortSignal object that allows
 *     the delay to be aborted before completion.
 * @returns {Promise<void>} A promise that resolves after the delay duration or with a
 *     `DOMException` if the delay is aborted via the provided AbortSignal.
 */
const delay = ({ ms, signal }: { ms: number; signal?: AbortSignal | undefined }) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Delay aborted', 'AbortError'));

      return;
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    timer.unref?.();

    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Delay aborted', 'AbortError'));
    };

    signal?.addEventListener('abort', onAbort);
  });

/**
 * Create a managed, repeatable, cancellable task wrapper.
 *
 * Wraps a function (sync or async) or a raw Promise and returns a *factory*.
 * Calling it with the wrapped function's arguments produces a {@link DeferTaskHandle}
 * exposing `start()`, `stop()`, and `isRunning()`.
 *
 * Options:
 * - `repeat`: number of executions. Defaults to `1`. Pass `undefined` to repeat
 *   **indefinitely** until `stop()` is called, `cancelMs` fires, or the task throws.
 * - `intervalMs`: per-execution timeout. Defaults to `1000` ms. Exceeding it rejects
 *   `start()` with `errorMessage` and emits a `run:error` debug event.
 * - `cancelMs`: hard cutoff across the entire `start()` lifetime. `undefined` (default)
 *   disables the cutoff. When it fires, `start()` rejects with `'Task canceled'` and
 *   emits a `run:cancel` debug event.
 * - `errorMessage`: message used for the per-execution timeout rejection.
 *   Defaults to `'Task timed out'`.
 * - `debug`: callback invoked for lifecycle events. Emitted `type` values:
 *   `start`, `run`, `run:stopped`, `run:error`, `run:cancel`, `stop`, `stop:error`,
 *   `isRunning`. `info.value` is a thunk returning a snapshot of internal state.
 *
 * @note Repeating loops should yield between iterations (this implementation uses
 * `await delay(intervalMs)`). This interval serves as both the per-execution
 * timeout and as part of a randomized base delay before the next loop. Do not
 * recurse or loop back immediately after a fast synchronous execution when repeat
 * is unlimited (resource exhaustion).
 *
 *
 * @template TArgs Tuple of arguments forwarded to `func` on each execution.
 * @template TReturn Resolved value type of `func`.
 *
 * @param func Function (sync or async) or a Promise to execute. When a Promise is
 *     provided, it is awaited on each repetition (i.e. the same settled value is
 *     reused).
 * @param {DeferTaskOptions} options Optional {@link DeferTaskOptions} controlling
 *     repeat, timeout, cancel, debug, and error message behavior.
 * @returns A factory `(...args: TArgs) => DeferTaskHandle<TReturn>`. Each
 *     invocation produces an independent handle with its own running state.
 *
 * @example Basic use
 * const handle = deferTask(pollFunc, { repeat: undefined, intervalMs: 5000 })(passedArgsToPollFunc);
 * // Start the task
 * void handle.start();
 * // Stop the task
 * await handle.stop();
 *
 * @example Application pattern
 * // Function to poll
 * const pollFunc = async (passedArgsToPollFunc: string) => {}
 * // Create a handle for the task
 * pollFunc.deferTask = deferTask(pollFunc, { repeat: undefined, intervalMs: 5000 });
 *
 * // Start the task.
 * void pollFunc.deferTask.start(passedArgsToPollFunc);
 * // Stop the task
 * await pollFunc.deferTask.stop();
 */
const deferTask = <TArgs extends unknown[], TReturn>(
  func: ((...args: TArgs) => TReturn | Promise<TReturn>) | Promise<TReturn>,
  {
    cancelMs,
    debug = () => {},
    repeat = 1,
    intervalMs,
    errorMessage = 'Task timed out'
  }: DeferTaskOptions = {}
) => {
  const updatedRepeat = typeof repeat === 'number' ? repeat : undefined;
  const updatedIntervalMs = intervalMs ?? 1000;
  const updatedFunc = async (...args: TArgs) =>
    (!isAsync(func) && isPromise(func) ? func as Promise<TReturn> : (func as (...args: TArgs) => TReturn | Promise<TReturn>)(...args));

  return (...args: TArgs): DeferTaskHandle<TReturn> => {
    const state: {
      isRunning: boolean;
      count: number;
      promise?: Promise<TReturn | undefined> | undefined;
      controller?: AbortController | undefined;
    } = {
      isRunning: false,
      count: 0,
      promise: undefined,
      controller: undefined
    };

    const task = async (): Promise<TReturn | undefined> => {
      if (!state.isRunning || (updatedRepeat !== undefined && state.count >= updatedRepeat)) {
        return undefined;
      }

      const startFunc = timeoutFunction(() => {
        if (state.isRunning) {
          state.count += 1;

          return updatedFunc(...args);
        }

        debug({
          type: 'run:stopped',
          value: () => ({ ...state })
        });

        return undefined;
      }, {
        timeout: updatedIntervalMs,
        errorMessage
      });

      debug({
        type: 'run',
        value: () => ({ ...state })
      });

      const result = await startFunc.catch(error => {
        state.isRunning = false;

        debug({
          type: 'run:error',
          value: () => ({ ...state, error })
        });

        log.error('Defer task error', error);

        return Promise.reject(error);
      });

      if (state.isRunning && (updatedRepeat === undefined || state.count < updatedRepeat)) {
        const randomizedMs = updatedIntervalMs * (0.9 + Math.random() * 0.2);

        try {
          await delay({ ms: randomizedMs, signal: state.controller?.signal });
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') {
            return undefined;
          }

          return Promise.reject(error);
        }

        return task();
      }

      return result;
    };

    return {
      isRunning: () => {
        debug({
          type: 'isRunning',
          value: () => ({ ...state })
        });

        return state.isRunning;
      },
      start: async () => {
        state.isRunning = true;
        state.controller = new AbortController();
        let updatedTask: Promise<TReturn | undefined>;

        debug({
          type: 'start',
          value: () => ({ ...state })
        });

        if (cancelMs !== undefined) {
          updatedTask = timeoutFunction(() => {
            const response = task();

            state.isRunning = false;

            return response;
          }, {
            timeout: cancelMs,
            errorMessage: 'Task canceled'
          }).catch(error => {
            state.isRunning = false;

            debug({
              type: 'run:cancel',
              value: () => ({ ...state, error })
            });

            log.error('Defer task canceled', error);

            return Promise.reject(error);
          });
        } else {
          updatedTask = task();
        }

        state.promise = updatedTask;

        return state.promise;
      },
      stop: async () => {
        state.isRunning = false;
        state.controller?.abort();

        debug({
          type: 'stop',
          value: () => ({ ...state })
        });

        await state.promise?.catch(error => {
          debug({
            type: 'stop:error',
            value: () => ({ ...state, error })
          });

          log.error('Defer task stopped with error', error);
        });
      }
    };
  };
};

export {
  deferTask,
  delay,
  type DeferTaskOptions,
  type DeferTaskHandle,
  type DeferTaskDebugHandler
};

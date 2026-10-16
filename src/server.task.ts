import { cancelFunction, isAsync, isPromise, timeoutFunction } from './server.helpers';
import { formatUnknownError, log } from './logger';

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
 * How {@link DeferTaskOptions.dynamicContext} return values are passed to `func`.
 */
type DeferTaskDynamicContextInvoke = 'call' | 'apply';

/**
 * Parameter object passed to {@link DeferTaskOptions.dynamicContext}.
 *
 * @property [prev] - Result from the previous successful dynamicContext resolution, or undefined on the first run.
 * @property args - Factory arguments passed to the task handle.
 */
type DeferTaskDynamicContextParams<TArgs extends unknown[] = unknown[]> = {
  prev?: unknown;
  args: TArgs;
};

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
 *     disables the cutoff. Must be greater than `intervalMs` when set
 *     otherwise a warning is logged and the cutoff is disabled (default `undefined`)
 * @property [continueOnError] - When `true`, a run error (including a per-run timeout) is
 *     logged and the repeat loop continues instead of rejecting out of `start()`.
 *     Defaults to `false`. `stop()` and `cancelMs` still terminate the loop.
 * @property {DeferTaskDebugHandler} [debug] - Debug callback for lifecycle events.
 *     See {@link deferTask}.
 * @property [delayStartMs] - Delay before the **FIRST** run in ms. (default `0`)
 * @property [intervalMs] - Max time for both per-execution timeout AND
 *     the randomized base delay between repetitions. The per-execution timeout is
 *     derived as `intervalMs * 1.5` so a run is never killed by the same value used
 *     for scheduling. (default `1000`)
 * @property [repeat] - Number of loops.  Pass `Infinity` explicitly to loop
 *     indefinitely. (default `1`)
 * @property [errorMessage] - Custom error for timeouts. (default `'Task timed out'`)
 * @property [dynamicContext] - Optional hook that supplies the next value for `func`.
 *     Receives `{ prev, args }` where `prev` is the last successful return value
 *     (undefined on the first run) and `args` are the original factory arguments.
 *     May be sync or async. If it throws or rejects, a warning is logged and that
 *     run falls back to `func(...factoryArgs)` without updating `prev`.
 * @property [dynamicContextInvoke] - `call` (default): `func(returnValue)`. `apply`:
 *     `func(...argList)` spreading the returned argument tuple.
 */
interface DeferTaskOptions<TArgs extends unknown[] = unknown[]> {
  cancelMs?: number;
  continueOnError?: boolean;
  debug?: DeferTaskDebugHandler;
  delayStartMs?: number;
  intervalMs?: number;
  repeat?: number | undefined;
  errorMessage?: string;
  dynamicContext?: ((params: DeferTaskDynamicContextParams<TArgs>) => unknown | Promise<unknown>) | undefined;
  dynamicContextInvoke?: DeferTaskDynamicContextInvoke;
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
 * - `repeat`: number of executions. Defaults to `1`. Pass `Infinity` to repeat
 *   **indefinitely** until `stop()` is called, `cancelMs` fires, or the task throws.
 * - `intervalMs`: randomized base delay between repetitions. Defaults to `1000` ms.
 *   The per-execution timeout is derived as `intervalMs * 1.5`; exceeding it rejects
 *   `start()` with `errorMessage` and emits a `run:error` debug event.
 * - `delayStartMs`: extra wait before the **first** run only. Defaults to `0`. Like
 *   `intervalMs`, the actual delay is randomized slightly around this value.
 * - `continueOnError`: when `true`, a run error (including a per-run timeout) is
 *   logged and the repeat loop continues instead of rejecting out of `start()`.
 *   Defaults to `false`. `stop()` and `cancelMs` still terminate the loop.
 * - `cancelMs`: hard cutoff across the entire `start()` lifetime. `undefined` (default)
 *   disables the cutoff. Must be greater than `intervalMs` otherwise a warning is
 *   logged and the cutoff is disabled. When it fires, `start()` rejects with
 *   `'Task canceled'` and emits a `run:cancel` debug event.
 * - `errorMessage`: message used for the per-execution timeout rejection.
 *   Defaults to `'Task timed out'`.
 * - `debug`: callback invoked for lifecycle events. Emitted `type` values:
 *   `start`, `run`, `run:stopped`, `run:error`, `run:cancel`, `stop`, `stop:error`,
 *   `isRunning`. `info.value` is a thunk returning a snapshot of internal state.
 * - `dynamicContext`: optional per-run value resolver receiving `{ prev, args }`.
 *   May be async. On failure, logs a warning and that run falls back to `func(...factoryArgs)`
 *   without updating `prev`.
 * - `dynamicContextInvoke`: `call` (default) or `apply` — how the hook return is passed to
 *   `func`. See {@link DeferTaskOptions.dynamicContextInvoke}.
 *
 * @note Repeating loops yield between iterations (this implementation uses
 * `await delay(intervalMs)`). This interval is part of a randomized base delay
 * before the next loop, while the per-execution timeout is derived as
 * `intervalMs * 1.5` so it is always greater than the scheduling delay. Do not
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
 * @param {DeferTaskOptions} options Optional {@link DeferTaskOptions} (see Options
 *     above and interface `@property` entries for full detail).
 * @returns A factory `(...args: TArgs) => DeferTaskHandle<TReturn>`. Each
 *     invocation produces an independent handle with its own running state.
 *
 * @example Basic use
 * const handle = deferTask(pollFunc, { repeat: Infinity, intervalMs: 5000 })(passedArgsToPollFunc);
 * // Start the task. Attach a rejection handler, task errors re-reject out of
 * // `start()` and an unhandled rejection can crash the process.
 * handle.start().catch(error => log.error('Task error', error));
 * // Stop the task
 * await handle.stop();
 *
 * @example Application pattern
 * // Function to poll
 * const pollFunc = async (passedArgsToPollFunc: string) => {}
 * // Create a handle for the task. `continueOnError` keeps the loop alive
 * // when a single run fails (errors are logged instead of re-rejecting).
 * pollFunc.deferTask = deferTask(pollFunc, { repeat: Infinity, intervalMs: 5000, continueOnError: true });
 *
 * // Start the task. Attach a rejection handler, an unhandled rejection can crash the process.
 * pollFunc.deferTask.start(passedArgsToPollFunc).catch(error => log.error('Task error', error));
 * // Stop the task
 * await pollFunc.deferTask.stop();
 */
const deferTask = <TArgs extends unknown[], TReturn>(
  func: ((...args: TArgs) => TReturn | Promise<TReturn>) | Promise<TReturn>,
  options: DeferTaskOptions<TArgs> = {}
) => {
  const {
    cancelMs,
    continueOnError = false,
    debug = () => {},
    delayStartMs,
    repeat,
    intervalMs,
    errorMessage = 'Task timed out',
    dynamicContext,
    dynamicContextInvoke = 'call'
  } = options || {};

  const updatedDynamicContextInvoke: DeferTaskDynamicContextInvoke =
    dynamicContextInvoke === 'apply' ? 'apply' : 'call';

  const validRepeat = typeof repeat === 'number' && repeat > 0 ? repeat : 1;
  const updatedRepeat = Number.isFinite(validRepeat) ? validRepeat : undefined;
  const updatedIntervalMs = typeof intervalMs === 'number' && Number.isFinite(intervalMs) ? intervalMs : 1000;
  const updatedDelayStartMs = typeof delayStartMs === 'number' && Number.isFinite(delayStartMs) ? delayStartMs : 0;
  const runTimeoutMs = updatedIntervalMs * 1.5;
  let updatedCancelMs = cancelMs;

  if (updatedCancelMs !== undefined && updatedCancelMs <= updatedIntervalMs) {
    log.warn(`Defer task cancelMs (${updatedCancelMs}) must be greater than intervalMs (${updatedIntervalMs}). Cutoff disabled.`);
    updatedCancelMs = undefined;
  }

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

    let prevValue: unknown | undefined;

    const resolveDynamic = async (): Promise<{ resolved: boolean; value?: unknown }> => {
      if (typeof dynamicContext === 'function') {
        try {
          const dynamicResult = await cancelFunction(
            () => dynamicContext({ prev: prevValue, args }),
            { signal: state.controller?.signal }
          );

          prevValue = dynamicResult;

          return { resolved: true, value: dynamicResult };
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') {
            return { resolved: false };
          }
          log.warn(`Defer task dynamicContext resolution failed: ${formatUnknownError(error)}`);
        }
      }

      return { resolved: false };
    };

    const task = async (): Promise<TReturn | undefined> => {
      if (!state.isRunning || (updatedRepeat !== undefined && state.count >= updatedRepeat)) {
        return undefined;
      }

      // Initial startup delay
      if (state.count === 0 && updatedDelayStartMs > 0) {
        debug({
          type: 'run:delay',
          value: () => ({ ...state })
        });

        const randomizedStartMs = updatedDelayStartMs * (0.9 + Math.random() * 0.2);

        try {
          await delay({ ms: randomizedStartMs, signal: state.controller?.signal });
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') {
            return undefined;
          }

          return Promise.reject(error);
        }

        if (!state.isRunning) {
          return undefined;
        }
      }

      const startFunc = timeoutFunction(async () => {
        if (state.isRunning) {
          if (typeof dynamicContext === 'function') {
            const { resolved, value } = await resolveDynamic();

            if (!state.isRunning) {
              debug({
                type: 'run:stopped',
                value: () => ({ ...state })
              });

              return undefined;
            }

            if (resolved) {
              state.count += 1;
              if (updatedDynamicContextInvoke === 'apply') {
                const updatedValue = (value ?? []) as TArgs;

                return updatedFunc(...updatedValue);
              }

              return (updatedFunc as unknown as (arg: unknown) => TReturn | Promise<TReturn>)(value);
            }
          }

          state.count += 1;

          return updatedFunc(...args);
        }

        debug({
          type: 'run:stopped',
          value: () => ({ ...state })
        });

        return undefined;
      }, {
        timeout: runTimeoutMs,
        errorMessage
      });

      debug({
        type: 'run',
        value: () => ({ ...state })
      });

      const result = await startFunc.catch(error => {
        if (continueOnError && (updatedRepeat === undefined || state.count < updatedRepeat)) {
          debug({
            type: 'run:error',
            value: () => ({ ...state, error })
          });

          log.error('Defer task error', error);

          return undefined;
        }

        state.isRunning = false;

        debug({
          type: 'run:error',
          value: () => ({ ...state, error })
        });

        log.error('Defer task error', error);

        return Promise.reject(error);
      });

      // Subsequent interval delay
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

        if (updatedCancelMs !== undefined) {
          updatedTask = timeoutFunction(() => task(), {
            timeout: updatedCancelMs,
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
  type DeferTaskDebugHandler,
  type DeferTaskDynamicContextInvoke,
  type DeferTaskDynamicContextParams
};

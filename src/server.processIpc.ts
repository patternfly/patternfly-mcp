import { type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';

/**
 * Base IPC (Inter-Process Communication) request envelope.
 *
 * Every request carries a message type and a correlation id. Concrete protocols
 * intersect this with their own fields, e.g. `ProcessRequest & { specs: string[] }`.
 *
 * @property t - Message type.
 * @property id - Message identifier.
 */
type ProcessRequest = { t: string; id: string };

/**
 * Base IPC (Inter-Process Communication) response envelope.
 *
 * @property t - Message type.
 * @property id - Message identifier.
 */
type ProcessResponse = { t: string; id: string };

/**
 * Serialized error object for IPC.
 *
 * @property message - Error message.
 * @property stack - Error stack trace.
 * @property code - Error code.
 * @property cause - Error cause.
 * @property details - Additional details.
 */
type SerializedError = {
  message: string;
  stack?: string | undefined;
  code?: string | undefined;
  cause?: unknown;
  details?: unknown
};

/**
 * Generate a unique ID for IPC messages.
 */
const makeId = () => randomUUID();

/**
 * Send an IPC message to the provided process.
 *
 * @param processRef
 * @param {ProcessRequest} request
 */
const send = (
  processRef: NodeJS.Process | ChildProcess,
  request: ProcessRequest
): boolean => Boolean(processRef.send?.(request));

/**
 * Serialize an error value into a structured object.
 *
 * @param errorValue - Error-like value to serialize.
 * @returns {SerializedError} - Serialized error object.
 */
const serializeError = (errorValue: unknown): SerializedError => {
  const err = errorValue as SerializedError | undefined;

  return {
    message: err?.message || String(errorValue),
    stack: err?.stack,
    code: err?.code,
    details: err?.details,
    cause: err?.cause
  };
};

/**
 * Build a type guard that matches a response by message type and, optionally, id.
 *
 * Replaces the hand-written `isXAck` factories with a single generic matcher.
 *
 * @param type - Expected `t` message type.
 * @param expectedId - Optional identifier to match against the message `id` field.
 * @returns Function that determines if a message matches the type (and id).
 */
const matchResponse = <T extends ProcessResponse>(type: string, expectedId?: string) =>
  (message: any): message is T => {
    if (!message || message.t !== type) {
      return false;
    }

    if (expectedId !== undefined) {
      return message.id === expectedId;
    }

    return typeof message.id === 'string';
  };

/**
 * Await an IPC response from the provided process.
 *
 * Resolves on the first message that satisfies `matcher`. Rejects on early
 * `exit`/`disconnect` or timeout. Always cleans up listeners and timers.
 *
 * @param processRef
 * @param matcher
 * @param timeoutMs
 */
const awaitIpc = <T extends ProcessResponse>(
  processRef: NodeJS.Process | ChildProcess,
  matcher: (message: any) => message is T,
  timeoutMs: number
): Promise<T> => new Promise((resolve, reject) => {
  let settled = false;

  // Cleanup listeners and timers on exit or timeout
  const cleanup = () => {
    processRef.off('message', onMessage);
    processRef.off('exit', onExit);
    processRef.off('disconnect', onExit);
    clearTimeout(timerId);
  };

  // Listen for messages and resolve on match
  const onMessage = (message: any) => {
    if (settled) {
      return;
    }

    if (matcher(message)) {
      settled = true;
      cleanup();
      resolve(message);
    }
  };

  // Reject on exit or disconnect
  const onExit = (code?: number, signal?: string) => {
    if (settled) {
      return;
    }

    settled = true;
    cleanup();
    reject(new Error(`Child process exited before response (code=${code}, signal=${signal || 'none'})`));
  };

  // Set a timeout to reject if the process doesn't respond
  const timerId = setTimeout(() => {
    if (settled) {
      return;
    }

    settled = true;
    cleanup();
    reject(new Error('Timed out waiting for IPC response'));
  }, timeoutMs);

  timerId?.unref?.();

  // Attach listeners to the process
  processRef.on('message', onMessage);
  processRef.on('exit', onExit);
  processRef.on('disconnect', onExit);
});

export {
  send,
  awaitIpc,
  makeId,
  matchResponse,
  serializeError,
  type ProcessRequest,
  type ProcessResponse,
  type SerializedError
};

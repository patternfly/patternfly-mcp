import { type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { type ToolOptions } from './options.tools';

/**
 * IPC (Inter-Process Communication) request messages.
 *
 * - `hello` - Sent by the host to the process to acknowledge receipt.
 * - `load` - Sent by the host to the process to load tools.
 * - `manifest:get` - Sent by the host to the process to request a list of available tools.
 * - `invoke` - Sent by the host to the process to invoke a tool.
 * - `shutdown` - Sent by the host to the process to shutdown.
 *
 * @property t - Message type.
 * @property id - Message identifier.
 * @property specs - List of tool module specifiers to load.
 * @property invokeTimeoutMs - Timeout for tool invocations.
 * @property {ToolOptions} toolOptions - Options to pass to tool creators.
 */
type IpcRequest =
  | { t: 'hello'; id: string } |
  { t: 'load'; id: string; specs: string[]; invokeTimeoutMs?: number; toolOptions?: ToolOptions } |
  { t: 'manifest:get'; id: string } |
  { t: 'invoke'; id: string; toolId: string; args: unknown } |
  { t: 'shutdown'; id: string };

/**
 * Serialized error object for IPC.
 *
 * @property message - Error message.
 * @property stack - Error stack trace.
 * @property code - Error code.
 * @property cause - Error cause.
 * @property details - Additional details.
 */
type SerializedError = { message: string; stack?: string; code?: string; cause?: unknown; details?: unknown };

/**
 * Tool descriptor object for IPC.
 *
 * @property id - Tool identifier.
 * @property name - Tool name.
 * @property description - Tool description.
 * @property inputSchema - Tool input schema.
 * @property source - Tool module specifier.
 */
type ToolDescriptor = {
  id: string;
  name: string;
  description: string;
  inputSchema: any;
  source?: string;
};

/**
 * Inter-Process Communication (IPC) responses.
 *
 * Types:
 * - 'hello:ack': Acknowledgment message for a "hello" operation, including an identifier.
 * - 'load:ack': Acknowledgment message for a "load" operation, including an identifier,
 *   and arrays of warnings and errors.
 * - 'manifest:result': Message containing the result of a "manifest" operation, including an
 *   identifier and a list of tool descriptors.
 * - 'invoke:result' (success case): Message containing the result of a successful "invoke"
 *   operation, including an identifier, a success flag, and the result.
 * - 'invoke:result' (failure case): Message containing the result of a failed "invoke"
 *   operation, including an identifier, a failure flag, and an error descriptor.
 * - 'shutdown:ack': Acknowledgment message for a "shutdown" operation, including an identifier.
 *
 * @property t - Message type.
 * @property id - Message identifier.
 * @property warnings - List of warnings generated during tool loading.
 * @property errors - List of errors generated during tool loading.
 * @property {ToolDescriptor[]} tools - List of available tools.
 * @property ok - Success flag.
 * @property result - Result of the operation.
 * @property {SerializedError} error - Error descriptor.
 */
type IpcResponse =
  | { t: 'hello:ack'; id: string } |
  { t: 'load:ack'; id: string; warnings: string[]; errors: string[] } |
  { t: 'manifest:result'; id: string; tools: ToolDescriptor[] } |
  { t: 'invoke:result'; id: string; ok: true; result: unknown } |
  { t: 'invoke:result'; id: string; ok: false; error: SerializedError } |
  { t: 'shutdown:ack'; id: string };

/**
 * Generate a unique ID for IPC messages.
 */
const makeId = () => randomUUID();

/**
 * Send an IPC message to the provided process.
 *
 * @param processRef
 * @param {IpcRequest} request
 */
const send = (
  processRef: NodeJS.Process | ChildProcess,
  request: IpcRequest
): boolean => Boolean(processRef.send?.(request));

/**
 * Await an IPC response from the provided process.
 *
 * @param processRef
 * @param matcher
 * @param timeoutMs
 */
const awaitIpc = <T extends IpcResponse>(
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

  // Listen for messages and resolve on match or timeout
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

  // Reject on exit or timeout
  const onExit = (code?: number, signal?: string) => {
    if (settled) {
      return;
    }

    settled = true;
    cleanup();
    reject(new Error(`Tools Host exited before response (code=${code}, signal=${signal || 'none'})`));
  };

  // Set a timeout to reject if the process doesn't respond'
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

/**
 * Check if a message is a "hello" response. IPC message type guards.
 *
 * @param message
 */
const isHelloAck = (message: any): message is { t: 'hello:ack'; id: string } => {
  if (!message || message.t !== 'hello:ack') {
    return false;
  }

  return typeof message.id === 'string';
};

/**
 * Check if a message is a "load" response. IPC message type guards.
 *
 * Checks
 * - If a given message is a valid load acknowledgment (`load:ack`) with expected id
 * - That the message contains the proper structure, including the required fields and
 *     correct types for `warnings` and `errors`.
 *
 * @param expectedId - Expected identifier to match against the message `id` field.
 * @returns Function that takes a message and determines if it conforms to the expected structure and values.
 */
const isLoadAck = (expectedId: string) => (message: any): message is {
  t: 'load:ack'; id: string; warnings: string[]; errors: string[]
} => {
  if (!message || message.t !== 'load:ack' || message.id !== expectedId) {
    return false;
  }

  const hasWarnings = Array.isArray(message.warnings);
  const hasErrors = Array.isArray(message.errors);

  return hasWarnings && hasErrors;
};

/**
 * Check if a message is a "manifest" response. IPC message type guards.
 *
 * @param expectedId
 */
const isManifestResult = (expectedId: string) => (message: any): message is {
  t: 'manifest:result'; id: string; tools: ToolDescriptor[]
} => {
  if (!message || message.t !== 'manifest:result' || message.id !== expectedId) {
    return false;
  }

  return Array.isArray(message.tools);
};

/**
 * Check if a message is an "invoke" response. IPC message type guards.
 *
 * @param expectedId
 */
const isInvokeResult = (expectedId: string) => (message: any): message is
  { t: 'invoke:result'; id: string; ok: true; result: unknown } |
  { t: 'invoke:result'; id: string; ok: false; error: SerializedError } => {
  if (!message || message.t !== 'invoke:result') {
    return false;
  }

  return message.id === expectedId;
};

export {
  send,
  awaitIpc,
  makeId,
  isHelloAck,
  isLoadAck,
  isManifestResult,
  isInvokeResult,
  type IpcRequest,
  type IpcResponse,
  type ToolDescriptor,
  type SerializedError
};

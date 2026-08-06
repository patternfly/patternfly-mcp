import { type CollectionOptions } from './options.collections';
import {
  send,
  awaitIpc,
  makeId,
  matchResponse,
  serializeError,
  type SerializedError
} from './server.processIpc';

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
 * @property {CollectionOptions} options - Options to pass to creators.
 * @property session - Session object to pass to creators.
 * @property isInternal - Indicates if the request is internal.
 */
type IpcRequest =
  | { t: 'hello'; id: string } |
  { t: 'load'; id: string; specs: string[]; invokeTimeoutMs?: number; options?: CollectionOptions; session?: unknown; isInternal?: boolean } |
  { t: 'manifest:get'; id: string } |
  { t: 'invoke'; id: string; collectionId: string; args: unknown; options?: unknown; session?: unknown; isInternal?: boolean } |
  { t: 'shutdown'; id: string };

/**
 * Collection descriptor object for IPC.
 *
 * @property id - Collection identifier.
 * @property name - Collection name.
 * @property source - Collection module specifier.
 */
type CollectionDescriptor = {
  id: string;
  name: string;
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
  { t: 'manifest:result'; id: string; collections: CollectionDescriptor[] } |
  { t: 'invoke:result'; id: string; ok: true; result: unknown } |
  { t: 'invoke:result'; id: string; ok: false; error: SerializedError } |
  { t: 'shutdown:ack'; id: string };

export {
  send,
  awaitIpc,
  makeId,
  matchResponse,
  serializeError,
  type IpcRequest,
  type IpcResponse,
  type CollectionDescriptor,
  type SerializedError
};

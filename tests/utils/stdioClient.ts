#!/usr/bin/env node

// Lightweight JSON-RPC over stdio client for the built MCP server (dist/index.js)
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

// JSON-like value used in requests/responses
export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

export interface RpcError {
  code: number;
  message: string;
  data?: Json;
}

export interface RpcResultCommon {
  content?: Array<({ text?: string } & Record<string, unknown>)>;
  tools?: Array<({ name: string } & Record<string, unknown>)>;
  [k: string]: unknown;
}

export interface RpcResponse {
  jsonrpc?: '2.0';
  id: number | string;
  result?: RpcResultCommon;
  error?: RpcError;
}

export interface RpcRequest {
  jsonrpc?: '2.0';
  id?: number | string;
  method: string;
  params?: Json;
}

export interface StartOptions {
  command?: string;
  serverPath?: string;
  args?: string[];
  env?: Record<string, string | undefined>;
}

interface PendingEntry {
  resolve: (value: RpcResponse) => void;
  reject: (reason?: Error) => void;
  timer: NodeJS.Timeout;
}

export interface StdioClient {
  proc: ChildProcessWithoutNullStreams;
  send: (request: RpcRequest, opts?: { timeoutMs?: number }) => Promise<RpcResponse>;
  stop: (signal?: NodeJS.Signals) => Promise<void>;
}

/**
 * Check if the value is a valid RPC response.
 *
 * @param {RpcResponse|unknown} val
 * @returns {boolean} Is value an RpcResponse.
 */
export const isRpcResponse = (val: RpcResponse | unknown): boolean =>
  typeof val === 'object' && val !== null && ('jsonrpc' in val) && ('id' in val);

/**
 * Start the MCP server process and return a client with send/stop APIs.
 *
 * Options:
 * - command: node command to run (default: 'node')
 * - serverPath: path to built server (default: process.env.SERVER_PATH || 'dist/index.js')
 * - args: additional args to pass to server (e.g., ['--docs-host'])
 * - env: env vars to pass to child
 *
 * @param params
 * @param params.command
 * @param params.serverPath
 * @param params.args
 * @param params.env
 */
export const startServer = async ({
  command = 'node',
  serverPath = process.env.SERVER_PATH || 'dist/index.js',
  args = [],
  env = {}
}: StartOptions = {}): Promise<StdioClient> => {
  const proc: ChildProcessWithoutNullStreams = spawn(command, [serverPath, ...args], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...env }
  });

  const pending = new Map<number | string, PendingEntry>(); // id -> { resolve, reject, timer }
  let buffer = '';
  let stderr = '';
  let isClosed = false;

  const clearAllPending = (reason: string) => {
    for (const [id, p] of pending.entries()) {
      clearTimeout(p.timer);
      p.reject(new Error(`Server closed before response id=${String(id)}. ${reason || ''} stderr: ${stderr}`));
      pending.delete(id);
    }
  };

  proc.stdout.on('data', (data: Buffer) => {
    buffer += data.toString();
    let idx: number;

    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim();

      buffer = buffer.slice(idx + 1);

      if (!line) {
        continue;
      }

      let parsed: RpcResponse = {} as RpcResponse;

      try {
        parsed = JSON.parse(line);
      } catch {}

      if (isRpcResponse(parsed) === false) {
        continue;
      }

      if (pending.has(parsed.id)) {
        const entry = pending.get(parsed.id)!;

        clearTimeout(entry.timer);
        pending.delete(parsed.id);
        entry.resolve(parsed);
      }
    }
  });

  proc.stderr.on('data', (data: Buffer) => {
    stderr += data.toString();
  });

  const stop = (signal: NodeJS.Signals = 'SIGINT'): Promise<void> => new Promise(resolve => {
    if (isClosed) {
      return resolve();
    }

    isClosed = true;

    try {
      proc.kill(signal);
    } catch {
      // ignore
    }

    proc.on('close', () => {
      clearAllPending('Process closed.');
      resolve();
    });
  });

  const send: StdioClient['send'] = (request, { timeoutMs = 20000 } = {}) => new Promise((resolve, reject) => {
    if (!request || typeof request !== 'object') {
      return reject(new Error('Invalid request'));
    }

    const id: number | string = request.id || Math.floor(Math.random() * 1e9);
    const rpc: RpcRequest = { jsonrpc: '2.0', ...request, id };
    const ms = Number(process.env.TEST_TIMEOUT_MS || timeoutMs);
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timeout waiting for response id=${String(id)}. stderr: ${stderr}`));
    }, ms);

    pending.set(id, { resolve, reject, timer });

    try {
      proc.stdin.write(JSON.stringify(rpc) + '\n');
    } catch (err) {
      clearTimeout(timer);
      pending.delete(id);

      const error = err instanceof Error ? err : new Error(String(err));

      reject(error);
    }
  });

  return { proc, send, stop };
};

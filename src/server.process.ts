import { spawn, type ChildProcess } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { log, formatUnknownError } from './logger';
import {
  awaitIpc,
  send,
  makeId,
  matchResponse,
  type ProcessRequest,
  type ProcessResponse,
  type SerializedError
} from './server.processIpc';

/**
 * Isolation options for a spawned child process.
 *
 * @property mode - 'strict' enables Node permission model; 'none' disables it.
 * @property nodeVersion - Detected Node major version (selects the permission flag).
 * @property fsReadAllowlist - Directories to allow read access under strict mode.
 */
type IsolationOptions = {
  mode?: 'strict' | 'none';
  nodeVersion?: number;
  fsReadAllowlist?: string[];
};

/**
 * Configuration for spawning a child process.
 *
 * @property importSpecifier - Import map specifier for the child entry (e.g. `#toolsHost`).
 * @property entry - Pre-resolved absolute entry path (overrides `importSpecifier`).
 * @property isolation - Node isolation options.
 * @property label - Human-readable label used in error/log messages.
 * @property enableStderrDebug - Optional stderr reader factory; returns a `closeStderr`.
 */
type SpawnConfig = {
  importSpecifier: string;
  entry?: string;
  isolation?: IsolationOptions;
  label?: string;
  enableStderrDebug?: (child: ChildProcess) => () => void;
};

/**
 * Handle for a spawned child process.
 *
 * @property child - The child process.
 * @property closeStderr - Detach the stderr debug reader.
 * @property request - Typed round-trip: send a request and await a matching response.
 */
type ChildHandle = {
  child: ChildProcess;
  closeStderr: () => void;
  request: <T extends ProcessResponse>(
    req: Omit<ProcessRequest, 'id'> & { id?: string } & Record<string, unknown>,
    responseType: string,
    timeoutMs: number,
    correlate?: boolean
  ) => Promise<T>;
};

/**
 * Generic per-session registry of live child handles.
 */
const activeChildrenBySession = new Map<string, ChildHandle>();

/**
 * Resolve a child entry path from an import specifier or a pre-resolved path.
 *
 * @param {SpawnConfig} config
 * @throws {Error} If the entry cannot be resolved.
 */
const resolveEntry = ({ importSpecifier, entry, label = 'child process' }: SpawnConfig): string => {
  if (entry) {
    return entry;
  }

  let resolved: string | undefined = undefined;

  try {
    resolved = fileURLToPath(import.meta.resolve(importSpecifier));
  } catch (error) {
    log.debug(`Failed to import.meta.resolve ${label} entry '${importSpecifier}': ${formatUnknownError(error)}`);

    if (process.env.NODE_ENV === 'local') {
      resolved = '/mock/path/to/host.js';
    }
  }

  if (resolved === undefined) {
    throw new Error(`Failed to resolve ${label} entry '${importSpecifier}'.`);
  }

  return resolved;
};

/**
 * Build Node isolation flags for a strict-mode child process.
 *
 * @param entry - Resolved child entry path (its dir is auto-added to the allowlist).
 * @param {IsolationOptions} isolation
 * @returns Array of Node CLI args.
 */
const buildIsolationArgs = (entry: string, isolation: IsolationOptions = {}): string[] => {
  const { mode, nodeVersion = 0, fsReadAllowlist = [] } = isolation;

  if (mode !== 'strict') {
    return [];
  }

  // Node 24+ moves to using the "--permission" flag instead of "--experimental-permission"
  const permissionFlag = nodeVersion >= 24 ? '--permission' : '--experimental-permission';
  const nodeArgs: string[] = [permissionFlag];

  const allowSet = new Set<string>(fsReadAllowlist);

  allowSet.add(dirname(entry));

  // Normalize to real absolute paths to avoid symlink mismatches
  const allowList = [...allowSet]
    .map(dir => {
      try {
        return realpathSync(dir);
      } catch {
        return dir;
      }
    })
    .filter(Boolean);

  for (const dir of allowList) {
    nodeArgs.push(`--allow-fs-read=${dir}`);
  }

  log.debug(`Child allow-fs-read flags: ${allowList.map(dir => `--allow-fs-read=${dir}`).join(' ')}`);
  log.debug(`Child permission flag: ${permissionFlag}`);

  return nodeArgs;
};

/**
 * Spawn a child process with the standard IPC-capable stdio shape and return a handle.
 *
 * @param {SpawnConfig} config
 * @returns {ChildHandle}
 */
const spawnChildProcess = (config: SpawnConfig): ChildHandle => {
  const entry = resolveEntry(config);
  const nodeArgs = buildIsolationArgs(entry, config.isolation);

  const child: ChildProcess = spawn(process.execPath, [...nodeArgs, entry], {
    stdio: ['ignore', 'pipe', 'pipe', 'ipc']
  });

  const closeStderr = config.enableStderrDebug?.(child) ?? (() => {});

  const request = <T extends ProcessResponse>(
    req: Omit<ProcessRequest, 'id'> & { id?: string } & Record<string, unknown>,
    responseType: string,
    timeoutMs: number,
    correlate = true
  ): Promise<T> => {
    const id = req.id ?? makeId();
    const errorType = `${req.t}:error`;
    const matchOk = matchResponse<T>(responseType, correlate ? id : undefined);
    const matchErr = matchResponse(errorType, correlate ? id : undefined);

    // Resolve on the expected response OR the correlated `<type>:error` envelope
    // emitted by the generic host's requestFallback, so a thrown handler rejects
    // promptly rather than waiting for the timeout.
    const matcher = (message: any): message is T => matchOk(message) || matchErr(message);

    const pending = awaitIpc<T>(child, matcher, timeoutMs).then(message => {
      if ((message as ProcessResponse)?.t === errorType) {
        const errorValue = (message as { error?: SerializedError })?.error;
        const settledError = new Error(errorValue?.message || 'Child process handler error', {
          cause: errorValue?.cause
        }) as Error & { code?: string; details?: unknown };

        if (errorValue?.stack) {
          settledError.stack = errorValue.stack;
        }

        if (errorValue?.code) {
          settledError.code = errorValue.code;
        }

        if (errorValue?.details) {
          settledError.details = errorValue.details;
        }

        throw settledError;
      }

      return message;
    });

    send(child, { ...req, id } as ProcessRequest);

    return pending;
  };

  return { child, closeStderr, request };
};

/**
 * Best-effort graceful shutdown of a child process with primary/secondary SIGKILL fallback.
 *
 * @param {ChildHandle} handle - The child handle to shut down.
 * @param options - Shutdown options.
 * @param options.gracePeriodMs - Primary grace period before force-kill.
 * @param options.sessionId - Optional session id to clean from the registry.
 * @param options.label - Human-readable label for logs.
 */
const shutdownChildProcess = async (
  handle: ChildHandle | undefined,
  { gracePeriodMs = 0, sessionId, label = 'child process' }: {
    gracePeriodMs?: number; sessionId?: string; label?: string;
  } = {}
): Promise<void> => {
  if (!handle) {
    return;
  }

  const grace = Math.max(0, Number(gracePeriodMs) || 0);
  const fallbackGrace = grace + 200;
  const child = handle.child;

  let resolved = false;
  let forceKillPrimary: NodeJS.Timeout | undefined;
  let forceKillSecondary: NodeJS.Timeout | undefined;
  let resolveIt: ((value: PromiseLike<void> | void) => void) | undefined;

  const shutdownChild = () => {
    if (resolved) {
      return;
    }

    resolved = true;
    child.off('exit', shutdownChild);
    child.off('disconnect', shutdownChild);

    if (forceKillPrimary) {
      clearTimeout(forceKillPrimary);
    }

    if (forceKillSecondary) {
      clearTimeout(forceKillSecondary);
    }

    try {
      handle.closeStderr();
      log.info(`${label} stderr reader closed.`);
    } catch (error) {
      log.error(`Failed to close ${label} stderr reader: ${formatUnknownError(error)}`);
    }

    if (sessionId !== undefined) {
      const confirmHandle = activeChildrenBySession.get(sessionId);

      if (confirmHandle?.child === child) {
        activeChildrenBySession.delete(sessionId);
      }
    }

    resolveIt?.();
  };

  const sigkillChild = (isSecondaryFallback = false) => {
    try {
      if (!child?.killed) {
        log.warn(
          `${
            (resolved && 'Already attempted shutdown.') || 'Slow shutdown response.'
          } ${
            (isSecondaryFallback && 'Secondary') || 'Primary'
          } fallback force-killing ${label}.`
        );
        child.kill('SIGKILL');
      }
    } catch (error) {
      log.error(`Failed to force-kill ${label}: ${formatUnknownError(error)}`);
    }
  };

  await new Promise<void>(resolve => {
    resolveIt = resolve;

    try {
      send(child, { t: 'shutdown', id: makeId() });
    } catch (error) {
      log.error(`Failed to send shutdown signal to ${label}: ${formatUnknownError(error)}`);
    }

    forceKillPrimary = setTimeout(() => {
      sigkillChild();
      shutdownChild();
    }, grace);
    forceKillPrimary?.unref?.();

    forceKillSecondary = setTimeout(() => {
      sigkillChild(true);
      shutdownChild();
    }, fallbackGrace);
    forceKillSecondary?.unref?.();

    child.once('exit', shutdownChild);
    child.once('disconnect', shutdownChild);
  });
};

export {
  spawnChildProcess,
  shutdownChildProcess,
  buildIsolationArgs,
  resolveEntry,
  activeChildrenBySession,
  type SpawnConfig,
  type IsolationOptions,
  type ChildHandle
};

import { spawn, type ChildProcess } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { z } from 'zod';
import { type AppSession, type GlobalOptions } from './options';
import { type McpToolCreator } from './server';
import { log, formatUnknownError } from './logger';
import {
  awaitIpc,
  send,
  makeId,
  isHelloAck,
  isLoadAck,
  isManifestResult,
  isInvokeResult,
  type ToolDescriptor
} from './server.toolsIpc';
import { getOptions, getSessionOptions } from './options.context';
import { setToolOptions } from './options.tools';
import { normalizeTools, type NormalizedToolEntry } from './server.toolsUser';
import { jsonSchemaToZod } from './server.schema';

/**
 * Handle for a spawned Tools Host process.
 *
 * @property child - Child process
 * @property tools - Array of tool descriptors from `tools/list`
 * @property closeStderr - Optional function to close stderr reader
 */
type HostHandle = {
  child: ChildProcess;
  tools: ToolDescriptor[];
  closeStderr?: () => void;
};

/**
 * Map of active Tools Hosts per session.
 */
const activeHostsBySession = new Map<string, HostHandle>();

/**
 * Get the tool name from a creator function.
 *
 * @param creator - Tool creator function
 */
const getBuiltInToolName = (creator: McpToolCreator): string | undefined => (creator as McpToolCreator & { toolName?: string })?.toolName;

/**
 * Compute the allowlist for the Tools Host.
 *
 * @param {GlobalOptions} options - Global options.
 * @returns Array of absolute directories to allow read access.
 */
const computeFsReadAllowlist = (options: GlobalOptions = getOptions()): string[] => {
  const directories = new Set<string>();
  const tools = normalizeTools.memo(options.toolModules, options);

  directories.add(options.contextPath);

  tools.forEach(tool => {
    if (tool.fsReadDir) {
      directories.add(tool.fsReadDir);
    }
  });

  return [...directories];
};

/**
 * Log warnings and errors from Tools' load.
 *
 * @param warningsErrors - Object containing warnings and errors
 * @param warningsErrors.warnings - Log warnings
 * @param warningsErrors.errors - Log errors
 */
const logWarningsErrors = ({ warnings = [], errors = [] }: { warnings?: string[], errors?: string[] } = {}) => {
  if (Array.isArray(warnings) && warnings.length > 0) {
    const lines = warnings.map(warning => `  - ${String(warning)}`);

    log.warn(`Tools load warnings (${warnings.length})\n${lines.join('\n')}`);
  }

  if (Array.isArray(errors) && errors.length > 0) {
    const lines = errors.map(error => `  - ${String(error)}`);

    log.warn(`Tools load errors (${errors.length})\n${lines.join('\n')}`);
  }
};

/**
 * Get normalized file and package tool modules.
 *
 * @param {GlobalOptions} options - Global options.
 * @returns Updated array of normalized tool modules
 */
const getFilePackageToolModules = ({ contextPath, toolModules }: GlobalOptions = getOptions()): string[] =>
  normalizeTools
    .memo(toolModules, { contextPath })
    .filter(tool => tool.type === 'file' || tool.type === 'package')
    .map(tool => tool.normalizedUrl as string);

/**
 * Debug a child process' stderr output.
 *
 * @param child - Child process to debug
 * @param {AppSession} sessionOptions - Session options
 */
const debugChild = (child: ChildProcess, { sessionId } = getSessionOptions()) => {
  const childPid = child.pid;
  const promoted = new Set<string>();

  const debugHandler = (chunk: Buffer | string) => {
    const raw = String(chunk);

    if (!raw || !raw.trim()) {
      return;
    }

    // Split multi-line chunks so each line is tagged
    const lines = raw.split(/\r?\n/).filter(Boolean);

    for (const line of lines) {
      const tagged = `[tools-host pid=${childPid} sid=${sessionId}] ${line}`;

      // Pattern: Node 22+ permission denial (FileSystemRead)
      const fsMatch = line.match(/ERR_ACCESS_DENIED.*FileSystemRead.*resource:\s*'([^']+)'/);

      if (fsMatch) {
        const resource = fsMatch[1];
        const key = `fs-deny:${resource}`;

        if (!promoted.has(key)) {
          promoted.add(key);
          log.warn(
            `Tools Host denied fs read: ${resource}. In strict mode, add its directory to --allow-fs-read.\nOptionally, you can disable strict mode entirely with pluginIsolation: 'none'.`
          );
        } else {
          log.debug(tagged);
        }
        continue;
      }

      // Pattern: ESM/CJS import issues
      if (
        /ERR_MODULE_NOT_FOUND/.test(line) ||
        /Cannot use import statement outside a module/.test(line) ||
        /ERR_UNKNOWN_FILE_EXTENSION/.test(line)
      ) {
        const key = `esm:${line}`;

        if (!promoted.has(key)) {
          promoted.add(key);
          log.warn('Tools Host import error. Ensure external tools are ESM (no raw .ts) and resolvable.\nFor local files, prefer a file:// URL.');
        } else {
          log.debug(tagged);
        }
        continue;
      }

      // Default: debug-level passthrough
      log.debug(tagged);
    }
  };

  child.stderr?.on('data', debugHandler);

  return () => {
    try {
      child.stderr?.off('data', debugHandler);
    } catch {}
  };
};

/**
 * Spawn the Tools Host (child process), load external tools, and return a host handle.
 *
 * - See `package.json` import path for entry parameter.
 * - Requires Node ≥ 22 for process isolation flags.
 * - Attaches a stderr reader for debugging if protocol logging is enabled.
 * - Returns descriptors from `tools/list` and an IPC-capable child.
 *
 * @param {GlobalOptions} options - Global options.
 * @returns Host handle used by `makeProxyCreators` and shutdown.
 */
const spawnToolsHost = async (
  options: GlobalOptions = getOptions()
): Promise<HostHandle> => {
  const { pluginIsolation, pluginHost } = options || {};
  const { loadTimeoutMs, invokeTimeoutMs } = pluginHost || {};
  const nodeArgs: string[] = [];
  let updatedEntry: string;

  try {
    const entryUrl = import.meta.resolve('#toolsHost');

    updatedEntry = fileURLToPath(entryUrl);
  } catch (error) {
    log.debug(`Failed to resolve Tools Host entry: ${formatUnknownError(error)}`);

    // In unit tests, we allow a graceful fallback to enable spawn path assertions
    if (process.env.NODE_ENV === 'test') {
      updatedEntry = '/mock/path/to/toolsHost.js';
    } else {
      throw new Error(
        `Failed to resolve Tools Host entry '#toolsHost' from package imports: ${formatUnknownError(error)}`
      );
    }
  }

  // Deny network and fs write by omission
  if (pluginIsolation === 'strict') {
    // nodeArgs.push('--experimental-permission');
    const major = options?.nodeVersion || 0;
    const permissionFlag = major >= 24 ? '--permission' : '--experimental-permission';

    nodeArgs.push(permissionFlag);

    // 1) Gather directories (project, plugin modules, and the host entry's dir)
    const allowSet = new Set<string>(computeFsReadAllowlist());

    allowSet.add(dirname(updatedEntry));

    // 2) Normalize to real absolute paths to avoid symlink mismatches
    // Using top-level import instead of dynamic import for better performance
    const allowList = [...allowSet]
      .map(dir => {
        try {
          return realpathSync(dir);
        } catch {
          return dir;
        }
      })
      .filter(Boolean);

    // 3) Pass one --allow-fs-read per directory (more robust than a single comma-separated flag)
    for (const dir of allowList) {
      nodeArgs.push(`--allow-fs-read=${dir}`);
    }

    // Optional debug to verify exactly what the child gets
    log.debug(`Tools Host allow-fs-read flags: ${allowList.map(dir => `--allow-fs-read=${dir}`).join(' ')}`);
    log.debug(`Tools Host permission flag: ${permissionFlag}`);
  }

  // Pre-compute file and package tool modules before spawning to reduce latency
  const filePackageToolModules = getFilePackageToolModules();

  const child: ChildProcess = spawn(process.execPath, [...nodeArgs, updatedEntry], {
    stdio: ['ignore', 'pipe', 'pipe', 'ipc']
  });

  const closeStderr = debugChild(child);

  // hello
  send(child, { t: 'hello', id: makeId() });
  await awaitIpc(child, isHelloAck, loadTimeoutMs);

  // load
  const loadId = makeId();

  // Pass a focused set of tool options to the host. Avoid the full options object.
  const toolOptions = setToolOptions(options);

  send(child, { t: 'load', id: loadId, specs: filePackageToolModules, invokeTimeoutMs, toolOptions });
  const loadAck = await awaitIpc(child, isLoadAck(loadId), loadTimeoutMs);

  logWarningsErrors(loadAck);

  // manifest
  const manifestRequestId = makeId();

  send(child, { t: 'manifest:get', id: manifestRequestId });
  const manifest = await awaitIpc(child, isManifestResult(manifestRequestId), loadTimeoutMs);

  return { child, tools: manifest.tools as ToolDescriptor[], closeStderr };
};

/**
 * Recreate parent-side tool creators that forward invocations to the Tools Host.
 * - Parent does not perform validation; the child validates with Zod at invoke time.
 * - A minimal Zod inputSchema from the parent is required to trigger the MCP SDK parameter
 *    validation for tool invocation. This schema is not used, it is a noop.
 * - Invocation errors from the child preserve `error.code` and `error.details` for UX.
 *
 * @param {HostHandle} handle - Tools Host handle.
 * @param {GlobalOptions} options - Global options.
 * @returns Array of tool creators
 */
const makeProxyCreators = (
  handle: HostHandle,
  { pluginHost }: GlobalOptions = getOptions()
): McpToolCreator[] => handle.tools.map((tool): McpToolCreator => () => {
  const name = tool.name;

  // Rebuild Zod schema from serialized JSON.
  const zodSchemaStrict = jsonSchemaToZod(tool.inputSchema);
  let zodSchema = zodSchemaStrict;

  // Rebuild Zod schema again for compatibility.
  if (!zodSchemaStrict) {
    zodSchema = jsonSchemaToZod(tool.inputSchema, { failFast: false });

    log.debug(
      `Tool "${name}" from ${tool.source || 'unknown source'} failed strict JSON to Zod reconstruction.`,
      `Review the tool's inputSchema and ensure it is a valid JSON or Zod schema.`
    );
  }

  if (!zodSchema) {
    log.error(
      `Tool "${name}" from ${tool.source || 'unknown source'} failed strict and best‑effort JSON to Zod reconstruction.`,
      `Falling back to permissive schema for SDK broadcast. Review the inputSchema.`
    );
  }

  // Broadcast the tool's input schema towards clients/agents. Because Zod is integral to the MCP SDK,
  // in the unlikely event that the Zod schema is still unavailable, fallback again. All hail Zod!
  const schema = {
    description: tool.description,
    inputSchema: zodSchema || z.looseObject({})
  };

  const handler = async (args: unknown) => {
    const requestId = makeId();

    send(handle.child, { t: 'invoke', id: requestId, toolId: tool.id, args });

    const response = await awaitIpc(
      handle.child,
      isInvokeResult(requestId),
      pluginHost.invokeTimeoutMs
    );

    if ('ok' in response && response.ok === false) {
      const invocationError = new Error(response.error?.message || 'Tool invocation failed', { cause: response.error?.cause }) as Error & {
        code?: string;
        details?: unknown;
      };

      if (response.error?.stack) {
        invocationError.stack = response.error.stack;
      }

      if (response.error?.code) {
        invocationError.code = response.error?.code;
      }

      invocationError.details = response.error?.details || (response as any).error?.cause?.details;
      throw invocationError;
    }

    return response.result;
  };

  return [name, schema, handler];
});

/**
 * Best-effort Tools Host shutdown for the current session.
 *
 * Policy:
 * - Primary grace defaults to 0 ms (internal-only, from DEFAULT_OPTIONS.pluginHost.gracePeriodMs)
 * - Single fallback kill at grace + 200 ms to avoid racing simultaneous kills
 * - Close logging for child(ren) stderr
 *
 * @param {GlobalOptions} options - Global options.
 * @param {AppSession} sessionOptions - Session options.
 * @returns {Promise<void>} Promise that resolves when the host is stopped or noop.
 */
const sendToolsHostShutdown = async (
  { pluginHost }: GlobalOptions = getOptions(),
  { sessionId }: AppSession = getSessionOptions()
): Promise<void> => {
  const handle = activeHostsBySession.get(sessionId);

  if (!handle) {
    return;
  }

  const gracePeriodMs = (Number.isInteger(pluginHost?.gracePeriodMs) && pluginHost.gracePeriodMs) || 0;
  const fallbackGracePeriodMs = gracePeriodMs + 200;

  const child = handle.child;
  let resolved = false;
  let forceKillPrimary: NodeJS.Timeout | undefined;
  let forceKillFallback: NodeJS.Timeout | undefined;

  await new Promise<void>(resolve => {
    const resolveOnce = () => {
      if (resolved) {
        return;
      }

      resolved = true;
      child.off('exit', resolveOnce);
      child.off('disconnect', resolveOnce);

      if (forceKillPrimary) {
        clearTimeout(forceKillPrimary);
      }

      if (forceKillFallback) {
        clearTimeout(forceKillFallback);
      }

      try {
        handle.closeStderr?.();
      } catch {}

      activeHostsBySession.delete(sessionId);
      resolve();
    };

    try {
      send(child, { t: 'shutdown', id: makeId() });
    } catch {}

    const shutdownChild = () => {
      try {
        if (!child?.killed) {
          child.kill('SIGKILL');
        }
      } finally {
        resolveOnce();
      }
    };

    // Primary grace period
    forceKillPrimary = setTimeout(shutdownChild, gracePeriodMs);
    forceKillPrimary?.unref?.();

    // Fallback grace period
    forceKillFallback = setTimeout(shutdownChild, fallbackGracePeriodMs);
    forceKillFallback?.unref?.();

    child.once('exit', resolveOnce);
    child.once('disconnect', resolveOnce);
  });
};

/**
 * Compose built-in creators with any externally loaded creators.
 *
 * - Node.js version policy:
 *    - Node >= 22, external plugins are executed out-of-process via a Tools Host.
 *    - Node < 22, externals are skipped with a warning and only built-ins are returned.
 * - Registry is self‑correcting for pre‑load or mid‑run crashes without changing normal shutdown
 *
 * @param builtinCreators - Built-in tool creators
 * @param {GlobalOptions} options - Global options.
 * @param {AppSession} sessionOptions - Session options.
 * @returns {Promise<McpToolCreator[]>} Promise array of tool creators
 */
const composeTools = async (
  builtinCreators: McpToolCreator[],
  options: GlobalOptions = getOptions(),
  { sessionId }: AppSession = getSessionOptions()
): Promise<McpToolCreator[]> => {
  const { toolModules, nodeVersion } = options;
  const result: McpToolCreator[] = [...builtinCreators];
  const usedNames = new Set<string>(builtinCreators.map(creator => getBuiltInToolName(creator)).filter(Boolean) as string[]);

  if (!Array.isArray(toolModules) || toolModules.length === 0) {
    return result;
  }

  const filePackageEntries: NormalizedToolEntry[] = [];
  const tools = normalizeTools.memo(toolModules, options);

  tools.forEach(tool => {
    switch (tool.type) {
      case 'file':
      case 'package':
        filePackageEntries.push(tool);
        break;
      case 'invalid':
        log.warn(tool.error);
        break;
      case 'tuple':
      case 'object':
      case 'creator': {
        const toolName = tool.toolName;

        if (toolName && usedNames.has(toolName)) {
          log.warn(`Skipping inline tool "${toolName}" because a tool with the same name is already provided (built-in or earlier).`);
          break;
        }

        if (toolName) {
          usedNames.add(toolName);
        }

        result.push(tool.value as McpToolCreator);
        break;
      }
    }
  });

  // Load file-based via Tools Host (Node.js version gate applies here)
  if (filePackageEntries.length === 0) {
    return result;
  }

  if (nodeVersion < 22) {
    log.warn('External tool plugins require Node >= 22; skipping file-based tools.');

    return result;
  }

  try {
    const host = await spawnToolsHost();

    // Filter manifest by reserved names BEFORE proxying
    const filteredTools = host.tools.filter(tool => {
      if (usedNames.has(tool.name)) {
        log.warn(`Skipping plugin tool "${tool.name}" – name already used by built-in/inline tool.`);

        return false;
      }
      usedNames.add(tool.name);

      return true;
    });

    const filteredHandle = { ...host, tools: filteredTools } as HostHandle;
    const proxies = makeProxyCreators(filteredHandle);

    // Associate the spawned host with the current session
    activeHostsBySession.set(sessionId, host);

    // Clean up on exit or disconnect
    const onChildExitOrDisconnect = () => {
      const current = activeHostsBySession.get(sessionId);

      if (current && current.child === host.child) {
        try {
          host.closeStderr?.();
        } catch {}
        activeHostsBySession.delete(sessionId);
      }
      host.child.off('exit', onChildExitOrDisconnect);
      host.child.off('disconnect', onChildExitOrDisconnect);
    };

    try {
      host.child.once('exit', onChildExitOrDisconnect);
      host.child.once('disconnect', onChildExitOrDisconnect);
    } catch {}

    return [...result, ...proxies];
  } catch (error) {
    log.warn('Failed to start Tools Host; skipping externals and continuing with built-ins/inline.');
    log.warn(formatUnknownError(error));

    return result;
  }
};

export {
  composeTools,
  computeFsReadAllowlist,
  debugChild,
  getBuiltInToolName,
  logWarningsErrors,
  makeProxyCreators,
  sendToolsHostShutdown,
  spawnToolsHost
};

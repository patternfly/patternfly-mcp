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
import { normalizeTools, sanitizeStaticToolName, type NormalizedToolEntry } from './server.toolsUser';
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
 * Get a set of tool names from the builtin creators.
 *
 * @param builtinCreators - Array of builtin tool creators
 * @returns Set of tool names
 */
const getBuiltInToolNames = (builtinCreators: McpToolCreator[]) =>
  new Set<string>(builtinCreators.map((creator, index) => {
    const builtInToolName = sanitizeStaticToolName(creator)?.toLowerCase?.();

    if (!builtInToolName) {
      log.warn(`Built-in tool at index ${index} is missing the static name property, "toolName"`);
    }

    return builtInToolName;
  }).filter(Boolean) as string[]);

/**
 * Compute the allowlist for the Tools Host.
 *
 * @param {GlobalOptions} options - Global options.
 * @returns Array of absolute directories to allow read access.
 */
const computeFsReadAllowlist = ({ toolModules, contextPath, contextUrl }: GlobalOptions = getOptions()): string[] => {
  const directories = new Set<string>();
  const tools = normalizeTools.memo(toolModules, { contextPath, contextUrl });

  if (contextPath) {
    directories.add(contextPath);
  }

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

    log.error(`Tools load errors (${errors.length})\n${lines.join('\n')}`);
  }
};

/**
 * Get normalized "file and package" tool modules.
 *
 * @param {GlobalOptions} options - Global options.
 * @param options.contextPath - Base path for tool modules
 * @param options.contextUrl - Base URL for tool modules
 * @param options.toolModules - Array of tool modules to normalize
 * @returns - Filtered array of normalized "file and package" tool modules
 */
const getFilePackageTools = ({ contextPath, contextUrl, toolModules }: GlobalOptions = getOptions()): NormalizedToolEntry[] =>
  normalizeTools.memo(toolModules, { contextPath, contextUrl }).filter(tool => tool.type === 'file' || tool.type === 'package');

/**
 * Get normalized "inline" tool modules.
 *
 * @param {GlobalOptions} options - Global options.
 * @param options.contextPath - Base path for tool modules
 * @param options.contextUrl - Base URL for tool modules
 * @param options.toolModules - Array of tool modules to normalize
 * @returns - Filtered array of normalized "inline" tool modules
 */
const getInlineTools = ({ contextPath, contextUrl, toolModules }: GlobalOptions = getOptions()): NormalizedToolEntry[] =>
  normalizeTools.memo(toolModules, { contextPath, contextUrl }).filter(tool => tool.type === 'tuple' || tool.type === 'object' || tool.type === 'creator');

/**
 * Get normalized "inline" tool modules.
 *
 * @param {GlobalOptions} options - Global options.
 * @param options.contextPath - Base path for tool modules
 * @param options.contextUrl - Base URL for tool modules
 * @param options.toolModules - Array of tool modules to normalize
 * @returns - Filtered array of normalized "inline" tool modules
 */
const getInvalidTools = ({ contextPath, contextUrl, toolModules }: GlobalOptions = getOptions()): NormalizedToolEntry[] =>
  normalizeTools.memo(toolModules, { contextPath, contextUrl }).filter(tool => tool.type === 'invalid');

/**
 * Get normalized file and package tool modules.
 *
 * @param {GlobalOptions} options - Global options.
 * @param options.contextPath - Base path for tool modules
 * @param options.contextUrl - Base URL for tool modules
 * @param options.toolModules - Array of tool modules to normalize
 * @returns Updated array of normalized tool modules
 */
const getFilePackageToolModules = ({ contextPath, contextUrl, toolModules }: GlobalOptions = getOptions()): string[] =>
  getFilePackageTools({ contextPath, contextUrl, toolModules } as GlobalOptions)
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
    const lines = raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean);

    for (const line of lines) {
      const tagged = `[tools-host pid=${childPid} sid=${sessionId}] ${line}`;

      // Pattern: fs read issues
      if (
        /ERR_ACCESS_DENIED.*FileSystemRead.*resource:\s*/i.test(line) ||
        /ERR_ACCESS_DENIED.*Read/i.test(line)
      ) {
        const key = `fs-deny:${line}`;

        if (!promoted.has(key)) {
          promoted.add(key);
          log.warn(
            `${line}\nTools Host denied fs read. In strict mode, add the resource's directory to --allow-fs-read.\nOptionally, you can disable strict mode entirely with pluginIsolation: 'none'.`
          );

          continue;
        }
      }

      // Pattern: ESM/CJS import issues
      if (
        /ERR_MODULE_NOT_FOUND/.test(line) ||
        /Cannot use import statement outside a module/i.test(line) ||
        /ERR_UNKNOWN_FILE_EXTENSION/.test(line)
      ) {
        const key = `esm:${line}`;

        if (!promoted.has(key)) {
          promoted.add(key);
          log.warn('Tools Host import error. Ensure external tools are ESM (no raw .ts) and resolvable.\nFor local files, prefer a file:// URL.');

          continue;
        }
      }

      // Default: debug-level passthrough
      log.debug(tagged);
    }
  };

  child.stderr?.on?.('data', debugHandler);

  return () => {
    child.stderr?.off?.('data', debugHandler);
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
  const { nodeVersion, pluginIsolation, pluginHost } = options || {};
  const { loadTimeoutMs, invokeTimeoutMs } = pluginHost || {};
  const nodeArgs: string[] = [];
  let updatedEntry: string | undefined = undefined;

  try {
    const entryUrl = import.meta.resolve('#toolsHost');

    updatedEntry = fileURLToPath(entryUrl);
  } catch (error) {
    log.debug(`Failed to import.meta.resolve Tools Host entry '#toolsHost': ${formatUnknownError(error)}`);

    if (process.env.NODE_ENV === 'local') {
      updatedEntry = '/mock/path/to/toolsHost.js';
    }
  }

  if (updatedEntry === undefined) {
    throw new Error(`Failed to resolve Tools Host entry '#toolsHost'.`);
  }

  // Deny network and fs write by omission
  if (pluginIsolation === 'strict') {
    // Node 24+ moves to using the "--permission" flag instead of "--experimental-permission"
    const permissionFlag = nodeVersion >= 24 ? '--permission' : '--experimental-permission';

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
 * - Parent does not perform validation; the child validates with Zod at invocation.
 * - A minimal Zod inputSchema from the parent is required to trigger the MCP SDK parameter
 *    validation.
 * - There is an unreachable defensive check in `makeProxyCreators` that ensures the Zod schema
 *    always returns a value.
 * - Invocation errors from the child preserve `error.code` and `error.details` for debugging.
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
  const invokeTimeoutMs = Math.max(0, Number(pluginHost?.invokeTimeoutMs) || 0);

  // Rebuild Zod schema from serialized JSON.
  const zodSchemaStrict = jsonSchemaToZod(tool.inputSchema);
  let zodSchema = zodSchemaStrict;

  // Rebuild Zod schema again for compatibility.
  if (!zodSchemaStrict) {
    zodSchema = jsonSchemaToZod(tool.inputSchema, { failFast: false });

    log.debug(
      `Tool "${name}" from ${tool.source || 'unknown source'} failed strict JSON to Zod reconstruction.`,
      `Using fallback best effort schema. Review the tool's inputSchema and ensure it is a valid JSON or Zod schema.`,
      `[ZOD_SCHEMA: defined: ${Boolean(zodSchema)}]`
    );
  }

  // Defensive check only. Currently, unreachable due to `jsonSchemaToZod`'s current return/response. Zod is integral
  // to the MCP SDK, in the unlikely event that the Zod schema is still unavailable, fallback again. All hail Zod!
  if (!zodSchema) {
    zodSchema = z.looseObject({});

    log.error(
      `Tool "${name}" from ${tool.source || 'unknown source'} failed strict and best effort JSON to Zod reconstruction.`,
      `Falling back to permissive schema for SDK broadcast. Review the inputSchema.`,
      `[ZOD_SCHEMA: defined: ${Boolean(zodSchema)}]`
    );
  }

  // Broadcast the tool's input schema towards clients/agents.
  const schema = {
    description: tool.description,
    inputSchema: zodSchema
  };

  const handler = async (args: unknown) => {
    const requestId = makeId();

    send(handle.child, { t: 'invoke', id: requestId, toolId: tool.id, args });

    const response = await awaitIpc(
      handle.child,
      isInvokeResult(requestId),
      invokeTimeoutMs
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
 */
const sendToolsHostShutdown = async (
  { pluginHost }: GlobalOptions = getOptions(),
  { sessionId }: AppSession = getSessionOptions()
): Promise<void> => {
  const handle = activeHostsBySession.get(sessionId);

  if (!handle) {
    return;
  }

  const gracePeriodMs = Math.max(0, Number(pluginHost?.gracePeriodMs) || 0);
  const fallbackGracePeriodMs = gracePeriodMs + 200;

  const child = handle.child;
  let resolved = false;
  let forceKillPrimary: NodeJS.Timeout | undefined;
  let forceKillSecondary: NodeJS.Timeout | undefined;
  let resolveIt: ((value: PromiseLike<void> | void) => void) | undefined;

  // Attempt exit, disconnect, then remove from activeHostsBySession and finally resolve
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
      (handle as any).closeStderr();
      log.info('Tools Host stderr reader closed.');
    } catch (error) {
      log.error(`Failed to close Tools Host stderr reader: ${formatUnknownError(error)}`);
    }

    const confirmHandle = activeHostsBySession.get(sessionId);

    if (confirmHandle?.child === child) {
      activeHostsBySession.delete(sessionId);
    }

    resolveIt?.();
  };

  // Forced shutdown.
  const sigkillChild = (isSecondaryFallback: boolean = false) => {
    try {
      if (!child?.killed) {
        log.warn(
          `${
            (resolved && 'Already attempted shutdown.') || 'Slow shutdown response.'
          } ${
            (isSecondaryFallback && 'Secondary') || 'Primary'
          } fallback force-killing Tools Host child process.`
        );
        child.kill('SIGKILL');
      }
    } catch (error) {
      log.error(`Failed to force-kill Tools Host child process: ${formatUnknownError(error)}`);
    }
  };

  // Start the shutdown process
  await new Promise<void>(resolve => {
    resolveIt = resolve;
    // Send a shutdown signal to child. We try/catch in case the process is already dead, and
    // since we're still following it up with a graceful shutdown, then force-kill.
    try {
      send(child, { t: 'shutdown', id: makeId() });
    } catch (error) {
      log.error(`Failed to send shutdown signal to Tools Host child process: ${formatUnknownError(error)}`);
    }

    // Set primary timeout for force shutdown
    forceKillPrimary = setTimeout(() => {
      sigkillChild();
      shutdownChild();
    }, gracePeriodMs);
    forceKillPrimary?.unref?.();

    // Set fallback timeout for force shutdown
    forceKillSecondary = setTimeout(() => {
      sigkillChild(true);
      shutdownChild();
    }, fallbackGracePeriodMs);
    forceKillSecondary?.unref?.();

    // Set up exit/disconnect handlers to resolve
    child.once('exit', shutdownChild);
    child.once('disconnect', shutdownChild);
  });
};

/**
 * Compose built-in creators with any externally loaded creators.
 *
 * - Node.js version policy:
 *    - Node >= 22, external plugins are executed out-of-process via a Tools Host.
 *    - Node < 22, externals are skipped with a warning and only built-ins are returned.
 * - Registry is self-correcting for preload or midrun crashes without changing normal shutdown
 *
 * @param builtinCreators - Built-in tool creators
 * @param {GlobalOptions} options - Global options.
 * @param {AppSession} sessionOptions - Session options.
 * @returns {Promise<McpToolCreator[]>} Promise array of tool creators
 */
const composeTools = async (
  builtinCreators: McpToolCreator[],
  { toolModules, nodeVersion, contextUrl, contextPath }: GlobalOptions = getOptions(),
  { sessionId }: AppSession = getSessionOptions()
): Promise<McpToolCreator[]> => {
  const existingSession = activeHostsBySession.get(sessionId);

  if (existingSession) {
    log.warn(`Existing Tools Host session detected ${sessionId}. Shutting down the existing host before creating a new one.`);
    await sendToolsHostShutdown();
  }

  const toolCreators: McpToolCreator[] = [...builtinCreators];
  const usedNames = getBuiltInToolNames(builtinCreators);

  if (!Array.isArray(toolModules) || toolModules.length === 0) {
    log.info('No external tools loaded.');

    return toolCreators;
  }

  const filePackageCreators: NormalizedToolEntry[] = getFilePackageTools({ toolModules, contextUrl, contextPath } as GlobalOptions);
  const invalidCreators = getInvalidTools({ toolModules, contextUrl, contextPath } as GlobalOptions);
  const inlineCreators: NormalizedToolEntry[] = getInlineTools({ toolModules, contextUrl, contextPath } as GlobalOptions);

  const normalizeToolName = (toolName?: string) => toolName?.trim?.()?.toLowerCase?.();

  invalidCreators.forEach(({ error }) => {
    log.warn(error);
  });

  const filteredInlineCreators: McpToolCreator[] = inlineCreators.map(tool => {
    const toolName = normalizeToolName(tool.toolName);

    if (toolName && usedNames.has(toolName)) {
      log.warn(`Skipping inline tool "${toolName}" because a tool with the same name is already provided (built-in or earlier).`);

      return undefined;
    }

    if (toolName) {
      usedNames.add(toolName);
    }

    return tool.value as McpToolCreator;
  }).filter(Boolean) as McpToolCreator[];

  toolCreators.push(...filteredInlineCreators);

  // Load file-based via Tools Host (Node.js version gate applies here)
  if (filePackageCreators.length === 0) {
    return toolCreators;
  }

  if (!nodeVersion || nodeVersion < 22) {
    log.warn('External tool plugins require Node >= 22; skipping file-based tools.');

    return toolCreators;
  }

  let host: HostHandle | undefined;

  // Clean up on exit or disconnect
  const onChildExitOrDisconnect = () => {
    if (!host) {
      return;
    }

    const current = activeHostsBySession.get(sessionId);

    if (current && current.child === host.child) {
      try {
        (host as any).closeStderr();
        log.info('Tools Host stderr reader closed.');
      } catch (error) {
        log.error(`Failed to close Tools Host stderr reader: ${formatUnknownError(error)}`);
      }

      activeHostsBySession.delete(sessionId);
    }

    host.child.off('exit', onChildExitOrDisconnect);
    host.child.off('disconnect', onChildExitOrDisconnect);
  };

  try {
    host = await spawnToolsHost();

    // Filter manifest by reserved names BEFORE proxying
    const filteredTools = host.tools.filter(tool => {
      const toolName = normalizeToolName(tool.name);

      if (toolName && usedNames.has(toolName)) {
        log.warn(`Skipping tool plugin "${tool.name}" – name already used by built-in/inline tool.`);

        return false;
      }

      if (toolName) {
        usedNames.add(toolName);
      }

      return true;
    });

    const filteredHandle = { ...host, tools: filteredTools } as HostHandle;
    const proxiedCreators = makeProxyCreators(filteredHandle);

    // Associate the spawned host with the current session
    activeHostsBySession.set(sessionId, host);

    host.child.once('exit', onChildExitOrDisconnect);
    host.child.once('disconnect', onChildExitOrDisconnect);

    return [...toolCreators, ...proxiedCreators];
  } catch (error) {
    log.warn(`Failed to start Tools Host; skipping externals and continuing with built-ins/inline. ${formatUnknownError(error)}`);

    return toolCreators;
  }
};

export {
  composeTools,
  computeFsReadAllowlist,
  debugChild,
  getBuiltInToolNames,
  getFilePackageTools,
  getInlineTools,
  getInvalidTools,
  getFilePackageToolModules,
  logWarningsErrors,
  makeProxyCreators,
  sendToolsHostShutdown,
  spawnToolsHost
};

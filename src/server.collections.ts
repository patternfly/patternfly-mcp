import { type ChildProcess } from 'node:child_process';
import { type AppSession, type GlobalOptions } from './options';
import { formatUnknownError, log } from './logger';
import {
  spawnChildProcess,
  shutdownChildProcess,
  activeChildrenBySession,
  type ChildHandle
} from './server.process';
import { getOptions, getSessionOptions } from './options.context';
import { type McpCollectionCreator, type McpCollectionResult } from './collections';
import { setCollectionOptions } from './options.collections';
import { type CollectionDescriptor, type IpcResponse } from './server.collectionsIpc';
import {
  normalizeCollections,
  sanitizeStaticCollectionName,
  type NormalizedCollectionEntry
} from './server.collectionsUser';
import { applyStaticProperty } from './server.processUser';

/**
 * Handle for a spawned Host process.
 *
 * @property collections - Array of collection descriptors.
 */
type HostHandle = ChildHandle & {
  collections: CollectionDescriptor[];
};

/**
 * Compute the allowlist for the Host.
 *
 * @param {GlobalOptions} options - Global options.
 * @returns Array of absolute directories to allow read access.
 */
const computeFsReadAllowlist = ({ contextPath }: GlobalOptions = getOptions()): string[] => {
  const directories = new Set<string>();

  if (contextPath) {
    directories.add(contextPath);
  }

  return [...directories];
};

/**
 * Get a set of collection names from the builtin creators.
 *
 * @param builtinCreators - Array of builtin collection creators
 * @returns Set of collection names
 */
const getBuiltInCollectionNames = (builtinCreators: McpCollectionCreator[]) =>
  new Set<string>(builtinCreators.map((creator, index) => {
    const builtInCollectionName = sanitizeStaticCollectionName(creator)?.toLowerCase?.();

    if (!builtInCollectionName) {
      log.warn(`Built-in collection at index ${index} is missing the static name property, "collectionName"`);
    }

    return builtInCollectionName;
  }).filter(Boolean) as string[]);

/**
 * Wrap built-in creators to set a trusted `_isInternal: true` status.
 *
 * @param builtinCreators - Array of builtin collection creators
 * @returns Array of secured builtin collection creators
 */
const secureBuiltinCreators = (builtinCreators: McpCollectionCreator[]) =>
  builtinCreators.map((creator, index): McpCollectionCreator => {
    const secured: McpCollectionCreator = opt => {
      const [name, callback, config] = creator(opt);

      return [
        name,
        callback,
        {
          ...config,
          _isInternal: true
        }
      ];
    };

    const collectionName = sanitizeStaticCollectionName(creator);

    if (collectionName) {
      applyStaticProperty('collectionName', collectionName, secured);
    } else {
      log.warn(
        `Built-in collection at index ${index} is missing the static name property, "collectionName"`
      );
    }

    return secured;
  });

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

    log.warn(`Collections load warnings (${warnings.length})\n${lines.join('\n')}`);
  }

  if (Array.isArray(errors) && errors.length > 0) {
    const lines = errors.map(error => `  - ${String(error)}`);

    log.error(`Collections load errors (${errors.length})\n${lines.join('\n')}`);
  }
};

/**
 * Get normalized "inline" modules. Inline modules can be internal or embedded and are explicitly trusted.
 *
 * @param {GlobalOptions} options - Global options.
 * @param options.collectionModules - Array of modules to normalize
 * @returns - Filtered array of normalized "inline" tool modules
 */
const getInlineCollections = ({ collectionModules }: GlobalOptions = getOptions()): NormalizedCollectionEntry[] =>
  normalizeCollections.memo(collectionModules).filter(module => module.type === 'tuple');

/**
 * Get normalized "inline" modules.
 *
 * @param {GlobalOptions} options - Global options.
 * @param options.collectionModules - Array of modules to normalize
 * @returns - Filtered array of normalized "inline" tool modules
 */
const getInvalidCollections = ({ collectionModules }: GlobalOptions = getOptions()): NormalizedCollectionEntry[] =>
  normalizeCollections.memo(collectionModules).filter(module => module.type === 'invalid');

/**
 * Debug a child process' stderr output.
 *
 * @param child - Child process to debug
 * @param {AppSession} sessionOptions - Session options
 */
const debugChild = (child: ChildProcess, { sessionId } = getSessionOptions()) => {
  const childPid = child.pid;

  const debugHandler = (chunk: Buffer | string) => {
    const raw = String(chunk);

    if (!raw || !raw.trim()) {
      return;
    }

    // Split multi-line chunks so each line is tagged
    const lines = raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean);

    for (const line of lines) {
      const tagged = `[collections-host pid=${childPid} sid=${sessionId}] ${line}`;

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
 * Spawn the Collections Host (child process), load external collections, and return a host handle.
 *
 * @note The load IPC payload uses a generic `options` field (not `collectionOptions`) so creator
 * options, and related session context, can share a host-agnostic shape. Tools still pass
 * domain-specific `toolOptions`. Future iterations should align Tools Host IPC to this generic
 * `options` contract.
 *
 * @param {GlobalOptions} options - Global options.
 * @returns Host handle used by `makeProxyCreators` and shutdown.
 *
 * @throws {Error} If the Collections Host entry `#collectionsHost` cannot be resolved, or if the child
 *     process fails to spawn or respond during the handshake within the configured timeout.
 */
const spawnCollectionHost = async (
  options: GlobalOptions = getOptions()
): Promise<HostHandle> => {
  const { pluginIsolation, pluginHost, nodeVersion } = options || {};
  const { loadTimeoutMs, invokeTimeoutMs } = pluginHost || {};
  const collectionOptions = setCollectionOptions(options);

  const handle = spawnChildProcess({
    importSpecifier: '#collectionsHost',
    label: 'Collections Host',
    isolation: {
      mode: pluginIsolation === 'strict' ? 'strict' : 'none',
      nodeVersion,
      fsReadAllowlist: computeFsReadAllowlist()
    },
    enableStderrDebug: child => debugChild(child)
  });

  // hello
  await handle.request({ t: 'hello' }, 'hello:ack', loadTimeoutMs);

  // load
  const loadAck = await handle.request<Extract<IpcResponse, { t: 'load:ack' }>>(
    { t: 'load', specs: [], invokeTimeoutMs, options: collectionOptions },
    'load:ack',
    loadTimeoutMs
  );

  logWarningsErrors(loadAck);

  // manifest
  const manifest = await handle.request<Extract<IpcResponse, { t: 'manifest:result' }>>(
    { t: 'manifest:get' },
    'manifest:result',
    loadTimeoutMs
  );

  return { ...handle, collections: manifest.collections as CollectionDescriptor[] };
};

/**
 * Recreate parent-side creators that forward invocations to the Host.
 *
 * @param {HostHandle} handle - Host handle.
 * @param {GlobalOptions} options - Global options.
 * @returns Array of creators
 */
const makeProxyCreators = (
  handle: HostHandle,
  { pluginHost }: GlobalOptions = getOptions()
): McpCollectionCreator[] => handle.collections.map((collection): McpCollectionCreator => () => {
  const name = collection.name;
  const invokeTimeoutMs = Math.max(0, Number(pluginHost?.invokeTimeoutMs) || 0);

  const handler = async (args?: unknown): Promise<McpCollectionResult> => {
    const response = await handle.request<Extract<IpcResponse, { t: 'invoke:result' }>>(
      { t: 'invoke', collectionId: collection.id, args },
      'invoke:result',
      invokeTimeoutMs
    );

    if ('ok' in response && response.ok === false) {
      const invocationError = new Error(response.error?.message || 'Collection invocation failed', { cause: response.error?.cause }) as Error & {
        code?: string;
        details?: unknown;
      };

      if (response.error?.stack) {
        invocationError.stack = response.error.stack;
      }

      if (response.error?.code) {
        invocationError.code = response.error?.code;
      }

      const errorCause = response.error?.cause as { details?: unknown } | undefined;

      invocationError.details = response.error?.details || errorCause?.details;
      throw invocationError;
    }

    return response.result as McpCollectionResult;
  };

  return [name, handler];
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
const sendCollectionsHostShutdown = async (
  { pluginHost }: GlobalOptions = getOptions(),
  { sessionId }: AppSession = getSessionOptions()
): Promise<void> => {
  const registryKey = `${sessionId}:collections`;
  const handle = activeChildrenBySession.get(registryKey) as HostHandle | undefined;

  await shutdownChildProcess(handle, {
    gracePeriodMs: Math.max(0, Number(pluginHost?.gracePeriodMs) || 0),
    sessionId: registryKey,
    label: 'Collections Host'
  });
};

/**
 * Composes multi-source record collections across process boundaries.
 *
 * @param builtinCreators
 * @param {GlobalOptions} options - Global options.
 * @param {AppSession} session - Session options.
 * @returns Promise array of collection creators.
 */
const composeCollections = async (
  builtinCreators: McpCollectionCreator[],
  options: GlobalOptions = getOptions(),
  session: AppSession = getSessionOptions()
): Promise<McpCollectionCreator[]> => {
  const { collectionModules, nodeVersion, contextUrl, contextPath } = options;
  const { sessionId } = session;
  const registryKey = `${sessionId}:collections`;
  const existingSession = activeChildrenBySession.get(registryKey);

  if (existingSession) {
    log.warn(`Existing Collections Host session detected ${sessionId}. Shutting down the existing host before creating a new one.`);
    await sendCollectionsHostShutdown();
  }

  // Intercept and wrap built-in creators to enforce trusted isInternal: true status
  const securedBuiltinCreators = secureBuiltinCreators(builtinCreators);

  const updatedCollectionModules = Array.isArray(collectionModules) ? collectionModules : [];
  const usedNames = getBuiltInCollectionNames(securedBuiltinCreators);

  if (updatedCollectionModules.length === 0) {
    log.info('No external collections loaded.');
  }

  if (updatedCollectionModules.length === 0 && securedBuiltinCreators.length === 0) {
    return [];
  }

  // Temporary placeholder for collections-as-plugins
  const filePackageCreators: NormalizedCollectionEntry[] = [];
  const invalidCreators = getInvalidCollections({ collectionModules, contextUrl, contextPath } as GlobalOptions);
  const inlineCreators: NormalizedCollectionEntry[] = getInlineCollections({ collectionModules, contextUrl, contextPath } as GlobalOptions);

  const normalizeCollectionName = (collectionName?: string) => collectionName?.trim?.()?.toLowerCase?.();

  invalidCreators.forEach(({ error }) => {
    log.warn(error);
  });

  const localCreators: McpCollectionCreator[] = [];
  const hostedCreators: McpCollectionCreator[] = [];

  for (const creator of securedBuiltinCreators) {
    const [, , config] = creator(options);
    const runHost = typeof config?.runInChildProcess === 'function'
      ? await config.runInChildProcess(options)
      : Boolean(config?.runInChildProcess);

    if (runHost) {
      hostedCreators.push(creator);
    } else {
      localCreators.push(creator);
    }
  }

  const filteredInlineCreators = inlineCreators.map(collection =>
    collection.value as McpCollectionCreator).filter(Boolean);

  hostedCreators.push(...filteredInlineCreators);

  if (filePackageCreators.length && (!nodeVersion || nodeVersion < 22)) {
    log.warn('External collection plugins require Node >= 22; skipping file-based collections.');
  }

  if (hostedCreators.length === 0) {
    return localCreators;
  }

  let host: HostHandle | undefined;

  // Clean up on exit or disconnect
  const onChildExitOrDisconnect = () => {
    if (!host) {
      return;
    }

    const current = activeChildrenBySession.get(registryKey);

    if (current && current.child === host.child) {
      try {
        host.closeStderr();
        log.info('Collections Host stderr reader closed.');
      } catch (error) {
        log.error(`Failed to close Collections Host stderr reader: ${formatUnknownError(error)}`);
      }

      activeChildrenBySession.delete(registryKey);
    }

    host.child.off('exit', onChildExitOrDisconnect);
    host.child.off('disconnect', onChildExitOrDisconnect);
  };

  try {
    host = await spawnCollectionHost(options);

    // Filter manifest by reserved names BEFORE proxying
    const filteredCollections = host.collections.filter(collection => {
      const collectionName = normalizeCollectionName(collection.name);

      if (collectionName && usedNames.has(collectionName)) {
        log.warn(`Skipping collection plugin "${collection.name}" – name already used by built-in/inline collection.`);

        return false;
      }

      if (collectionName) {
        usedNames.add(collectionName);
      }

      return true;
    });

    const filteredHandle = { ...host, collections: filteredCollections } as HostHandle;
    const proxiedCreators = makeProxyCreators(filteredHandle);

    activeChildrenBySession.set(registryKey, host);

    host.child.once('exit', onChildExitOrDisconnect);
    host.child.once('disconnect', onChildExitOrDisconnect);

    return [...localCreators, ...proxiedCreators];
  } catch (error) {
    log.warn(`Failed to start Collections Host; skipping hosted collections and continuing with built-in/inline collections. ${formatUnknownError(error)}`);

    return localCreators;
  }
};

export {
  composeCollections,
  computeFsReadAllowlist,
  debugChild,
  getBuiltInCollectionNames,
  getInlineCollections,
  getInvalidCollections,
  logWarningsErrors,
  makeProxyCreators,
  secureBuiltinCreators,
  sendCollectionsHostShutdown,
  spawnCollectionHost
};

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
import { normalizeCollections, type NormalizedCollectionEntry } from './server.collectionsUser';

/**
 * Handle for a spawned Host process.
 *
 * @property manifest - Array of collection descriptors.
 */
type HostHandle = ChildHandle & {
  collections: CollectionDescriptor[];
};

/**
 * Compute the allowlist for the Tools Host.
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
 * Extract the names of built-in collections.
 *
 * @param builtinCreators - Array of built-in collection creators.
 * @returns Set of collection names.
 */
const getBuiltInCollectionNames = (builtinCreators: McpCollectionCreator[]) =>
  new Set<string>(builtinCreators.map((creator, index) => {
    const [name] = creator() || [];

    if (!name) {
      log.warn(`Built-in collection at index ${index} is missing the name property`);
    }

    return name;
  }).filter(Boolean));

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

const spawnCollectionHost = async (
  options: GlobalOptions = getOptions()
): Promise<HostHandle> => {
  const { pluginIsolation, pluginHost, nodeVersion } = options || {};
  const { loadTimeoutMs, invokeTimeoutMs } = pluginHost || {};

  // const filePackageCollectionModules = [];
  // const internalCollectionOptions = options;
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
    { t: 'load', specs: [], invokeTimeoutMs, collectionOptions },
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
 * Dynamically proxies a remote child-process record callback across the IPC boundary.
 *
 * @param sourceName
 * @param handle
 * @param globalOpts
 * @param handle.pluginHost
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
  const handle = activeChildrenBySession.get(sessionId) as HostHandle | undefined;

  await shutdownChildProcess(handle, {
    gracePeriodMs: Math.max(0, Number(pluginHost?.gracePeriodMs) || 0),
    sessionId,
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
  // Wrap built-in creators to enforce trusted _isInternal. Ties into what options, session values are available.
  const { collectionModules, nodeVersion, contextUrl, contextPath } = options;
  const { sessionId } = session;
  const existingSession = activeChildrenBySession.get(sessionId);

  if (existingSession) {
    log.warn(`Existing Collections Host session detected ${sessionId}. Shutting down the existing host before creating a new one.`);
    await sendCollectionsHostShutdown();
  }

  // Intercept and wrap built-in creators to enforce trusted isInternal: true status
  const securedBuiltinCreators = builtinCreators.map((creator): McpCollectionCreator => opt => {
    const [name, callback, config] = creator(opt);

    return [
      name,
      callback,
      {
        ...config,
        _isInternal: true
      }
    ];
  });

  const updatedCollectionModules = Array.isArray(collectionModules) ? collectionModules : [];
  const usedNames = getBuiltInCollectionNames(securedBuiltinCreators);

  if (updatedCollectionModules.length === 0) {
    log.info('No external collections loaded.');
  }

  if (updatedCollectionModules.length === 0 && securedBuiltinCreators.length === 0) {
    return [];
  }

  const filePackageCreators: NormalizedCollectionEntry[] = [];
  const invalidCreators = getInvalidCollections({ collectionModules, contextUrl, contextPath } as GlobalOptions);
  const inlineCreators: NormalizedCollectionEntry[] = getInlineCollections({ collectionModules, contextUrl, contextPath } as GlobalOptions);

  const normalizeCollectionName = (collectionName?: string) => collectionName?.trim?.()?.toLowerCase?.();

  invalidCreators.forEach(({ error }) => {
    log.warn(error);
  });

  // collectionCreators.push(...filteredInlineCreators);

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

  /*
  This is already taken care of as part of the getInlineCollections and normalizeCollections chain
  const filteredInlineCreators = inlineCreators.map(collection => {
    const creator = collection.value as McpCollectionCreator;

    if (!creator) {
      return null;
    }

    return (opts?: GlobalOptions) => {
      const [name, callback, config] = creator(opts);

      return [
        name,
        callback,
        {
          ...config,
          isInternal: false // Override/strip to ensure untrusted collections remain sandboxed
        }
      ];
    };
  }).filter(Boolean) as McpCollectionCreator[];
  */

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

    const current = activeChildrenBySession.get(sessionId);

    if (current && current.child === host.child) {
      try {
        host.closeStderr();
        log.info('Collections Host stderr reader closed.');
      } catch (error) {
        log.error(`Failed to close Collections Host stderr reader: ${formatUnknownError(error)}`);
      }

      activeChildrenBySession.delete(sessionId);
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

    activeChildrenBySession.set(sessionId, host);

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
  debugChild,
  logWarningsErrors,
  makeProxyCreators,
  sendCollectionsHostShutdown
};

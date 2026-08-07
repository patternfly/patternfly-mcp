import {
  type IpcRequest,
  type CollectionDescriptor,
  makeId
} from './server.collectionsIpc';
import { serializeError, type SerializedError } from './server.processIpc';
import { createProcessHost, type HostContext } from './server.processHost';
// import { resolveExternalCreators } from './server.toolsHostCreator';
import { DEFAULT_OPTIONS } from './options.defaults';
// import { type ToolOptions } from './options.tools';
// import { type McpTool, type McpToolCreator } from './mcpSdk';
import { type McpCollectionCreator, type McpCollection } from './collections';
import { resolveCreators } from './server.collectionsHostCreator';
import { type CollectionOptions } from './options.collections';

/**
 * SubType of IpcRequest for "load" requests.
 */
type LoadRequest = Extract<IpcRequest, { t: 'load' }>;

/**
 * SubType of IpcRequest for "invoke" requests.
 */
type InvokeRequest = Extract<IpcRequest, { t: 'invoke' }>;

/**
 * State object for the collections host.
 */
type HostState = {
  collectionMap: Map<string, McpCollection>;
  // descriptors: ToolDescriptor[];
  descriptors: CollectionDescriptor[];
  invokeTimeoutMs: number;
};

/**
 * Create a new host state object.
 *
 * @param invokeTimeoutMs
 * @returns {HostState}
 */
const createHostState = (invokeTimeoutMs = DEFAULT_OPTIONS.pluginHost.invokeTimeoutMs): HostState => ({
  collectionMap: new Map<string, McpCollection>(),
  descriptors: [],
  invokeTimeoutMs
});

/**
 * Check if a value is an error or an error-like object.
 *
 * Handles cross-realm Error detection via tag checks for `[object Error]`, `[object AggregateError]`,
 * and `[object DOMException]`. Does not treat `[object ErrorEvent]` as error-like in the
 * Node context; add if your runtime can emit `ErrorEvent`.
 *
 * @param value
 * @returns True if the value is an error-like object, false otherwise.
 */
const isErrorLike = (value: unknown) => {
  if (!value || (typeof value !== 'object' && typeof value !== 'function')) {
    return false;
  }

  if (value instanceof Error || value instanceof AggregateError) {
    return true;
  }

  const tag = Object.prototype.toString.call(value);

  if (tag === '[object Error]' || tag === '[object AggregateError]' || tag === '[object DOMException]') {
    return true;
  }

  const val = value as Record<string, unknown>;
  const has = (key: string) =>
    Object.hasOwn(val, key) && typeof val[key] === 'string' && val[key].length > 0;

  if (!has('message')) {
    return false;
  }

  const isNameLike = has('name') && (val.name as string).toLowerCase().endsWith('error');
  const isStackLike = has('stack') && (val.stack as string).includes('\n');

  return isNameLike || isStackLike;
};

/**
 * Load external tool creators, realize them, and normalize `inputSchema` in the child.
 *
 * Stores the real Zod schema in memory for runtime validation and sends a JSON-safe schema in descriptors.
 *
 * @param {LoadRequest} request - Load request object.
 * @returns New state object with updated tools/descriptors and warnings/errors.
 */
const performLoad = async (request: LoadRequest): Promise<HostState & { warnings: string[]; errors: string[] }> => {
  const nextInvokeTimeout = typeof request?.invokeTimeoutMs === 'number' && Number.isFinite(request.invokeTimeoutMs) && request.invokeTimeoutMs > 0
    ? request.invokeTimeoutMs
    : DEFAULT_OPTIONS.pluginHost.invokeTimeoutMs;

  const state = createHostState(nextInvokeTimeout);
  const warnings: string[] = [];
  const errors: string[] = [];
  const options: CollectionOptions | undefined = request.options;
  let module: unknown;

  for (const spec of request.specs || []) {
    // Import the module. On fail, move to the next module.
    try {
      const dynamicImport = new Function('spec', 'return import(spec)') as (spec: string) => Promise<any>;

      // let's export a common "collection" function for records/collections
      module = await dynamicImport(spec);
    } catch (error) {
      errors.push(`Failed import: ${spec}: ${String((error as Error)?.message || error)}`);
      continue;
    }

    // Does the module export a creator function? On fail, move to the next module.
    let creators: McpCollectionCreator[] = [];

    try {
      creators = resolveCreators(module, options, { throwOnEmpty: true });
    } catch (error) {
      warnings.push(`No usable creators in module ${spec}: ${String((error as Error)?.message || error)}`);
      continue;
    }

    // Finally, convert to JSON for manifest, store, push descriptor
    for (const creator of creators) {
      try {
        const create = creator as (opts?: unknown) => McpCollection;
        const collection = create(options);

        const collectionId = makeId();

        state.collectionMap.set(collectionId, collection);
        state.descriptors.push({
          id: collectionId,
          name: collection[0],
          source: spec
        });
      } catch (error) {
        warnings.push(`Collection creator threw while realizing: ${spec}: ${String((error as Error)?.message || error)}`);
      }
    }

    /*
    try {
      if (module && typeof module === 'object') {
        if ('collection' in module && Array.isArray(module.collection)) {
          collection = (module as { collection: McpCollection }).collection;
        } else {
          // Robust search for any exported CollectionCreators and realize them
          const exportedFunc = Object.values(module).find(val => typeof val === 'function');

          if (exportedFunc) {
            const potentialSource = (exportedFunc as () => unknown)();

            if (Array.isArray(potentialSource) && potentialSource.length >= 2) {
              collection = potentialSource as McpCollection;
            }
          }
        }
      }

      if (!collection) {
        throw new Error('collection missing or invalid');
      }
    } catch (error) {
      warnings.push(`No usable collection in module ${spec}: ${String((error as Error)?.message || error)}`);
      continue;
    }

    const collectionId = makeId();

    state.collectionMap.set(collectionId, collection);
    state.descriptors.push({
      id: collectionId,
      name: collection[0],
      source: spec
    });
    */

    /*
    // Does the module export a creator function? On fail, move to the next module.
    let creators: McpToolCreator[] = [];

    try {
      creators = resolveExternalCreators(module, request.toolOptions, { throwOnEmpty: true });
    } catch (error) {
      warnings.push(`No usable creators in module ${spec}: ${String((error as Error)?.message || error)}`);
      continue;
    }
     */

    // Finally, normalize module schema, convert to JSON for manifest, store, push descriptor
    /*
    for (const creator of creators) {
      try {
        const { tool, manifestSchema, warnings: creatorWarnings } = normalizeCreatorSchema(creator, toolOptions);

        warnings.push(...creatorWarnings);

        const toolId = makeId();

        state.recordMap.set(toolId, tool as McpTool);
        state.descriptors.push({
          id: toolId,
          name: tool[0],
          description: tool[1]?.description || '',
          inputSchema: manifestSchema,
          source: spec
        });
      } catch (error) {
        warnings.push(`Tool creator threw while realizing: ${spec}: ${String((error as Error)?.message || error)}`);
      }
    }
     */
  }

  return { ...state, warnings, errors };
};

/**
 * Invoke a realized tool by id. Validates arguments against the in-memory Zod schema.
 *
 * @example
 * // On validation failure, returns
 * { ok: false, error: { code: 'INVALID_ARGS', details } }
 *
 * @param {HostState} state
 * @param {InvokeRequest} request
 * @param {HostContext} ctx
 */
const requestInvoke = async (state: HostState, request: InvokeRequest, ctx: HostContext) => {
  const collection = state.collectionMap.get(request.collectionId);

  if (!collection) {
    ctx.send({
      t: 'invoke:result',
      id: request.id,
      ok: false,
      error: { message: 'Unknown collectionId' }
    });

    return;
  }

  let settled = false;

  const timer = setTimeout(() => {
    if (settled) {
      return;
    }

    settled = true;

    ctx.send({
      t: 'invoke:result',
      id: request.id,
      ok: false,
      error: { message: 'Invoke timeout' }
    });
  }, state.invokeTimeoutMs);

  timer?.unref?.();

  const handler = collection[1];
  // const cfg = (tool[1] || {}) as Record<string, unknown>;
  // const schema = cfg.inputSchema;

  try {
    // Child-side validation
    const updatedRequestArgs = request.args;

    // Invoke the tool
    const result = await Promise.resolve(handler(updatedRequestArgs));

    // Some handlers may mistakenly return an Error instance instead of throwing. Normalize it to a failure.
    if (isErrorLike(result)) {
      const err: SerializedError = new Error('Internal error', { cause: { details: result } });

      err.code = 'INTERNAL_ERROR';

      throw err;
    }

    if (!settled) {
      settled = true;
      clearTimeout(timer);
      ctx.send({ t: 'invoke:result', id: request.id, ok: true, result });
    }
  } catch (error) {
    if (!settled) {
      settled = true;
      clearTimeout(timer);
      ctx.send({
        t: 'invoke:result',
        id: request.id,
        ok: false,
        error: serializeError(error as Error)
      });
    }
  }
};

/**
 * Create the Collections Host: a generic child-process host wired with the record handlers.
 * Built-in `hello`/`shutdown` handlers come from `createProcessHost`.
 */
const createCollectionsHost = () => {
  let state: HostState = createHostState();

  return createProcessHost({
    load: async (request, ctx) => {
      const loaded = await performLoad(request as LoadRequest);

      state = {
        collectionMap: loaded.collectionMap,
        descriptors: loaded.descriptors,
        invokeTimeoutMs: loaded.invokeTimeoutMs
      };

      ctx.send({ t: 'load:ack', id: request.id, warnings: loaded.warnings, errors: loaded.errors });
    },
    'manifest:get': (request, ctx) => {
      ctx.send({ t: 'manifest:result', id: request.id, collections: state.descriptors });
    },
    invoke: async (request, ctx) => {
      await requestInvoke(state, request as InvokeRequest, ctx);
    }
  });
};

// createProcessHost internally guards on `process.send`, so this is safe at module load.
createCollectionsHost();

export {
  // normalizeCreatorSchema,
  performLoad,
  requestInvoke,
  createCollectionsHost
};

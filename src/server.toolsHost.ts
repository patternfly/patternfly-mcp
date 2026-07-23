import {
  type IpcRequest,
  type ToolDescriptor,
  makeId
} from './server.toolsIpc';
import { serializeError, type SerializedError } from './server.processIpc';
import { createProcessHost, type HostContext } from './server.processHost';
import { resolveExternalCreators } from './server.toolsHostCreator';
import { DEFAULT_OPTIONS } from './options.defaults';
import { type ToolOptions } from './options.tools';
import { type McpTool, type McpToolCreator } from './mcpSdk';
import {
  isZodRawShape,
  isZodSchema,
  normalizeInputSchema,
  zodToJsonSchema
} from './server.schema';
import { isPlainObject } from './server.helpers';

/**
 * SubType of IpcRequest for "load" requests.
 */
type LoadRequest = Extract<IpcRequest, { t: 'load' }>;

/**
 * SubType of IpcRequest for "invoke" requests.
 */
type InvokeRequest = Extract<IpcRequest, { t: 'invoke' }>;

/**
 * State object for the tools host.
 */
type HostState = {
  toolMap: Map<string, McpTool>;
  descriptors: ToolDescriptor[];
  invokeTimeoutMs: number;
};

/**
 * Create a new host state object.
 *
 * @param invokeTimeoutMs
 * @returns {HostState}
 */
const createHostState = (invokeTimeoutMs = DEFAULT_OPTIONS.pluginHost.invokeTimeoutMs): HostState => ({
  toolMap: new Map<string, McpTool>(),
  descriptors: [],
  invokeTimeoutMs
});

/**
 * Result of `normalizeCreatorSchema`.
 *
 * @property tool - The realized tool tuple returned by the creator function.
 * @property normalizedSchema - Normalized input schema.
 * @property manifestSchema - JSON Schema representation of the normalized input schema.
 * @property warnings - List of warnings generated during normalization.
 */
type NormalizeCreatorSchemaResult = {
  tool: McpTool;
  normalizedSchema: unknown;
  manifestSchema: unknown;
  warnings: string[];
};

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
 * Normalize a tool creator function and its input schema.
 *
 * @param creator
 * @param toolOptions
 * @returns Object containing the normalized tool and its input schema.
 */
const normalizeCreatorSchema = (creator: unknown, toolOptions?: ToolOptions): NormalizeCreatorSchemaResult => {
  const create = creator as (opts?: unknown) => McpTool;

  // Apply tool options to the creator function
  const tool = create(toolOptions);
  const toolName = tool[0] || create.name;

  // Normalize input schema in the child (Tools Host)
  const cfg = (tool[1] ?? {}) as Record<string, unknown>;
  const normalizedSchema = normalizeInputSchema(cfg.inputSchema);

  // Overwrite tuple's schema so call-time validation matches manifest
  tool[1] = { ...(tool[1] || {}), inputSchema: normalizedSchema } as any;

  // If the original was plain JSON Schema, prefer to send that as-is
  if (
    normalizedSchema !== undefined &&
    isPlainObject(cfg.inputSchema) &&
    !isZodRawShape(cfg.inputSchema) &&
    !isZodSchema(cfg.inputSchema)
  ) {
    return {
      tool,
      normalizedSchema,
      manifestSchema: cfg.inputSchema,
      warnings: []
    };
  }

  // Zod schema, convert to JSON Schema. If conversion fails, send permissive fallback
  const jsonSchemaForManifest = zodToJsonSchema(normalizedSchema);
  const warnings: string[] = [];

  if (!jsonSchemaForManifest) {
    const updatedToolName = toolName || 'the tool';

    warnings.push(
      `Using permissive JSON Schema fallback. Failed to convert Zod to JSON Schema for ${updatedToolName}.`
    );
    warnings.push(
      `Permissive JSON schemas may have unintended side-effects. Review ${updatedToolName}'s inputSchema and ensure it's a valid JSON or Zod schema.`
    );
  }

  return {
    tool,
    normalizedSchema,
    manifestSchema: jsonSchemaForManifest || { type: 'object', additionalProperties: true },
    warnings
  };
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
  const toolOptions: ToolOptions | undefined = request.toolOptions;
  let module: unknown;

  for (const spec of request.specs || []) {
    // Import the module. On fail, move to the next module.
    try {
      const dynamicImport = new Function('spec', 'return import(spec)') as (spec: string) => Promise<any>;

      module = await dynamicImport(spec);
    } catch (error) {
      errors.push(`Failed import: ${spec}: ${String((error as Error)?.message || error)}`);
      continue;
    }

    // Does the module export a creator function? On fail, move to the next module.
    let creators: McpToolCreator[] = [];

    try {
      creators = resolveExternalCreators(module, request.toolOptions, { throwOnEmpty: true });
    } catch (error) {
      warnings.push(`No usable creators in module ${spec}: ${String((error as Error)?.message || error)}`);
      continue;
    }

    // Finally, normalize module schema, convert to JSON for manifest, store, push descriptor
    for (const creator of creators) {
      try {
        const { tool, manifestSchema, warnings: creatorWarnings } = normalizeCreatorSchema(creator, toolOptions);

        warnings.push(...creatorWarnings);

        const toolId = makeId();

        state.toolMap.set(toolId, tool as McpTool);
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
  const tool = state.toolMap.get(request.toolId);

  if (!tool) {
    ctx.send({
      t: 'invoke:result',
      id: request.id,
      ok: false,
      error: { message: 'Unknown toolId' }
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

  const handler = tool[2];
  const cfg = (tool[1] || {}) as Record<string, unknown>;
  const schema = cfg.inputSchema;

  try {
    // Child-side validation using in-memory Zod schema
    let updatedRequestArgs = request.args;
    // const zodSchema: any = tool?.[1]?.inputSchema;

    if (isZodSchema(schema)) {
      const parsed = await (schema as any).safeParseAsync(updatedRequestArgs);

      if (!parsed.success) {
        const details = parsed.error?.flatten?.() ?? String(parsed.error);

        const err: SerializedError = new Error('Invalid arguments', { cause: { details } });

        err.code = 'INVALID_ARGS';

        throw err;
      }

      updatedRequestArgs = parsed.data;
    }

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
 * Create the Tools Host: a generic child-process host wired with the tool handlers.
 * Built-in `hello`/`shutdown` handlers come from `createProcessHost`.
 */
const createToolsHost = () => {
  let state: HostState = createHostState();

  return createProcessHost({
    load: async (request, ctx) => {
      const loaded = await performLoad(request as LoadRequest);

      state = {
        toolMap: loaded.toolMap,
        descriptors: loaded.descriptors,
        invokeTimeoutMs: loaded.invokeTimeoutMs
      };

      ctx.send({ t: 'load:ack', id: request.id, warnings: loaded.warnings, errors: loaded.errors });
    },
    'manifest:get': (request, ctx) => {
      ctx.send({ t: 'manifest:result', id: request.id, tools: state.descriptors });
    },
    invoke: async (request, ctx) => {
      await requestInvoke(state, request as InvokeRequest, ctx);
    }
  });
};

// createProcessHost internally guards on `process.send`, so this is safe at module load.
createToolsHost();

export {
  normalizeCreatorSchema,
  performLoad,
  requestInvoke,
  createToolsHost
};

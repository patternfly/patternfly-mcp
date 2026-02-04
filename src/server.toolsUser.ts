import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, isAbsolute, resolve } from 'node:path';
import { isPath, isPlainObject, isReferenceLike, isUrl } from './server.helpers';
import { type McpTool } from './server';
import { type GlobalOptions } from './options';
import { memo } from './server.caching';
import { DEFAULT_OPTIONS } from './options.defaults';
import { type ToolOptions } from './options.tools';
import { formatUnknownError } from './logger';
import { normalizeInputSchema } from './server.schema';

/**
 * Inline tool options.
 *
 * @alias GlobalOptions
 * @note Author-facing configuration.
 */
type ToolInternalOptions = GlobalOptions;

/**
 * External tool options.
 *
 * @alias ToolOptions
 * @note Author-facing configuration.
 */
type ToolExternalOptions = ToolOptions;

/**
 * A normalized tool entry for normalizing values for strings and tool creators.
 *
 * @property type - Classification of the entry (file, package, creator, tuple, object, invalid)
 * @property index - The original input index (for diagnostics)
 * @property original - The original input value
 * @property value - The final consumer value (string or creator)
 * @property toolName - The tool name for tuple/object/function entries
 * @property normalizedUrl - The normalized file URL for file entries
 * @property fsReadDir - The directory to include in allowlist for file, or package, entries
 * @property isUrlLike - File, or package, URL indicator
 * @property isFilePath - File, or package, path indicator
 * @property isFileUrl - File, or package, URL indicator
 * @property error - Error message for invalid entries
 */
type NormalizedToolEntry = {
  type: 'file' | 'package' | 'creator' | 'tuple' | 'object' | 'invalid';
  index: number;
  original: unknown;
  value: string | ToolCreator;
  toolName?: string | undefined;
  normalizedUrl?: string;
  fsReadDir?: string | undefined;
  isUrlLike?: boolean;
  isFilePath?: boolean;
  isFileUrl?: boolean;
  error?: string | undefined;
};

/**
 * A file or package tool entry for normalizing values for strings.
 */
type FileEntry = Pick<NormalizedToolEntry, 'type' | 'original' | 'value' | 'isUrlLike' | 'isFilePath' | 'isFileUrl' | 'normalizedUrl' | 'fsReadDir' | 'error'>;

/**
 * A general tool entry for normalizing values for creators.
 */
type CreatorEntry = Pick<NormalizedToolEntry, 'type' | 'original' | 'value' | 'toolName' | 'error'>;

/**
 * An MCP tool. A tool config tuple. The handler may be async or sync.
 *
 * @alias McpTool
 * @note Author-facing configuration.
 * @example A tool config tuple. The handler may be async or sync.
 * [
 *   'tupleTool',
 *   { description: 'Tool description', inputSchema: {} },
 *   async (args) => { ... }
 * ]
 */
type Tool = McpTool;

/**
 * A plain object config.
 *
 * @template TArgs The type of arguments expected by the tool (optional).
 * @template TResult The type of result returned by the tool (optional).
 *
 * @property name - Name of the tool
 * @property description - Description of the tool
 * @property inputSchema - JSON Schema or Zod schema describing the arguments expected by the tool
 * @property {(args: TArgs) => Promise<TResult> | TResult} handler - Tool handler
 *     - `args` are returned by the tool's `inputSchema`'
 *
 * @note Author-facing configuration.
 * @example A plain object config. The handler may be async or sync.
 * {
 *   name: 'objTool',
 *   description: 'Tool description',
 *   inputSchema: {},
 *   handler: async (args) => { ... }
 * }
 */
type ToolConfig<TArgs = unknown, TResult = unknown> = {
  name: string;
  description: string;
  inputSchema: unknown;
  handler: (args: TArgs) => TResult | Promise<TResult>;
};

/**
 * A function that returns a tuple `Tool` or `McpTool`. An MCP tool "wrapper", or "creator".
 *
 * - `ToolExternalOptions` is a limited subset of `ToolInternalOptions` for external filePackage creators.
 * - `ToolInternalOptions` is available for inline and built-in tool creators.
 *
 * @note Author-facing configuration.
 * @example A creator function. The handler may be async or sync.
 * () => [
 *   'creatorTool',
 *   { description: 'Tool description', inputSchema: {} },
 *   async (args) => { ... }
 * ]
 */
type ToolCreator = ((options?: ToolExternalOptions | ToolInternalOptions) => McpTool) & { toolName?: string };

/**
 * An array of tool configs.
 *
 * - `string` - file path or package id (Node >= 22 path)
 * - `Tool` - tuple form (has a name)
 * - `ToolConfig` - object form (has a name)
 * - `ToolCreator` - function creator with static toolName
 * - `ToolModule` - normalized tool config values returned from `createMcpTool`
 *
 * @note Author-facing multi-tool configuration.
 * @example A multi-tool configuration array/list
 * [
 *   './a/file/path/tool.mjs',
 *   {
 *     name: 'objTool',
 *     description: 'Tool description',
 *     inputSchema: {},
 *     handler: (args) => { ... }
 *   },
 *   [
 *     'tupleTool',
 *     { description: 'Tool description', inputSchema: {} },
 *     (args) => { ... }
 *   ]
 *   () => [
 *     'creatorTool',
 *     { description: 'Tool description', inputSchema: {} },
 *     (args) => { ... }
 *   ],
 *   createMcpTool({
 *     name: 'aCreateMcpToolWrappedTool',
 *     description: 'Tool description',
 *     inputSchema: {},
 *     handler: (args) => { ... }
 *   });
 * ];
 */
type ToolMultiConfig = ReadonlyArray<string | Tool | ToolConfig | ToolCreator | ToolModule>;

/**
 * An array of normalized tool config values returned from `createMcpTool`.
 *
 * - `string` - file path or package id (Node >= 22 path)
 * - `ToolCreator` - function creator with static toolName
 *
 * @note Author-facing multi-tool configuration.
 * @example An array/list of normalized tool config values
 * [
 *   './a/file/path/tool.mjs',
 *   () => [
 *     'creatorTool',
 *     { description: 'Tool description', inputSchema: {} },
 *     async (args) => { ... }
 *   ]
 * ];
 */
type ToolModule = ReadonlyArray<NormalizedToolEntry['value']>;

/**
 * Author-facing tool schema.
 *
 * @property description - Description of the tool
 * @property inputSchema - JSON Schema or Zod schema describing the arguments expected by the tool
 */
type ToolSchema = {
  inputSchema: unknown;
  description: string;
};

/**
 * Allowed keys in the tool config objects. Expand as needed.
 */
const ALLOWED_CONFIG_KEYS = new Set(['name', 'description', 'inputSchema', 'handler']);

/**
 * Allowed keys in the tool schema objects. Expand as needed. See related `ToolSchema`.
 */
const ALLOWED_SCHEMA_KEYS = new Set(['description', 'inputSchema']);

/**
 * Memoization key store. See `getSetMemoKey`.
 */
const toolsMemoKeyStore: WeakMap<object, Map<string, symbol>> = new WeakMap();

/**
 * Quick consistent unique key, via symbol (anything unique-like will work), for a given input
 * and context.
 *
 * Used specifically for helping memoize functions and objects against context. Not used
 * elsewhere because simple equality checks, without context, in the lower-level functions
 * are good enough.
 *
 * @private
 * @param input - Input can be an object, function, or primitive value.
 * @param contextKey - Additional context to help uniqueness.
 * @returns A unique key, a symbol for objects/functions or string for primitives.
 */
const getSetMemoKey = (input: unknown, contextKey: string) => {
  if (!isReferenceLike(input)) {
    return `${String(input)}:${contextKey}`;
  }

  let contextMap = toolsMemoKeyStore.get(input);
  let token;

  if (!contextMap) {
    contextMap = new Map<string, symbol>();
    toolsMemoKeyStore.set(input, contextMap);
  }

  token = contextMap.get(contextKey);

  if (!token) {
    token = Symbol(`tools:${contextKey}`);
    contextMap.set(contextKey, token);
  }

  return token;
};

/**
 * Apply a static property to an object.
 *
 * @private
 * @param property - Name of the property to apply
 * @param value - Value of the property to apply
 * @param obj - Object to apply the property towards
 * @returns `true` if the property was applied successfully, `false` otherwise.
 */
const applyStaticProperty = (property: string, value: unknown, obj: unknown) => {
  try {
    Object.defineProperty(obj, property, { value, writable: false, enumerable: false, configurable: false });
  } catch {
    return false;
  }

  return true;
};

/**
 * Return an object key value.
 *
 * @param obj
 * @param key
 */
const sanitizeDataProp = (obj: unknown, key: string) => {
  if (!isReferenceLike(obj)) {
    return undefined;
  }

  let descriptor: PropertyDescriptor | undefined;

  try {
    descriptor = Object.getOwnPropertyDescriptor(obj, key);
  } catch {
    return undefined;
  }

  const isDataProp = descriptor !== undefined && 'value' in descriptor;

  if (isDataProp && typeof descriptor?.get !== 'function' && typeof descriptor?.set !== 'function') {
    return descriptor;
  }

  return undefined;
};

/**
 * Sanitize a plain object for allowed keys.
 *
 * @param obj
 * @param allowedKeys
 */
const sanitizePlainObject = (obj: unknown, allowedKeys: Set<string>) => {
  const updatedObj = {} as Record<string, unknown>;

  if (!isPlainObject(obj)) {
    return updatedObj;
  }

  for (const key of Object.keys(obj as object)) {
    if (!allowedKeys.has(key)) {
      continue;
    }

    const prop = sanitizeDataProp(obj, key);

    if (prop === undefined) {
      continue;
    }

    updatedObj[key] = prop?.value;
  }

  return updatedObj;
};

/**
 * Sanitize and return a static tool name.
 *
 * @param obj
 *
 * @returns - The sanitized static tool name, or `undefined` if the name is invalid.
 */
const sanitizeStaticToolName = (obj: unknown) => {
  try {
    const name = sanitizeDataProp(obj, 'toolName');

    if (typeof name?.value === 'string') {
      const trimmed = String.prototype.trim.call(name.value);

      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  } catch {}

  return undefined;
};

/**
 * Normalize a tuple object with schema into a Zod schema.
 *
 * @param schema
 * @param allowedKeys
 */
const normalizeTupleSchema = (schema: unknown, allowedKeys = ALLOWED_SCHEMA_KEYS) => {
  if (!isPlainObject(schema)) {
    return undefined;
  }

  const { description, inputSchema } = sanitizePlainObject(schema, allowedKeys);

  const updatedDesc = (description as string)?.trim?.() || undefined;
  const updatedSchema = normalizeInputSchema(inputSchema);

  if (!updatedSchema) {
    return undefined;
  }

  const obj: { inputSchema: unknown, description?: string } = { inputSchema: updatedSchema };

  if (updatedDesc) {
    obj.description = updatedDesc as string;
  }

  return obj;
};

/**
 * Memoize the `normalizeSchema` function.
 */
normalizeTupleSchema.memo = memo(normalizeTupleSchema, { cacheErrors: false, keyHash: args => args[0] });

/**
 * Normalize a tuple config into a tool creator function.
 *
 * @param config - The array configuration to normalize.
 * @returns A tool creator function, or undefined if the config is invalid.
 */
const normalizeTuple = (config: unknown): CreatorEntry | undefined => {
  if (!Array.isArray(config) || config.length !== 3) {
    return undefined;
  }

  const name = sanitizeDataProp(config, '0');
  const schema = sanitizeDataProp(config, '1');
  const handler = sanitizeDataProp(config, '2');

  if (!name || !schema || !handler) {
    return undefined;
  }

  const updatedName = (name.value as string)?.trim?.() || undefined;
  const updatedSchema = normalizeTupleSchema.memo(schema.value);
  const updatedHandler = typeof handler.value === 'function' ? handler.value : undefined;

  if (!updatedName || !updatedHandler) {
    return undefined;
  }

  const creator: ToolCreator = () => [
    updatedName as string,
    updatedSchema as ToolSchema,
    updatedHandler as (args: unknown) => unknown | Promise<unknown>
  ];

  let err: string | undefined;

  applyStaticProperty('toolName', updatedName, creator);

  if (!updatedSchema) {
    err = `Tool "${updatedName}" failed to set inputSchema. Provide a Zod schema, a Zod raw shape, or a plain JSON Schema object.`;
  }

  return {
    original: config,
    toolName: updatedName as string,
    type: err ? 'invalid' : 'tuple',
    value: creator,
    ...(err ? { error: err } : {})
  };
};

/**
 * Memoize the `normalizeTuple` function.
 */
normalizeTuple.memo = memo(normalizeTuple, { cacheErrors: false, keyHash: args => args[0] });

/**
 * Normalize an object config into a tool creator function.
 *
 * @param config - The object configuration to normalize.
 * @param allowedKeys - Allowed keys in the config object.
 * @returns A tool creator function, or undefined if the config is invalid.
 */
const normalizeObject = (config: unknown, allowedKeys = ALLOWED_CONFIG_KEYS): CreatorEntry | undefined => {
  if (!isPlainObject(config)) {
    return undefined;
  }

  const { name, description, inputSchema, handler } = sanitizePlainObject(config, allowedKeys);

  const updatedName = (name as string)?.trim?.() || undefined;
  const updatedDesc = (description as string)?.trim?.() || undefined;
  const updatedSchema = normalizeInputSchema(inputSchema);
  const updatedHandler = typeof handler === 'function' ? handler : undefined;

  if (!updatedName || !updatedDesc || !updatedHandler) {
    return undefined;
  }

  const creator: ToolCreator = () => [
    updatedName as string,
    {
      description: updatedDesc as string,
      inputSchema: updatedSchema
    },
    updatedHandler as (args: unknown) => unknown | Promise<unknown>
  ];

  let err: string | undefined;

  applyStaticProperty('toolName', updatedName, creator);

  if (!updatedSchema) {
    err = `Tool "${updatedName}" failed to set inputSchema. Provide a Zod schema, a Zod raw shape, or a plain JSON Schema object.`;
  }

  return {
    original: config,
    toolName: updatedName as string,
    type: err ? 'invalid' : 'object',
    value: creator,
    ...(err ? { error: err } : {})
  };
};

/**
 * Memoize the `normalizeObject` function.
 */
normalizeObject.memo = memo(normalizeObject, { cacheErrors: false, keyHash: args => args[0] });

/**
 * Normalize a creator function into a tool creator function.
 *
 * @note
 * - We intentionally do not execute creator functions during normalization. This means
 *   deduplication will only happen if the `toolName` property is set manually or another
 *   configuration option is used.
 * - Only minimal error handling is done here, errors for malformed tuples are surfaced
 *   in logs by design.
 *
 * @param config
 * @returns A tool creator function, or undefined if the config is invalid.
 */
const normalizeFunction = (config: unknown): CreatorEntry | undefined => {
  if (typeof config !== 'function') {
    return undefined;
  }

  const err: string[] = [];
  const toolName = sanitizeStaticToolName(config);
  const originalConfig = config as ToolCreator;

  const wrappedConfig: ToolCreator = (opts?: unknown) => {
    let response;

    try {
      response = originalConfig.call(null, opts as unknown as GlobalOptions);
    } catch (error) {
      throw new Error(`Tool failed to load: ${formatUnknownError(error)}`);
    }

    // Currently, we only support tuples in creator functions.
    const tupleResult = normalizeTuple.memo(response);

    if (tupleResult) {
      const { value } = tupleResult;

      return (value as ToolCreator)?.();
    }

    return response;
  };

  if (toolName) {
    applyStaticProperty('toolName', toolName, wrappedConfig);
  } else {
    err.push(
      'Tool creator function is missing the static name property, "toolName". Set creator.toolName = "<name>",',
      'or author the tool as a tuple/object (example [\'<name>\', { ... }, handler]).'
    );
  }

  return {
    original: config,
    toolName,
    type: err.length ? 'invalid' : 'creator',
    value: wrappedConfig as ToolCreator,
    ...(err.length ? { error: err.join('\n') } : {})
  };
};

/**
 * Memoize the `normalizeFunction` function.
 */
normalizeFunction.memo = memo(normalizeFunction, { cacheErrors: false, keyHash: args => args[0] });

/**
 * Normalize a file URL into a file entry.
 *
 * @param config - The file URL to normalize.
 * @returns - A file entry, or undefined if the config is invalid.
 */
const normalizeFileUrl = (config: unknown): FileEntry | undefined => {
  if (typeof config !== 'string' || !config.startsWith('file:')) {
    return undefined;
  }

  const entry: Partial<NormalizedToolEntry> = { isUrlLike: isUrl(config, { isStrict: false }), isFilePath: isPath(config) };
  const err: string[] = [];
  const isFileUrl = config.startsWith('file:');
  const normalizedUrl = config;
  let fsReadDir: string | undefined = undefined;
  let type: NormalizedToolEntry['type'] = 'invalid';

  try {
    const resolvedPath = fileURLToPath(config);

    fsReadDir = dirname(resolvedPath);
    type = 'file';
  } catch (error) {
    err.push(`Failed to resolve file url: ${config}: ${formatUnknownError(error)}`);
  }

  return {
    ...entry,
    normalizedUrl,
    fsReadDir,
    isFileUrl,
    original: config,
    type,
    value: config,
    ...(type === 'invalid' ? { error: err.join('\n') } : {})
  };
};

/**
 * Memoize the `normalizeFileUrl` function.
 */
normalizeFileUrl.memo = memo(normalizeFileUrl, { cacheErrors: false, keyHash: args => args[0] });

/**
 * Normalize a file path into a file entry.
 *
 * File URLs are handled by `normalizeFileUrl`.
 *
 * @param config - The file path to normalize.
 * @param options - Optional settings
 * @param options.contextPath - The context path to use for resolving file paths.
 * @param options.contextUrl - The context URL to use for resolving file paths.
 * @returns - A file entry, or undefined if the config is invalid.
 */
const normalizeFilePath = (
  config: unknown,
  {
    contextPath = DEFAULT_OPTIONS.contextPath,
    contextUrl
  }: { contextPath?: string, contextUrl?: string } = {}
): FileEntry | undefined => {
  if (typeof config !== 'string' || !isPath(config) || isUrl(config, { isStrict: false })) {
    return undefined;
  }

  const entry: Partial<NormalizedToolEntry> = { isUrlLike: isUrl(config, { isStrict: false }), isFilePath: isPath(config) };
  const err: string[] = [];
  let isFileUrl = config.startsWith('file:');
  let normalizedUrl = config;
  let fsReadDir: string | undefined = undefined;
  let type: NormalizedToolEntry['type'] = 'invalid';

  try {
    if (contextUrl !== undefined) {
      const url = import.meta.resolve(config, contextUrl);

      if (url.startsWith('file:')) {
        const resolvedPath = fileURLToPath(url);

        fsReadDir = dirname(resolvedPath);
        normalizedUrl = pathToFileURL(resolvedPath).href;
        isFileUrl = true;
        type = 'file';
      }
    }

    // Fallback if resolve() path failed or not file:
    if (type !== 'file') {
      const resolvedPath = isAbsolute(config) ? config : resolve(contextPath as string, config);

      fsReadDir = dirname(resolvedPath as string);
      normalizedUrl = pathToFileURL(resolvedPath as string).href;
      isFileUrl = true;
      type = 'file';
    }
  } catch (error) {
    err.push(`Failed to resolve file path: ${config}: ${formatUnknownError(error)}`);
  }

  return {
    ...entry,
    normalizedUrl,
    fsReadDir,
    isFileUrl,
    original: config,
    type,
    value: config,
    ...(type === 'invalid' ? { error: err.join('\n') } : {})
  };
};

/**
 * Memoize the `normalizeFilePath` function.
 */
normalizeFilePath.memo = memo(normalizeFilePath, {
  cacheErrors: false,
  keyHash: args =>
    JSON.stringify([args[0], (args as any)?.[1]?.contextPath, (args as any)?.[1]?.contextUrl])
});

/**
 * Normalize a file or package tool config into a file entry.
 *
 * - First checks if the config is a file URL. If so, derive fsReadDir for allow-listing.
 * - Next, checks if the config looks like a filesystem path. If so, resolve.
 * - Otherwise, keep as-is (package name or other URL-like spec).
 *
 * @param config - The file, or package, configuration to normalize.
 * @param options - Optional settings
 * @param options.contextPath - The context path to use for resolving file paths.
 * @param options.contextUrl - The context URL to use for resolving file paths.
 * @returns {FileEntry}
 */
const normalizeFilePackage = (
  config: unknown,
  { contextPath, contextUrl }: { contextPath?: string, contextUrl?: string } = {}
): FileEntry | undefined => {
  if (typeof config !== 'string') {
    return undefined;
  }

  // Case 1: already a file URL -> derive fsReadDir for allow-listing
  if (normalizeFileUrl.memo(config)) {
    return normalizeFileUrl.memo(config);
  }

  // Case 2: looks like a filesystem path -> resolve or invalid
  if (normalizeFilePath.memo(config, { contextPath, contextUrl } as any)) {
    return normalizeFilePath.memo(config, { contextPath, contextUrl } as any);
  }

  // Case 3: non-file string -> keep as-is (package name or other URL-like spec)
  // Note: http(s) module specs are not supported by Node import and will surface as load warnings in the child.
  return {
    isUrlLike: isUrl(config, { isStrict: false }),
    isFilePath: isPath(config),
    normalizedUrl: config,
    fsReadDir: undefined,
    isFileUrl: false,
    original: config,
    type: 'package',
    value: config
  };
};

/**
 * Memoize the `normalizeFilePackage` function.
 */
normalizeFilePackage.memo = memo(normalizeFilePackage, {
  cacheErrors: false,
  keyHash: args =>
    JSON.stringify([args[0], (args as any)?.[1]?.contextPath, (args as any)?.[1]?.contextUrl])
});

/**
 * Normalize tool configuration(s) into a normalized tool entry.
 *
 * @note There are two commented alternatives left that would filter out `falsy` values
 * (example, `null`, `undefined`) from `updatedConfigs`/`flattenedConfigs`. We intentionally
 * do not filter them right now to preserve original array positions in error messages.
 * Falsy entries are carried through and ultimately become `invalid` entries with their
 * original index (example, "Unsupported type undefined" at index N).
 *
 * This also accounts for inline tuple values during flattening: tuple-looking arrays are
 * detected first and kept whole, avoiding accidental element-level flattening.
 *
 * @example Falsy values carried through to retain indexing on messaging
 * Input: [
 *   () => ['a', { inputSchema: {} }, () => {}],
 *   undefined,
 *   { name: 'b', description: 'b', inputSchema: {}, handler: () => {} }
 * ]
 * Output: ['creator', 'invalid', 'object']
 *
 * @param config - The configuration(s) to normalize.
 * @param options - Optional settings
 * @param options.contextPath - The context path to use for resolving file paths.
 * @param options.contextUrl - The context URL to use for resolving file paths.
 * @returns An array of normalized tool entries.
 */
const normalizeTools = (config: any, {
  contextPath = DEFAULT_OPTIONS.contextPath,
  contextUrl = DEFAULT_OPTIONS.contextUrl
}: { contextPath?: string, contextUrl?: string } = {}): NormalizedToolEntry[] => {
  // const updatedConfigs = (normalizeTuple.memo(config) && [config]) || (Array.isArray(config) && config) || (config && [config]) || [];
  const updatedConfigs = (normalizeTuple.memo(config) && [config]) || (Array.isArray(config) && config) || [config];
  const normalizedConfigs: NormalizedToolEntry[] = [];

  // Flatten nested-arrays of configs and attempt to account for inline tuples. This will catch
  // one-off cases where an array will be flattened, broken apart.
  const flattenedConfigs = updatedConfigs.flatMap((item: unknown) =>
    (normalizeTuple.memo(item) && [item]) || (Array.isArray(item) && item) || [item]);
    // (normalizeTuple.memo(item) && [item]) || (Array.isArray(item) && item) || (item && [item]) || [];

  flattenedConfigs.forEach((config: unknown, index: number) => {
    if (normalizeFunction.memo(config)) {
      normalizedConfigs.push({
        index,
        ...normalizeFunction.memo(config) as CreatorEntry
      });

      return;
    }

    if (normalizeTuple.memo(config)) {
      normalizedConfigs.push({
        index,
        ...normalizeTuple.memo(config) as CreatorEntry
      });

      return;
    }

    if (normalizeObject.memo(config)) {
      normalizedConfigs.push({
        index,
        ...normalizeObject.memo(config) as CreatorEntry
      });

      return;
    }

    if (normalizeFilePackage.memo(config, { contextPath, contextUrl })) {
      normalizedConfigs.push({
        index,
        ...normalizeFilePackage.memo(config, { contextPath, contextUrl }) as FileEntry
      });

      return;
    }

    const err = `createMcpTool: invalid configuration used at index ${index}: Unsupported type ${typeof config}`;

    normalizedConfigs.push({
      index,
      original: config,
      type: 'invalid',
      value: err,
      error: err
    });
  });

  return normalizedConfigs;
};

/**
 * Memoize the `normalizeTools` function.
 */
normalizeTools.memo = memo(normalizeTools, {
  cacheErrors: false,
  keyHash: args =>
    getSetMemoKey(args[0], `${(args as any)?.[1]?.contextPath}:${(args as any)?.[1]?.contextUrl}`)
});

/**
 * Author-facing config helper for creating an MCP tool configuration list for PatternFly MCP server.
 *
 * @example A single file path string
 * export default createMcpTool('./a/file/path.mjs');
 *
 * @example A single package string
 * export default createMcpTool('@my-org/my-tool');
 *
 * @example A single tool configuration tuple
 * export default createMcpTool([
 *   'myTool',
 *   { description: 'My tool description' },
 *   (args) => { ... }
 * ]);
 *
 * @example A single tool creator function
 * const myToolCreator = () => [
 *   'myTool',
 *   { description: 'My tool description' },
 *   (args) => { ... }
 * ];
 *
 * myToolCreator.toolName = 'myTool';
 * export default createMcpTool(myToolCreator);
 *
 * @example A single tool configuration object
 * export default createMcpTool({
 *   name: 'myTool',
 *   description: 'My tool description',
 *   inputSchema: {},
 *   handler: (args) => { ... }
 * });
 *
 * @example A multi-tool configuration array/list
 * export default createMcpTool([
 *   './a/file/path.mjs',
 *   {
 *     name: 'myTool',
 *     description: 'My tool description',
 *     inputSchema: {},
 *     handler: async (args) => { ... }
 *   }
 * ]);
 *
 * @param config - The configuration for creating the tool(s). Configuration can be any of the following:
 *   - A single string representing the name of a local ESM module file (`file path string` or `file URL string`). Limited to Node.js 22+
 *   - A single string representing the name of a local ESM tool package (`package string`). Limited to Node.js 22+
 *   - A single inline tool configuration tuple (`Tool`).
 *   - A single inline tool creator function returning a tuple (`ToolCreator`).
 *   - A single inline tool configuration object (`ToolConfig`).
 *   - An array of the aforementioned configuration types in any combination.
 * @returns An array of strings and/or tool creators that can be applied to the MCP server `toolModules` option.
 *
 * @throws {Error} If a configuration is invalid, an error is thrown on the first invalid entry. The error message
 *    includes the index and a brief description of the invalid entry.
 */
const createMcpTool = (config: string | Tool | ToolConfig | ToolCreator | ToolMultiConfig | ToolModule): ToolModule => {
  const entries = normalizeTools.memo(config);
  const err = entries.find(entry => entry.type === 'invalid');

  if (err?.error) {
    throw new Error(err.error);
  }

  return entries.map(entry => entry.value);
};

export {
  createMcpTool,
  normalizeFilePackage,
  normalizeFileUrl,
  normalizeFilePath,
  normalizeTuple,
  normalizeTupleSchema,
  normalizeObject,
  normalizeFunction,
  normalizeTools,
  sanitizeDataProp,
  sanitizePlainObject,
  sanitizeStaticToolName,
  type NormalizedToolEntry,
  type ToolCreator,
  type Tool,
  type ToolConfig,
  type ToolModule,
  type ToolMultiConfig,
  type ToolInternalOptions,
  type ToolExternalOptions
};

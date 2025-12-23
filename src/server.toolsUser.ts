import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, isAbsolute, resolve } from 'node:path';
import { isPlainObject } from './server.helpers';
import { type McpToolCreator, type McpTool } from './server';
import { type GlobalOptions } from './options';
import { memo } from './server.caching';
import { DEFAULT_OPTIONS } from './options.defaults';
import { formatUnknownError } from './logger';
import { normalizeInputSchema } from './server.schema';

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
  value: string | McpToolCreator;
  toolName?: string;
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
 * An MCP tool "wrapper", or "creator".
 *
 * @alias McpToolCreator
 */
type ToolCreator = McpToolCreator;

/**
 * An MCP tool. Standalone or returned by `createMcpTool`.
 *
 * @alias McpTool
 */
type Tool = McpTool;

/**
 * Author-facing "tools as plugins" surface.
 *
 * A tool module is a flexible type that supports either a single string identifier,
 * a specific tool creator, or multiple tool creators.
 *
 * - A `file path` or `file URL` string, that refers to the name or identifier of a local ESM tool package.
 * - A `package name` string, that refers to the name or identifier of a local ESM tool package.
 * - An `McpTool`, a tuple of `[toolName, toolConfig, toolHandler]`
 * - An `McpToolCreator`, a function that returns an `McpTool`.
 * - An array of `McpToolCreator` functions.
 */
type ToolModule = (string | McpTool | McpToolCreator | McpToolCreator[])[] | string | McpTool | McpToolCreator | McpToolCreator[];

// type ToolModule = string | McpTool | McpToolCreator | (string | McpTool | McpToolCreator)[];
// type ToolModules = string | McpTool | McpToolCreator | McpToolCreator[];

/**
 * Author-facing tool config. The handler may be async or sync.
 *
 * @template TArgs The type of arguments expected by the tool (optional).
 * @template TResult The type of result returned by the tool (optional).
 *
 * @property name - Name of the tool
 * @property description - Description of the tool
 * @property inputSchema - JSON Schema or Zod schema describing the arguments expected by the tool
 * @property {(args: TArgs, options?: GlobalOptions) => Promise<TResult> | TResult} handler - Tool handler
 *     - `args` are returned by the tool's `inputSchema`'
 *     - `options` are currently unused and reserved for future use.
 */
type ToolConfig<TArgs = unknown, TResult = unknown> = {
  name: string;
  description: string;
  inputSchema: unknown;
  handler: (args: TArgs, options?: GlobalOptions) => Promise<TResult> | TResult;
};

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
 * Author-facing multi-tool config.
 *
 * @property [name] - Optional name for the group of tools
 * @property {ToolConfig} tools - Array of tool configs
 */
type MultiToolConfig = {
  name?: string | undefined;
  tools: ToolConfig[]
};

/**
 * Allowed keys in the tool config objects. Expand as needed.
 */
const ALLOWED_CONFIG_KEYS = new Set(['name', 'description', 'inputSchema', 'handler'] as const);

/**
 * Allowed keys in the tool schema objects. Expand as needed. See related `ToolSchema`.
 */
const ALLOWED_SCHEMA_KEYS = new Set(['description', 'inputSchema'] as const);

/**
 * Return an object key value.
 *
 * @param obj
 * @param key
 */
const sanitizeDataProp = (obj: unknown, key: string) => {
  const descriptor = Object.getOwnPropertyDescriptor(obj, key);
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
 * Check if a string looks like a file path.
 *
 * @param str
 * @returns Confirmation that the string looks like a file path.
 */
const isFilePath = (str: string): boolean =>
  str.startsWith('./') || str.startsWith('../') || str.startsWith('/') || /^[A-Za-z]:[\\/]/.test(str);

/**
 * Check if a string looks like a URL.
 *
 * @param str
 * @returns Confirmation that the string looks like a URL.
 */
const isUrlLike = (str: string) =>
  /^(file:|https?:|data:|node:)/i.test(str);

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
normalizeTupleSchema.memo = memo(normalizeTupleSchema, { cacheErrors: false, keyHash: (...args) => args[0] });

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

  (creator as any).toolName = updatedName as string;

  let err: string | undefined;

  if (!updatedSchema) {
    err = `Tool "${updatedName}" failed to set inputSchema. Provide a Zod schema, a Zod raw shape, or a plain JSON Schema object.`;
  }

  return {
    original: config,
    toolName: updatedName as string,
    type: err ? 'invalid' : 'tuple',
    value: creator,
    error: err
  };
};

/**
 * Memoize the `normalizeTuple` function.
 */
normalizeTuple.memo = memo(normalizeTuple, { cacheErrors: false, keyHash: (...args) => args[0] });

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

  (creator as any).toolName = updatedName as string;

  let err: string | undefined;

  if (!updatedSchema) {
    err = `Tool "${updatedName}" failed to set inputSchema. Provide a Zod schema, a Zod raw shape, or a plain JSON Schema object.`;
  }

  return {
    original: config,
    toolName: updatedName as string,
    type: err ? 'invalid' : 'object',
    value: creator,
    error: err
  };
};

/**
 * Memoize the `normalizeObject` function.
 */
normalizeObject.memo = memo(normalizeObject, { cacheErrors: false, keyHash: (...args) => args[0] });

/**
 * Normalize a creator function into a tool creator function.
 *
 * @param config
 * @returns {CreatorEntry}
 */
const normalizeFunction = (config: unknown): CreatorEntry | undefined => {
  if (typeof config !== 'function') {
    return undefined;
  }

  const originalConfig = config as ToolCreator;

  const wrappedConfig: ToolCreator = (opts?: unknown) => {
    const response = originalConfig.call(null, opts as unknown as GlobalOptions);

    // Currently, we only support tuples in creator functions.
    if (normalizeTuple.memo(response)) {
      const { value } = normalizeTuple.memo(response) || {};

      return (value as ToolCreator)?.();
    }

    return response;
  };

  (wrappedConfig as any).toolName = (config as any).toolName;

  return {
    original: config,
    toolName: (config as any).toolName,
    type: 'creator',
    value: wrappedConfig as ToolCreator
  };
};

/**
 * Memoize the `normalizeFunction` function.
 */
normalizeFunction.memo = memo(normalizeFunction, { cacheErrors: false, keyHash: (...args) => args[0] });

/**
 * Normalize a file or package tool config into a file entry.
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

  const entry: Partial<NormalizedToolEntry> = { isUrlLike: isUrlLike(config), isFilePath: isFilePath(config) };

  let isFileUrl = config.startsWith('file:');
  let normalizedUrl = config;
  let fsReadDir: string | undefined = undefined;
  let type: NormalizedToolEntry['type'] = 'package'; // default classification for non-file strings
  let err: string | undefined;

  try {
    // Case 1: already a file URL
    if (isFileUrl) {
      // Best-effort derive fsReadDir for allow-listing
      try {
        const resolvedPath = fileURLToPath(config);

        fsReadDir = dirname(resolvedPath);
      } catch {}
      type = 'file';

      return {
        ...entry,
        normalizedUrl,
        fsReadDir,
        isFileUrl,
        original: config,
        type,
        value: config
      };
    }

    // Case 2: looks like a filesystem path -> resolve
    if (entry.isFilePath) {
      try {
        if (contextPath !== undefined && contextUrl !== undefined) {
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

          fsReadDir = dirname(resolvedPath);
          normalizedUrl = pathToFileURL(resolvedPath).href;
          isFileUrl = true;
          type = 'file';
        }
      } catch (error) {
        err = `Failed to resolve file path: ${config} ${formatUnknownError(error)}`;

        return {
          ...entry,
          normalizedUrl,
          fsReadDir,
          isFileUrl,
          original: config,
          type: 'invalid',
          value: config,
          error: err
        };
      }

      // Resolved file OK
      return {
        ...entry,
        normalizedUrl,
        fsReadDir,
        isFileUrl,
        original: config,
        type,
        value: config
      };
    }

    // Case 3: non-file string -> keep as-is (package name or other URL-like spec)
    // Note: http(s) module specs are not supported by Node import and will surface as load warnings in the child.
    return {
      ...entry,
      normalizedUrl,
      fsReadDir,
      isFileUrl: false,
      original: config,
      type: 'package',
      value: config
    };
  } catch (error) {
    err = `Failed to handle spec: ${config} ${formatUnknownError(error)}`;

    return {
      ...entry,
      normalizedUrl,
      fsReadDir,
      isFileUrl,
      original: config,
      type: 'invalid',
      value: config,
      error: err
    };
  }
};

/**
 * Memoize the `normalizeFilePackage` function.
 */
normalizeFilePackage.memo = memo(normalizeFilePackage, { cacheErrors: false, keyHash: (...args) => args[0] });

/**
 * Normalize tool configuration(s) into a normalized tool entry.
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
  const updatedConfigs = (Array.isArray(config) && config) || (config && [config]) || [];
  const normalizedConfigs: NormalizedToolEntry[] = [];

  // Flatten nested-arrays of configs and attempt to account for inline tuples. If inline tuples
  // become an issue, we'll discontinue inline support and require they be returned from
  // creator functions.
  const flattenedConfigs = updatedConfigs.flatMap((item: unknown) => {
    if (Array.isArray(item)) {
      return normalizeTuple.memo(item) ? [item] : item;
    }

    return [item];
  });

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
normalizeTools.memo = memo(normalizeTools, { cacheErrors: false });

/**
 * Author-facing helper for creating an MCP tool configuration list for Patternfly MCP server.
 *
 * @example A single file path string
 * export default createMcpTool('./a/file/path.mjs');
 *
 * @example A single package string
 * export default createMcpTool('@my-org/my-tool');
 *
 * @example A single tool configuration tuple
 * export default createMcpTool(['myTool', { description: 'My tool description' }, (args) => { ... }]);
 *
 * @example A single tool creator function
 * export default createMcpTool(() => ['myTool', { description: 'My tool description' }, (args) => { ... }]);
 *
 * @example A single tool configuration object
 * export default createMcpTool({ name: 'myTool', description: 'My tool description', inputSchema: {}, handler: (args) => { ... } });
 *
 * @example A multi-tool configuration array/list
 * export default createMcpTool(['./a/file/path.mjs', { name: 'myTool', description: 'My tool description', inputSchema: {}, handler: (args) => { ... } }]);
 *
 * @param config - The configuration for creating the tool(s). It can be:
 *   - A single string representing the name of a local ESM predefined tool (`file path string` or `file URL string`). Limited to Node.js 22+
 *   - A single string representing the name of a local ESM tool package (`package string`). Limited to Node.js 22+
 *   - A single inline tool configuration tuple (`Tool`).
 *   - A single inline tool creator function returning a tuple (`ToolCreator`).
 *   - A single inline tool configuration object (`ToolConfig`).
 *   - An array of the aforementioned configuration types in any combination.
 * @returns An array of strings and/or tool creators that can be applied to the MCP server `toolModules` option.
 *
 * @throws {Error} If a configuration is invalid, an error is thrown on the first invalid entry.
 */
const createMcpTool = (config: unknown): ToolModule => {
  const entries = normalizeTools(config);
  const err = entries.find(entry => entry.type === 'invalid');

  if (err?.error) {
    throw new Error(err.error);
  }

  return entries.map(entry => entry.value);
};

export {
  createMcpTool,
  isFilePath,
  isUrlLike,
  normalizeFilePackage,
  normalizeTuple,
  normalizeTupleSchema,
  normalizeObject,
  normalizeFunction,
  normalizeTools,
  sanitizeDataProp,
  sanitizePlainObject,
  type MultiToolConfig,
  type NormalizedToolEntry,
  type ToolCreator,
  type Tool,
  type ToolConfig,
  type ToolModule
};

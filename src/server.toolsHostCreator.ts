import { type McpTool, type McpToolCreator } from './server';

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
 * Guard for an array of creators. File-scoped helper.
 *
 * @private
 * @param value
 * @returns `true` if value is an array of functions.
 */
const isCreatorsArray = (value: unknown): value is McpToolCreator[] =>
  Array.isArray(value) && value.length > 0 && value.every(fn => typeof fn === 'function');

/**
 * Guard for tool tuple. File-scoped helper.
 *
 * @private
 * @param value
 * @returns `true` if value is a tool tuple.
 */
const isRealizedToolTuple = (value: unknown): value is McpTool =>
  Array.isArray(value) &&
  value.length === 3 &&
  typeof value[0] === 'string' &&
  typeof (value as unknown[])[2] === 'function';

/**
 * Wrap a realized tool tuple in a creator function that returns the tuple itself.
 * File-scoped helper.
 *
 * @private
 * @param cached
 * @returns A normalized creator function that returns the cached tool tuple.
 */
const wrapCachedTuple = (cached: McpTool): McpToolCreator & { toolName: string } => {
  const wrapped: McpToolCreator = () => cached;

  applyStaticProperty('toolName', cached[0], wrapped);

  return wrapped as McpToolCreator & { toolName: string };
};

/**
 * Options for resolveExternalCreators.
 */
type ResolveOptions = {
  throwOnEmpty?: boolean;
};

/**
 * Minimally filter, resolve, then cache tool creators from external module export during the child process.
 *
 * - Probes function exports at most once with toolOptions and never re-probes without options.
 * - Supported export shapes:
 *   - A `default export` that is a tool creator (function returning a tool tuple) -> wraps and caches as a creator (with .toolName)
 *   - A `default export` that is a function returning an array of tool creators (functions returning tool tuples) -> no unwrapping, returns them directly
 *   - A `default export` that is an array of tool creators (functions returning tool tuples) -> no unwrapping, returns them directly
 *
 * @example
 * // A default export creator (function returning a tool tuple)
 * export default () => ['toolName', { description: 'recommended', inputSchema: { ... } }, handler];
 *
 * @example
 * // A default export function returning an array of tool creators (functions returning tool tuples)
 * const dolorSit = () => ['toolName1', { description: 'recommended', inputSchema: { ... } }, handler];
 * const ametConsectetur = () => ['toolName2', { description: 'recommended', inputSchema: { ... } }, handler];
 *
 * export default () => [dolorSit, ametConsectetur];
 *
 * @example
 * // A default export array of tool creators (functions returning tool tuples)
 * export default [
 *   () => ['toolName1', { description: 'recommended', inputSchema: { ... } }, handler],
 *   () => ['toolName2', { description: 'recommended', inputSchema: { ... } }, handler]
 * ];
 *
 * @param moduleExports - The module exports object from the child process.
 * @param toolOptions - Tool options to pass to tool creators.
 * @param settings - Optional settings.
 * @param settings.throwOnEmpty - Throw an error if no tool creators are found. Defaults to false.
 */
const resolveExternalCreators = (
  moduleExports: unknown,
  toolOptions?: Record<string, unknown> | undefined,
  { throwOnEmpty = false }: ResolveOptions = {}
): McpToolCreator[] => {
  const mod = moduleExports as any;
  const candidates: unknown[] = [mod?.default, mod].filter(Boolean);

  const observed: string[] = [];

  for (const candidate of candidates) {
    if (typeof candidate === 'function') {
      observed.push('function');
      try {
        const result = (candidate as (o?: unknown) => unknown)(toolOptions);

        if (isRealizedToolTuple(result)) {
          return [wrapCachedTuple(result)];
        }

        if (isCreatorsArray(result)) {
          observed.push('creators[]');

          return result;
        }

        observed.push(Array.isArray(result) ? 'array' : typeof result);
      } catch {
        // Move to next candidate
      }

      continue;
    }

    if (isCreatorsArray(candidate)) {
      observed.push('creators[]');

      return candidate as McpToolCreator[];
    }

    // Note shape for diagnostics if we end up throwing on empty
    observed.push(Array.isArray(candidate) ? 'array' : typeof candidate);
  }

  if (throwOnEmpty) {
    const shapes = observed.length ? ` Observed candidate shapes: ${observed.join(', ')}` : '';

    throw new Error([
      `No usable tool creators found from module. ${shapes}`,
      'Expected one of:',
      '- default export: a tool creator (function that returns [name, { inputSchema, description? }, handler])',
      '- default export: a function that returns an array of tool creators',
      '- default export: an array of tool creators'
    ].join('\n'));
  }

  return [];
};

export { resolveExternalCreators, type ResolveOptions };

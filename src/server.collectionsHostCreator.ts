import { type McpCollectionCreator, type McpCollection } from './collections';

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
const isCreatorsArray = (value: unknown): value is McpCollectionCreator[] =>
  Array.isArray(value) && value.length > 0 && value.every(fn => typeof fn === 'function');

/**
 * Guard for tool tuple. File-scoped helper.
 *
 * @private
 * @param value
 * @returns `true` if value is a tool tuple.
 */
const isRealizedTuple = (value: unknown): value is McpCollection =>
  Array.isArray(value) &&
  value.length >= 2 &&
  typeof value[0] === 'string' &&
  typeof (value as unknown[])[1] === 'function';

/**
 * Wrap a realized tool tuple in a creator function that returns the tuple itself.
 * File-scoped helper.
 *
 * @private
 * @param cached
 * @returns A normalized creator function that returns the cached tool tuple.
 */
const wrapCachedTuple = (cached: McpCollection): McpCollectionCreator & { collectionName: string } => {
  const wrapped: McpCollectionCreator = () => cached;

  applyStaticProperty('collectionName', cached[0], wrapped);

  return wrapped as McpCollectionCreator & { collectionName: string };
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
 * @param moduleExports - The module exports object from the child process.
 * @param options - Options to pass to creators.
 * @param settings - Optional settings.
 * @param settings.throwOnEmpty - Throw an error if no tool creators are found. Defaults to false.
 */
const resolveCreators = (
  moduleExports: unknown,
  options?: Record<string, unknown> | undefined,
  { throwOnEmpty = false }: ResolveOptions = {}
): McpCollectionCreator[] => {
  const mod = moduleExports as any;
  const candidates: unknown[] = [mod?.default, mod].filter(Boolean);

  const observed: string[] = [];

  for (const candidate of candidates) {
    if (typeof candidate === 'function') {
      observed.push('function');
      try {
        const result = (candidate as (o?: unknown) => unknown)(options);

        if (isRealizedTuple(result)) {
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

      return candidate as McpCollectionCreator[];
    }

    // Note shape for diagnostics if we end up throwing on empty
    observed.push(Array.isArray(candidate) ? 'array' : typeof candidate);
  }

  if (throwOnEmpty) {
    const shapes = observed.length ? ` Observed candidate shapes: ${observed.join(', ')}` : '';

    throw new Error([
      `No usable collection creators found from module. ${shapes}`,
      'Expected one of:',
      '- default export: a collection creator (function that returns [name, handler])',
      '- default export: a function that returns an array of collection creators',
      '- default export: an array of collection creators'
    ].join('\n'));
  }

  return [];
};

export { resolveCreators, type ResolveOptions };

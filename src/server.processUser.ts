import { isReferenceLike } from './server.helpers';

/**
 * Apply a static property to an object.
 *
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
 * Memoization key store. See `getSetMemoKey`.
 */
const pluginMemoKeyStore: WeakMap<object, Map<string, symbol>> = new WeakMap();

/**
 * Quick consistent unique key, via symbol (anything unique-like will work), for a given input
 * and context.
 *
 * Used specifically for helping memoize functions and objects against context. Not used
 * elsewhere because simple equality checks, without context, in the lower-level functions
 * are good enough.
 *
 * @param input - Input can be an object, function, or primitive value.
 * @param contextKey - Additional context to help uniqueness.
 * @returns A unique key, a symbol for objects/functions or string for primitives.
 */
const getSetMemoKey = (input: unknown, contextKey: string) => {
  if (!isReferenceLike(input)) {
    return `${String(input)}:${contextKey}`;
  }

  let contextMap = pluginMemoKeyStore.get(input);
  let token;

  if (!contextMap) {
    contextMap = new Map<string, symbol>();
    pluginMemoKeyStore.set(input, contextMap);
  }

  token = contextMap.get(contextKey);

  if (!token) {
    token = Symbol(`plugins:${contextKey}`);
    contextMap.set(contextKey, token);
  }

  return token;
};

export { applyStaticProperty, getSetMemoKey };

import { createHash, type BinaryToTextEncoding } from 'node:crypto';

/**
 * Check if a value is a valid port number.
 *
 * @param port - Port number to check.
 * @returns Valid port number, or `undefined` if invalid.
 */
const portValid = (port: unknown) => {
  const toStr = String(port);
  const isFloatLike = toStr.includes('.');
  const parsedPort = Number.parseInt(toStr, 10);

  if (!isFloatLike && Number.isInteger(parsedPort) && parsedPort >= 0 && parsedPort < 65536) {
    return parsedPort;
  }

  return undefined;
};

/**
 * Check if an object is an object
 *
 * @param obj - Object, or otherwise, to check
 * @returns `true` if an object is an object
 */
const isObject = (obj: unknown): obj is Record<string, unknown> =>
  Object.prototype.toString.call(obj) === '[object Object]';

/**
 * Is an object a plain object?
 *
 * @param obj - Object, or otherwise, to check
 * @returns `true` if an object is a "plain object"
 */
const isPlainObject = (obj: unknown): obj is Record<string, unknown> => {
  if (!isObject(obj)) {
    return false;
  }

  const proto = Object.getPrototypeOf(obj);

  return proto === null || proto === Object.prototype;
};

/**
 * Is value reference-like? Exclude null and primitives.
 *
 * @param value
 * @returns - `true` if value is reference-like, object or function.
 */
const isReferenceLike = (value: unknown) =>
  value !== null && (typeof value === 'object' || typeof value === 'function');

/**
 * Merge two objects recursively, then return a new object, deep merge.
 *
 * Only recurses into plain objects. Arrays and non-plain objects are replaced, not merged.
 * Prototype-pollution keys are ignored.
 *
 * @param baseObj - Base object to merge into
 * @param sourceObj - Source object to merge from. Source may be `undefined` or `any` value; `non-plain objects` are ignored, and the
 *     base is returned cloned.
 * @param [options] - Merge options
 * @param [options.allowNullValues] - If `true`, `null` values in `sourceObj` will overwrite `baseObj` values. Default: `true`
 * @param [options.allowUndefinedValues] - If `true`, all undefined values in `sourceObj` will be merged on top of `baseObj`. Default: `false`
 * @returns Deeply merged object of type TBase
 */
const mergeObjects = <TBase extends object>(
  baseObj: TBase,
  sourceObj?: unknown,
  {
    allowNullValues = true,
    allowUndefinedValues = false
  }: { allowNullValues?: boolean; allowUndefinedValues?: boolean } = {}
): TBase => {
  if (!isPlainObject(baseObj) || !isPlainObject(sourceObj)) {
    return structuredClone(baseObj);
  }
  const pollutionKeys = ['__proto__', 'prototype', 'constructor'];
  const result = { ...baseObj } as Record<string, unknown>;
  const src = sourceObj as Record<string, unknown>;

  for (const key in src) {
    if (!pollutionKeys.includes(key) && Object.hasOwn(src, key)) {
      const baseVal = result[key];
      const srcVal = src[key];

      if (!allowNullValues && srcVal === null) {
        continue;
      }

      if (!allowUndefinedValues && typeof srcVal === 'undefined') {
        continue;
      }

      if (isPlainObject(baseVal) && isPlainObject(srcVal)) {
        result[key] = mergeObjects(
          baseVal as object,
          srcVal as object,
          { allowNullValues, allowUndefinedValues }
        );
      } else {
        result[key] = srcVal;
      }
    }
  }

  return result as TBase;
};

/**
 * Freeze an object recursively, deep freeze.
 *
 * @param obj - Object to freeze
 * @param [_seen] - WeakSet of already-seen objects. Default: `new WeakSet<object>()`.
 * @returns Frozen object of type TBase
 */
const freezeObject = <TBase>(obj: TBase, _seen?: WeakSet<object>): TBase => {
  const seen = _seen || new WeakSet<object>();

  const queue: unknown[] = [];
  const setQueue = (val: unknown) => {
    if (val && (typeof val === 'object' || typeof val === 'function')) {
      if (!seen.has(val)) {
        seen.add(val);
        queue.push(val);
      }
    }
  };

  setQueue(obj);

  while (queue.length) {
    const current = queue.pop();

    if (Object.isFrozen(current)) {
      continue;
    }

    if (Array.isArray(current)) {
      for (const item of current) {
        setQueue(item);
      }
      Object.freeze(current);
      continue;
    }

    if (isPlainObject(current)) {
      for (const key of Object.keys(current)) {
        setQueue(current[key]);
      }
      Object.freeze(current);
      continue;
    }

    // For non-plain objects (Map, Set, Date, RegExp, Function, etc.),
    try {
      Object.freeze(current);
    } catch {}
  }

  return obj;
};

/**
 * Check if "is a Promise", "Promise like".
 *
 * @param obj - Object, or otherwise, to check
 * @returns `true` if the object is a Promise
 */
const isPromise = (obj: unknown) => /^\[object (Promise|Async|AsyncFunction)]/.test(Object.prototype.toString.call(obj));

/**
 * Generate a hash from a string
 *
 * @param str
 * @param options - Hash options
 * @param options.algorithm - Hash algorithm (default: 'sha1')
 * @param options.encoding - Encoding of the hash (default: 'hex')
 * @returns Hash string
 */
const hashCode = (str: unknown, { algorithm = 'sha1', encoding = 'hex' }: { algorithm?: string; encoding?: BinaryToTextEncoding } = {}) =>
  createHash(algorithm)
    .update(String(str), 'utf8')
    .digest(encoding);

/**
 * Normalize a value for hashing with JSON.stringify
 *
 * @param value - Value to normalize for hashing, typically for JSON.stringify
 * @returns Normalized value suitable for JSON serialization
 */
const hashNormalizeValue = (value: unknown): unknown => {
  const normalizeSort = (a: any, b: any) => (a < b ? -1 : a > b ? 1 : 0);

  if (value === null) {
    return { $null: true };
  }

  switch (typeof value) {
    case 'undefined':
      return { $undefined: true };
    case 'string':
    case 'boolean':
      return value;
    case 'number':
      if (Number.isNaN(value)) {
        return { $number: 'NaN' };
      }

      if (value === Infinity) {
        return { $number: '+Infinity' };
      }

      if (value === -Infinity) {
        return { $number: '-Infinity' };
      }

      if (Object.is(value, -0)) {
        return { $number: '-0' };
      }

      return value;
    case 'bigint':
      return { $bigint: value.toString() };
    case 'function':
      return { $function: hashCode(value.toString(), { algorithm: 'sha256' }) };
    case 'symbol':
      return { $symbol: String(value) };
  }

  if (Array.isArray(value)) {
    return value.map(hashNormalizeValue);
  }

  if (value instanceof Error) {
    return { $error: value.toString() };
  }

  if (value instanceof Date) {
    return { $date: value.toISOString() };
  }

  if (value instanceof RegExp) {
    return { $regexp: value.toString() };
  }

  if (value instanceof Map) {
    const entries = Array.from(value.entries())
      .map(([key, val]) => [hashNormalizeValue(key), hashNormalizeValue(val)])
      .sort(([a], [b]) => normalizeSort(JSON.stringify(a), JSON.stringify(b)));

    return { $map: entries };
  }

  if (value instanceof Set) {
    const items = Array.from(value.values())
      .map(val => hashNormalizeValue(val))
      .sort((a, b) => normalizeSort(JSON.stringify(a), JSON.stringify(b)));

    return { $set: items };
  }

  if (isPlainObject(value)) {
    const rec = value as Record<string, unknown>;

    return Object.fromEntries(
      Object.keys(rec)
        .sort(normalizeSort)
        .map(key => [key, hashNormalizeValue(rec[key])])
    );
  }

  return value;
};

/**
 * Generate a consistent hash from a value
 *
 * @param anyValue - Value to hash
 * @returns Hash string
 */
const generateHash = (anyValue: unknown): string => {
  const normalizeValue = (_key: string, value: unknown) => hashNormalizeValue(value);
  let stringify: string;

  try {
    stringify = JSON.stringify(anyValue, normalizeValue);
  } catch (error) {
    stringify = `$error:${Object.prototype.toString.call(anyValue)}:${error}`;
  }

  return hashCode(stringify);
};

export {
  freezeObject,
  generateHash,
  hashCode,
  hashNormalizeValue,
  isObject,
  isPlainObject,
  isPromise,
  isReferenceLike,
  mergeObjects,
  portValid
};

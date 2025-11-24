import { createHash, type BinaryToTextEncoding } from 'node:crypto';

/**
 * Check if an object is an object
 *
 * @param obj - Object, or otherwise, to check
 * @returns `true` if an object is an object
 */
const isObject = (obj: unknown) =>
  Object.prototype.toString.call(obj) === '[object Object]';

/**
 * Is an object a plain object?
 *
 * @param obj - Object, or otherwise, to check
 * @returns `true` if an object is a "plain object"
 */
const isPlainObject = (obj: unknown) => {
  if (!isObject(obj)) {
    return false;
  }

  const proto = Object.getPrototypeOf(obj);

  return proto === null || proto === Object.prototype;
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
  generateHash,
  hashCode,
  hashNormalizeValue,
  isObject,
  isPlainObject,
  isPromise
};

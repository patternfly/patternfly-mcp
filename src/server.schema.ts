import { z, fromJSONSchema, toJSONSchema } from 'zod';
import { isPlainObject } from './server.helpers';

/**
 * Check if a value is a Zod schema, v3 or v4.
 *
 * This is a loose check, it may return false positives. Combine with `isZodRawShape`
 * for a slightly better check.
 *
 * @param value - Value to check
 * @returns `true` if the value appears to be a Zod schema
 */
const isZodSchema = (value: unknown): boolean => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // Guard for property presence
  const has = (key: string) => Object.prototype.hasOwnProperty.call(obj, key);
  const isFunc = (func: unknown) => typeof func === 'function';

  // Zod v4 detection: branded internals at `_zod`. In v4, `_zod` is an object
  // with `def` and a `version` string. set in core/versions
  if (has('_zod') && obj._zod && typeof obj._zod === 'object') {
    const internals = obj._zod as Record<string, unknown>;

    if ('def' in internals || typeof internals.version === 'string') {
      return true;
    }
  }

  // Zod v3 detection: `_def` object with both parse and safeParse functions
  if (has('_def') && obj._def && typeof obj._def === 'object') {
    if (isFunc(obj.parse) && isFunc(obj.safeParse)) {
      return true;
    }
  }

  return false;
};

/**
 * Check if a value is a ZodRawShapeCompat. An object with Zod schemas as values.
 *
 * @param value - Value to check
 * @returns `true` if the value appears to be a ZodRawShapeCompat
 */
const isZodRawShape = (value: unknown): boolean => {
  if (!isPlainObject(value)) {
    return false;
  }

  const obj = value as Record<string, unknown>;
  const values = Object.values(obj);

  // Empty object is not a shape
  if (values.length === 0) {
    return false;
  }

  // All values must be Zod schemas
  return values.every(isZodSchema);
};

/**
 * Convert a plain JSON Schema object to a Zod schema.
 * - For simple cases, converts to appropriate Zod schemas.
 * - For complex cases, falls back to z.any() to accept any input.
 *
 * @param jsonSchema - Plain JSON Schema object
 * @param settings - Optional settings
 * @param settings.failFast - Fail fast on unsupported types, or be nice and attempt to convert. Defaults to true.
 * @returns Zod schema equivalent
 */
const jsonSchemaToZod = (
  jsonSchema: unknown,
  { failFast = true }: { failFast?: boolean } = {}
): z.ZodTypeAny | undefined => {
  if (!isPlainObject(jsonSchema)) {
    return failFast ? undefined : z.any();
  }

  const schema = jsonSchema as Record<string, unknown>;

  try {
    return fromJSONSchema(schema);
  } catch {
    if (failFast) {
      return undefined;
    }
  }

  // Handle object type schemas, simplified conversion.
  if (schema.type === 'object') {
    // If additionalProperties is true or non-existent, allow any properties
    if (schema.additionalProperties === true || schema.additionalProperties === undefined) {
      if (z.looseObject) {
        return z.looseObject({});
      }

      const zodObject = z.object({});

      if ('passthrough' in zodObject) {
        return zodObject.passthrough();
      }
    }

    // If additionalProperties is false, use strict object
    return z.object({}).strict();
  }

  // For other types, fall back to z.any()
  // A full implementation would handle array, string, number, boolean, etc.
  return z.any();
};

/**
 * Minimal attempt to normalize an `inputSchema` to a Zod schema, compatible with the MCP SDK.
 * - If it's already a Zod schema or ZodRawShapeCompat, return as-is.
 * - If it's a plain JSON Schema, convert it to a Zod schema.
 *
 * @param inputSchema - Input schema (Zod schema, ZodRawShapeCompat, or plain JSON Schema)
 * @returns Returns a Zod instance for known inputs such as "Zod schema", "raw shape", or "JSON Schema", or the original value otherwise.
 */
const normalizeInputSchema = (inputSchema: unknown): z.ZodTypeAny | unknown => {
  // If it's already a Zod schema or a ZodRawShapeCompat (object with Zod schemas as values), return as-is
  if (isZodSchema(inputSchema)) {
    return inputSchema;
  }

  // If it's a Zod raw shape (object of Zod schemas), wrap as a Zod object schema
  if (isZodRawShape(inputSchema)) {
    return z.object(inputSchema as Record<string, any>);
  }

  // If it's a plain JSON Schema object, convert to Zod
  if (isPlainObject(inputSchema)) {
    return jsonSchemaToZod(inputSchema);
  }

  // Fallback: return as-is (might be undefined or other types)
  return inputSchema;
};

/**
 * Convert a Zod schema to JSON Schema if supported, else return undefined.
 * Defaults target to JSON Schema 2020-12 and generates the INPUT schema (for args).
 *
 * @param schema - Zod schema
 * @param options - Optional parameters for `toJSONSchema`.
 * @param options.target - JSON Schema version to generate. Defaults to "draft-2020-12".
 * @param options.io - Whether to generate the INPUT or OUTPUT schema. Defaults to "input".
 * @param options.unrepresentable - What to do with unrepresentable values. Defaults to "any".
 * @param options.remainingOptions - Additional options to pass to toJSONSchema.
 */
const zodToJsonSchema = (
  schema: unknown,
  { target = 'draft-2020-12', io = 'input', unrepresentable = 'any', ...remainingOptions }:
  { target?: string; io?: 'input' | 'output'; unrepresentable?: 'throw' | 'any', remainingOptions?: Record<string, unknown> } = {}
): unknown => {
  if (!isZodSchema(schema)) {
    return undefined;
  }

  try {
    return toJSONSchema(schema as any, {
      target,
      io,
      unrepresentable,
      ...remainingOptions
    });
  } catch {}

  return undefined;
};

export { isZodSchema, isZodRawShape, jsonSchemaToZod, normalizeInputSchema, zodToJsonSchema };

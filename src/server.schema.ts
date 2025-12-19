import { z, fromJSONSchema, toJSONSchema } from 'zod';
import { isPlainObject } from './server.helpers';

/**
 * Check if a value is a Zod schema (v3 or v4).
 *
 * @param value - Value to check
 * @returns `true` if the value appears to be a Zod schema
 */
const isZodSchema = (value: unknown): boolean => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // Zod v3 has _def property
  // Zod v4 has _zod property
  // Zod schemas have parse/safeParse methods
  return (
    ('_def' in obj && obj._def !== undefined) ||
    ('_zod' in obj && obj._zod !== undefined) ||
    (typeof obj.parse === 'function') ||
    (typeof obj.safeParse === 'function') ||
    (typeof obj.safeParseAsync === 'function')
  );
};

/**
 * Check if a value is a ZodRawShapeCompat (object with Zod schemas as values).
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

  // Handle object type schemas
  if (schema.type === 'object') {
    // If additionalProperties is true, allow any properties
    if (schema.additionalProperties === true || schema.additionalProperties === undefined) {
      if (z.looseObject) {
        return z.looseObject({});
      }

      // This is a simplified conversion - full JSON Schema to Zod conversion would be more complex
      return z.object({}).passthrough();
    }

    // If additionalProperties is false, use strict object
    return z.object({}).strict();
  }

  // For other types, fall back to z.any()
  // A full implementation would handle array, string, number, boolean, etc.
  return z.any();
};

/**
 * Attempt to normalize an `inputSchema` to a Zod schema, compatible with the MCP SDK.
 * - If it's already a Zod schema or ZodRawShapeCompat, return as-is.
 * - If it's a plain JSON Schema, convert it to a Zod schema.
 *
 * @param inputSchema - Input schema (Zod schema, ZodRawShapeCompat, or plain JSON Schema)
 * @returns Returns a Zod instance for known inputs (Zod schema, raw shape, or JSON Schema), or the original value otherwise.
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
 * Convert a Zod v4 schema to JSON Schema if supported, else return undefined.
 * Defaults target to JSON Schema 2020-12 and generates the INPUT schema (for args).
 *
 * @param schema - Zod schema
 * @param params - Optional parameters
 * @param params.target - JSON Schema version to generate. Defaults to "draft-2020-12".
 * @param params.io - Whether to generate the INPUT or OUTPUT schema. Defaults to "input".
 * @param params.unrepresentable - What to do with unrepresentable values. Defaults to "any".
 * @param params.params - Additional parameters to pass to toJSONSchema.
 */
const zodToJsonSchema = (
  schema: unknown,
  { target = 'draft-2020-12', io = 'input', unrepresentable = 'any', ...params }:
  { target?: string; io?: 'input' | 'output'; unrepresentable?: 'throw' | 'any', params?: Record<string, unknown> } = {}
): unknown => {
  if (!isZodSchema(schema)) {
    return undefined;
  }

  try {
    return toJSONSchema(schema as any, {
      target,
      io,
      unrepresentable,
      ...params
    });
  } catch {}

  return undefined;
};

export { isZodSchema, isZodRawShape, jsonSchemaToZod, normalizeInputSchema, zodToJsonSchema };

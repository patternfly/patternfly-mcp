import { z } from 'zod';
import {
  isZodSchema,
  isZodRawShape,
  jsonSchemaToZod,
  normalizeInputSchema,
  zodToJsonSchema
} from '../server.schema';

describe('isZodSchema', () => {
  it.each([
    {
      description: 'z.string()',
      value: z.string()
    },
    {
      description: 'z.array(z.string())',
      value: z.array(z.string())
    },
    {
      description: 'z.object({ name: z.string() })',
      value: z.object({ name: z.string() })
    },
    {
      description: 'z.union([z.string(), z.number()])',
      value: z.union([z.string(), z.number()])
    }
  ])('should be a Zod schema, $description', ({ value }) => {
    expect(isZodSchema(value)).toBe(true);
  });

  it.each([
    {
      description: 'plain object',
      value: { type: 'string' }
    },
    {
      description: 'object with parse method but not Zod',
      value: { parse: () => {} }
    },
    {
      description: 'object with safeParse method but not Zod',
      value: { safeParse: () => {} }
    },
    {
      description: 'object with safeParseAsync method but not Zod',
      value: { safeParseAsync: () => {} }
    },
    {
      description: 'null',
      value: null
    },
    {
      description: 'undefined',
      value: undefined
    },
    {
      description: 'string',
      value: 'not a schema'
    },
    {
      description: 'number',
      value: 123
    },
    {
      description: 'NaN',
      value: NaN
    },
    {
      description: 'array',
      value: [1, 2, 3]
    },
    {
      description: 'function',
      value: () => {}
    },
    {
      description: 'empty object',
      value: {}
    }
  ])('should NOT be a Zod schema, $description', ({ value }) => {
    expect(isZodSchema(value)).toBe(false);
  });
});

describe('isZodRawShape', () => {
  it.each([
    {
      description: 'object with Zod schemas as values',
      value: { name: z.string(), age: z.number() }
    },
    {
      description: 'object with single Zod schema',
      value: { name: z.string() }
    },
    {
      description: 'object with nested Zod schemas',
      value: {
        name: z.string(),
        tags: z.array(z.string()),
        metadata: z.object({ key: z.string() })
      }
    }
  ])('should be a Zod raw shape, $description', ({ value }) => {
    expect(isZodRawShape(value)).toBe(true);
  });

  it.each([
    {
      description: 'empty object',
      value: {}
    },
    {
      description: 'object with non-Zod values',
      value: { name: 'string', age: 123 }
    },
    {
      description: 'object with mixed Zod and non-Zod values',
      value: { name: z.string(), age: 123 }
    },
    {
      description: 'null',
      value: null
    },
    {
      description: 'undefined',
      value: undefined
    },
    {
      description: 'string',
      value: 'lorem ipsum'
    },
    {
      description: 'array',
      value: [z.string(), z.number()]
    },
    {
      description: 'Zod schema',
      value: z.string()
    },
    {
      description: 'Zod object schema',
      value: z.object({ name: z.string() })
    }
  ])('should NOT be a Zod raw shape, $description', ({ value }) => {
    expect(isZodRawShape(value)).toBe(false);
  });
});

describe('jsonSchemaToZod', () => {
  it.each([
    {
      description: 'string input, failFast true',
      jsonSchema: 'lorem ipsum',
      failFast: true,
      shouldBeZod: false
    },
    {
      description: 'string input, failFast false',
      jsonSchema: 'lorem ipsum',
      failFast: false,
      shouldBeZod: true
    },
    {
      description: 'number input, failFast true',
      jsonSchema: 1000,
      failFast: true,
      shouldBeZod: false
    },
    {
      description: 'number input, failFast false',
      jsonSchema: 1000,
      failFast: false,
      shouldBeZod: true
    },
    {
      description: 'array input, failFast true',
      jsonSchema: [1, 2, 3],
      failFast: true,
      shouldBeZod: false
    },
    {
      description: 'array input, failFast false',
      jsonSchema: [1, 2, 3],
      failFast: false,
      shouldBeZod: true
    },
    {
      description: 'null input with failFast true',
      jsonSchema: null,
      failFast: true,
      shouldBeZod: false
    },
    {
      description: 'null input with failFast false',
      jsonSchema: null,
      failFast: false,
      shouldBeZod: true
    },
    {
      description: 'undefined input with failFast true',
      jsonSchema: undefined,
      failFast: true,
      shouldBeZod: false
    },
    {
      description: 'undefined input with failFast false',
      jsonSchema: undefined,
      failFast: false,
      shouldBeZod: true
    },
    {
      description: 'simple string schema, failFast true',
      jsonSchema: { type: 'string' },
      failFast: true,
      shouldBeZod: true
    },
    {
      description: 'simple string schema, failFast false',
      jsonSchema: { type: 'string' },
      failFast: false,
      shouldBeZod: true
    },
    {
      description: 'object schema with additionalProperties true, failFast true',
      jsonSchema: { type: 'object', additionalProperties: true },
      failFast: true,
      shouldBeZod: true
    },
    {
      description: 'object schema with additionalProperties true, failFast false',
      jsonSchema: { type: 'object', additionalProperties: true },
      failFast: false,
      shouldBeZod: true
    },
    {
      description: 'complex unsupported schema attempt, failFast true',
      jsonSchema: { lorem: 'ipsum random string', type: 'array', items: { type: 'string' } },
      failFast: true,
      shouldBeZod: true
    },
    {
      description: 'complex unsupported schema attempt, failFast false',
      jsonSchema: { lorem: 'ipsum random string', type: 'array', items: { type: 'string' } },
      failFast: false,
      shouldBeZod: true
    },
    {
      description: 'complex schema, failFast true',
      jsonSchema: { type: 'object', properties: { name: { type: 'string' }, age: { type: 'number' } } },
      failFast: true,
      shouldBeZod: true
    },
    {
      description: 'complex schema, failFast false',
      jsonSchema: { type: 'object', properties: { name: { type: 'string' }, age: { type: 'number' } } },
      failFast: false,
      shouldBeZod: true
    }
  ])('should convert JSON Schema to Zod, $description', ({ jsonSchema, failFast, shouldBeZod }) => {
    const result = jsonSchemaToZod(jsonSchema, { failFast });

    expect(isZodSchema(result)).toBe(shouldBeZod);
    expect(zodToJsonSchema(result)).toMatchSnapshot();
  });
});

describe('normalizeInputSchema', () => {
  it.each([
    {
      description: 'Zod schema (z.string())',
      inputSchema: z.string()
    },
    {
      description: 'Zod schema (z.object({}))',
      inputSchema: z.object({ name: z.string() })
    },
    {
      description: 'Zod raw shape',
      inputSchema: { name: z.string(), age: z.number() }
    },
    {
      description: 'empty object',
      inputSchema: {}
    }
  ])('should return a zod schema, $description', ({ inputSchema }) => {
    const result = normalizeInputSchema(inputSchema);

    expect(isZodSchema(result)).toBe(true);
  });

  it.each([
    {
      description: 'null',
      inputSchema: null
    },
    {
      description: 'undefined',
      inputSchema: undefined
    },
    {
      description: 'string',
      inputSchema: 'not a schema'
    },
    {
      description: 'number',
      inputSchema: 123
    },
    {
      description: 'array',
      inputSchema: [1, 2, 3]
    }
  ])('should NOT return a zod schema, $description', ({ inputSchema }) => {
    const result = normalizeInputSchema(inputSchema);

    expect(isZodSchema(result)).toBe(false);
  });
});

describe('zodToJsonSchema', () => {
  it.each([
    {
      description: 'zod string',
      schema: z.string(),
      options: { io: 'output' }
    },
    {
      description: 'zod array',
      schema: z.array(z.string())
    },
    {
      description: 'zod object',
      schema: z.object({ name: z.string(), age: z.number() })
    },
    {
      description: 'zod union',
      schema: z.union([z.string(), z.number()]),
      options: { params: { strict: true } }
    }
  ])('should convert with options, $description', ({ schema, options }) => {
    const result = zodToJsonSchema(schema, options as any);

    expect(result).toBeDefined();
  });

  it.each([
    {
      description: 'plain object with zod',
      schema: { test: z.string() },
      options: { target: 'draft-2019-09' }
    },
    {
      description: 'plain object',
      schema: { test: 'z.string()' }
    },
    {
      description: 'string',
      schema: 'z.string()'
    },
    {
      description: 'zod object with throw',
      schema: z.object({ name: z.string(), age: 'z.number()' })
    },
    {
      description: 'null',
      schema: null
    },
    {
      description: 'undefined',
      schema: undefined
    }
  ])('should return undefined on conversion error, $description', ({ schema, options }) => {
    const result = zodToJsonSchema(schema, options as any);

    expect(result).toBeUndefined();
  });
});

import { z } from 'zod';
import { resolveExternalCreators } from '../server.toolsHostCreator';
import { isZodSchema } from '../server.schema';

describe('resolveExternalCreators', () => {
  it('should return a normalized module output with expected properties', () => {
    const moduleExport = {
      default: () => ['Tool1', { description: 'Tool 1', inputSchema: z.any() }, jest.fn()]
    };

    const [result] = resolveExternalCreators(moduleExport);
    const [name, schema = {}, handler]: any[] = result?.() || [];

    expect([
      name,
      {
        description: schema.description,
        inputSchema: `${schema} isZod = ${isZodSchema(schema.inputSchema)}`
      },
      handler
    ]).toMatchSnapshot('normalized');
  });

  it.each([
    {
      description: 'valid format, default export with function, tuple',
      moduleExports: {
        default: () => ['Tool1', { description: 'Tool 1', inputSchema: {} }, jest.fn()]
      },
      isValid: true
    },
    {
      description: 'valid format, default export with function, array of functions with tuple return',
      moduleExports: {
        default: () => [
          () => ['Tool1', { description: 'Tool 1', inputSchema: {} }, jest.fn()],
          () => ['Tool1', { description: 'Tool 1', inputSchema: {} }, jest.fn()]
        ]
      },
      isValid: true
    },
    {
      description: 'valid format, default export with array of functions with tuple return',
      moduleExports: {
        default: [
          () => ['Tool1', { description: 'Tool 1', inputSchema: {} }, jest.fn()],
          () => ['Tool1', { description: 'Tool 1', inputSchema: {} }, jest.fn()]
        ]
      },
      isValid: true
    },
    {
      description: 'invalid format, default export with function, array of tuples',
      moduleExports: {
        default: () => [
          ['Tool1', { description: 'Tool 1', inputSchema: {} }, jest.fn()],
          ['Tool2', { description: 'Tool 2', inputSchema: {} }, jest.fn()]
        ]
      },
      isValid: false
    },
    {
      description: 'invalid format, default export with tuple',
      moduleExports: {
        default: ['Tool1', { description: 'Tool 1', inputSchema: {} }, jest.fn()]
      },
      isValid: false
    },
    {
      description: 'invalid format, default export with array of tuples',
      moduleExports: {
        default: [
          ['Tool1', { description: 'Tool 1', inputSchema: {} }, jest.fn()],
          ['Tool2', { description: 'Tool 2', inputSchema: {} }, jest.fn()]
        ]
      },
      isValid: false
    },
    {
      description: 'invalid format, default export function that returns empty',
      moduleExports: {
        default: () => {}
      },
      isValid: false
    },
    {
      description: 'invalid format, empty module',
      moduleExports: {},
      isValid: false
    },
    {
      description: 'invalid format, default export function that returns null',
      moduleExports: {
        default: () => null
      },
      isValid: false
    },
    {
      description: 'invalid format, null',
      moduleExports: null,
      isValid: false
    },
    {
      description: 'invalid format, default export function that returns undefined',
      moduleExports: {
        default: () => undefined
      },
      isValid: false
    },
    {
      description: 'invalid format, undefined',
      moduleExports: undefined,
      isValid: false
    },
    {
      description: 'invalid format, default export function that throws',
      moduleExports: {
        default: () => {
          throw new Error('Function error');
        }
      },
      isValid: false
    },
    {
      description: 'invalid format, function that throws',
      moduleExports: () => {
        throw new Error('Function error');
      },
      isValid: false
    },
    {
      description: 'invalid format, function returning unsupported shape',
      moduleExports: () => 'not a tool or creators[]',
      isValid: false
    },
    {
      description: 'invalid format, array with non-function elements',
      moduleExports: ['not a function', 123, {}],
      isValid: false
    },
    {
      description: 'invalid format, named exports only',
      moduleExports: {
        named1: () => ['Tool1', { description: 'Tool 1', inputSchema: {} }, jest.fn()],
        named2: () => ['Tool2', { description: 'Tool 2', inputSchema: {} }, jest.fn()]
      },
      isValid: false
    }
  ])('should normalize module exports with specific formats, $description', ({ moduleExports, isValid }) => {
    const result = resolveExternalCreators(moduleExports);

    expect(Array.isArray(result)).toBe(true);
    expect(result.length > 0).toBe(isValid);
  });
});

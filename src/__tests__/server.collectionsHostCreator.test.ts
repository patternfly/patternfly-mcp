import { resolveCreators } from '../server.collectionsHostCreator';

describe('resolveCreators', () => {
  it('should return a normalized module output with expected properties', () => {
    const mockHandler = jest.fn();
    const moduleExport = {
      default: () => ['Collection1', mockHandler, { runInChildProcess: true }]
    };

    const [result] = resolveCreators(moduleExport);
    const [name, handler, config]: any[] = result?.() || [];

    expect([
      name,
      handler,
      config
    ]).toEqual([
      'Collection1',
      mockHandler,
      { runInChildProcess: true }
    ]);
  });

  it.each([
    {
      description: 'valid format, default export with function, tuple',
      moduleExports: {
        default: () => ['Collection1', jest.fn(), { runInChildProcess: true }]
      },
      isValid: true
    },
    {
      description: 'valid format, default export with function, array of functions with tuple return',
      moduleExports: {
        default: () => [
          () => ['Collection1', jest.fn(), { runInChildProcess: true }],
          () => ['Collection1', jest.fn(), { runInChildProcess: true }]
        ]
      },
      isValid: true
    },
    {
      description: 'valid format, default export with array of functions with tuple return',
      moduleExports: {
        default: [
          () => ['Collection1', jest.fn(), { runInChildProcess: true }],
          () => ['Collection1', jest.fn(), { runInChildProcess: true }]
        ]
      },
      isValid: true
    },
    {
      description: 'invalid format, default export with function, array of tuples',
      moduleExports: {
        default: () => [
          ['Collection1', jest.fn(), { runInChildProcess: true }],
          ['Collection2', jest.fn(), { runInChildProcess: true }]
        ]
      },
      isValid: false
    },
    {
      description: 'invalid format, default export with tuple',
      moduleExports: {
        default: ['Collection1', jest.fn(), { runInChildProcess: true }]
      },
      isValid: false
    },
    {
      description: 'invalid format, default export with array of tuples',
      moduleExports: {
        default: [
          ['Collection1', jest.fn(), { runInChildProcess: true }],
          ['Collection2', jest.fn(), { runInChildProcess: true }]
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
      moduleExports: () => 'not a collection or creators[]',
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
        named1: () => ['Collection1', jest.fn(), { runInChildProcess: true }],
        named2: () => ['Collection2', jest.fn(), { runInChildProcess: true }]
      },
      isValid: false
    }
  ])('should normalize module exports with specific formats, $description', ({ moduleExports, isValid }) => {
    const result = resolveCreators(moduleExports);

    expect(Array.isArray(result)).toBe(true);
    expect(result.length > 0).toBe(isValid);
  });

  it('should throw an error on empty if throwOnEmpty option is enabled', () => {
    expect(() => {
      resolveCreators({}, undefined, { throwOnEmpty: true });
    }).toThrow(/No usable collection creators found/);
  });
});

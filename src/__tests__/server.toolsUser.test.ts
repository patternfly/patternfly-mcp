import { pathToFileURL } from 'node:url';
import { basename, resolve } from 'node:path';
import { z } from 'zod';
import {
  createMcpTool,
  isFilePath,
  isUrlLike,
  normalizeFilePackage,
  normalizeFilePath,
  normalizeFileUrl,
  normalizeTuple,
  normalizeTupleSchema,
  normalizeObject,
  normalizeFunction,
  normalizeTools,
  sanitizeDataProp,
  sanitizePlainObject,
  sanitizeStaticToolName,
  type Tool,
  type ToolCreator,
  type ToolMultiConfig,
  type ToolConfig
} from '../server.toolsUser';
import { isZodSchema } from '../server.schema';

describe('sanitizeDataProp', () => {
  it('returns descriptor for data property and excludes accessors', () => {
    const obj = { a: 1 };

    Object.defineProperty(obj, 'b', { get: () => 2 });
    const a = sanitizeDataProp(obj, 'a');
    const b = sanitizeDataProp(obj, 'b');
    const cProp = sanitizeDataProp(obj, 'c');

    expect(a?.value).toBe(1);
    expect(b).toBeUndefined();
    expect(cProp).toBeUndefined();
  });
});

describe('sanitizePlainObject', () => {
  it('filters to allowed keys and ignores accessors', () => {
    const allowed = new Set(['x', 'y']);
    const obj = { x: 1, y: 2, z: 3 };

    Object.defineProperty(obj, 'y', { get: () => 2 });
    const out = sanitizePlainObject(obj, allowed);

    expect(out).toEqual({ x: 1 });
    expect(Object.prototype.hasOwnProperty.call(out, 'y')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(out, 'z')).toBe(false);
  });

  it.each([
    { description: 'null', obj: null },
    { description: 'undefined', obj: undefined },
    { description: 'array', obj: [1, 2, 3] },
    { description: 'function', obj: () => {} }
  ])('should return an empty object, $description', ({ obj }) => {
    expect(sanitizePlainObject(obj, new Set())).toEqual({});
  });
});

describe('sanitizeStaticToolName', () => {
  it('should return the trimmed name when toolName is set with defineProperty', () => {
    const func = function testCreator() {};

    Object.defineProperty(func, 'toolName', { value: '  MyTool  ', writable: false, enumerable: false, configurable: false });

    expect(sanitizeStaticToolName(func)).toBe('MyTool');
  });

  it('should return undefined when toolName is defined through a "getter"', () => {
    const func = function testCreator() {};

    Object.defineProperty(func, 'toolName', {
      get() {
        throw new Error('should not be called');
      }
    });

    expect(sanitizeStaticToolName(func)).toBeUndefined();
  });

  it('should return undefined when a Proxy throws', () => {
    const target = function testCreator() {};
    const proxy = new Proxy(target, {
      getOwnPropertyDescriptor(_target, prop) {
        if (prop === 'toolName') {
          throw new Error('trap');
        }

        return Reflect.getOwnPropertyDescriptor(_target, prop as PropertyKey);
      }
    });

    expect(sanitizeStaticToolName(proxy)).toBeUndefined();
  });
});

describe('isFilePath', () => {
  it.each([
    { description: 'absolute path', file: '/path/to/file.txt' },
    { description: 'absolute path ref no extension', file: '/path/to/another/file' },
    { description: 'min file extension', file: 'path/to/another/file.y' },
    { description: 'potential multiple extensions', file: 'path/to/another/file.test.js' },
    { description: 'current dir ref', file: './path/to/another/file.txt' },
    { description: 'parent dir ref', file: '../path/to/another/file.txt' }
  ])('should validate $description', ({ file }) => {
    expect(isFilePath(file)).toBe(true);
  });

  it.each([
    { description: 'no file extension or dir ref', file: 'path/to/another/file' }
  ])('should fail, $description', ({ file }) => {
    expect(isFilePath(file)).toBe(false);
  });
});

describe('isUrlLike', () => {
  it.each([
    { description: 'http', url: 'http://example.com' },
    { description: 'https', url: 'https://example.com' },
    { description: 'file', url: 'file:///path/to/file.txt' },
    { description: 'node', url: 'node://path/to/file.txt' },
    { description: 'data', url: 'data:text/plain;base64,1234567890==' }
  ])('should validate $description', ({ url }) => {
    expect(isUrlLike(url)).toBe(true);
  });

  it.each([
    { description: 'invalid protocol', url: 'ftp://example.com' },
    { description: 'random', url: 'random://example.com' },
    { description: 'null', url: null },
    { description: 'undefined', url: undefined }
  ])('should fail, $description', ({ url }) => {
    expect(isUrlLike(url as any)).toBe(false);
  });
});

describe('normalizeTupleSchema', () => {
  it.each([
    {
      description: 'valid JSON schema with description',
      schema: { description: '  hello  ', inputSchema: { type: 'object', properties: {} } }
    },
    {
      description: 'valid JSON schema without description',
      schema: { inputSchema: { type: 'object', properties: {} } }
    },
    {
      description: 'non-object',
      schema: 'nope'
    },
    {
      description: 'object missing inputSchema',
      schema: { description: 'x' }
    }
  ])('should normalize object, $description', ({ schema }) => {
    const updated = normalizeTupleSchema(schema);

    if (updated?.inputSchema) {
      updated.inputSchema = `isZod = ${isZodSchema(updated.inputSchema)}`;
    }

    expect(updated).toMatchSnapshot();
  });

  it('should have a memo property', () => {
    expect(normalizeTupleSchema.memo).toBeDefined();
  });
});

describe('normalizeTuple', () => {
  it.each([
    {
      description: 'basic',
      tuple: ['loremIpsum', { description: 'lorem ipsum', inputSchema: { type: 'object', properties: {} } }, () => {}]
    },
    {
      description: 'untrimmed name, zod schema, async handler',
      tuple: ['loremIpsum  ', { description: 'lorem ipsum', inputSchema: z.any() }, async () => {}]
    },
    {
      description: 'missing schema',
      tuple: ['dolorSit', { description: 'x' }, async () => {}]
    },
    {
      description: 'missing handler',
      tuple: ['dolorSit', { description: 'x' }]
    },
    {
      description: 'undefined',
      tuple: undefined
    },
    {
      description: 'null',
      tuple: null
    }
  ])('should normalize the config, $description', ({ tuple }) => {
    const updated = normalizeTuple(tuple);

    if ((updated?.original as any)?.[1]?.inputSchema && isZodSchema((updated?.original as any)[1].inputSchema)) {
      (updated?.original as any)[1].inputSchema = 'isZod = true';
    }

    expect(updated).toMatchSnapshot();
  });

  it('should have a memo property', () => {
    expect(normalizeTuple.memo).toBeDefined();
  });
});

describe('normalizeObject', () => {
  it.each([
    {
      description: 'basic',
      obj: { name: 'loremIpsum', description: 'lorem ipsum', inputSchema: { type: 'object', properties: {} }, handler: () => {} }
    },
    {
      description: 'untrimmed name, zod schema, async handler',
      obj: { name: 'loremIpsum', description: 'lorem ipsum', inputSchema: z.any(), handler: async () => {} }
    },
    {
      description: 'missing schema',
      obj: { name: 'dolorSit', description: 'x', handler: async () => {} }
    },
    {
      description: 'missing handler',
      obj: { name: 'dolorSit', description: 'x' }
    },
    {
      description: 'undefined',
      tuple: undefined
    },
    {
      description: 'null',
      tuple: null
    }
  ])('should normalize the config, $description', ({ obj }) => {
    const updated = normalizeObject(obj);

    if ((updated?.original as any)?.inputSchema && isZodSchema((updated?.original as any).inputSchema)) {
      (updated?.original as any).inputSchema = 'isZod = true';
    }

    expect(updated).toMatchSnapshot();
  });

  it('should have a memo property', () => {
    expect(normalizeObject.memo).toBeDefined();
  });
});

describe('normalizeFunction', () => {
  it.each([
    {
      description: 'basic',
      func: () => ['loremIpsum', { description: 'lorem ipsum', inputSchema: { type: 'object', properties: {} } }, () => {}]
    },
    {
      description: 'untrimmed name, zod schema, async handler',
      func: () => ['loremIpsum  ', { description: 'lorem ipsum', inputSchema: z.any() }, async () => {}]
    },
    {
      description: 'missing schema',
      func: () => ['dolorSit', { description: 'x' }, async () => {}]
    },
    {
      description: 'missing handler',
      func: () => ['dolorSit', { description: 'x' }]
    },
    {
      description: 'undefined',
      func: () => undefined
    },
    {
      description: 'null',
      func: () => null
    }
  ])('should normalize the config, $description', ({ func }) => {
    const updatedFunc = func;

    (updatedFunc as any).toolName = 'loremIpsum';

    const out = normalizeFunction(updatedFunc);
    const updated = (out?.original as any)?.();

    if (updated?.[1]?.inputSchema && isZodSchema(updated[1].inputSchema)) {
      updated[1].inputSchema = 'isZod = true';
    }

    expect(out?.type).toBe('creator');
    expect(updated).toMatchSnapshot();
  });

  it('should be an invalid creator if the toolName is missing', () => {
    const func = () => ['loremIpsum  ', { description: 'lorem ipsum', inputSchema: z.any() }, async () => {}];

    const updated = normalizeFunction(func);

    expect(updated?.type).toBe('invalid');
    expect(updated?.error).toMatch(/missing.*toolname/i);
  });

  it('should throw a predictable error on unwrap if the function errors', () => {
    const func = () => {
      throw new Error('Function error');
    };

    (func as any).toolName = 'loremIpsum';

    const updated = normalizeFunction(func);

    expect(() => (updated?.value as any)?.()).toThrow('Tool failed to load:');
  });

  it('should have a memo property', () => {
    expect(normalizeFunction.memo).toBeDefined();
  });
});

describe('normalizeFileUrl', () => {
  it.each([
    {
      description: 'file URL',
      file: pathToFileURL(resolve(process.cwd(), 'package.json')).href,
      expectType: 'file'
    },
    {
      description: 'relative file path',
      file: './package.json',
      expectType: undefined
    },
    {
      description: 'absolute file path',
      file: resolve(process.cwd(), 'package.json'),
      expectType: undefined
    },
    {
      description: 'package name string',
      file: '@scope/pkg',
      expectType: undefined
    },
    {
      description: 'http URL (not file)',
      file: 'https://github.com/patternfly/patternfly-mcp/module.mjs',
      expectType: undefined
    },
    {
      description: 'invalid file URLs, hostname',
      config: 'file://example.com/etc/hosts',
      expectType: undefined
    },
    {
      description: 'invalid file URLs, encoding',
      file: 'file:///foo/%E0%A4%A',
      expectType: 'invalid'
    }
  ])('handles $description', ({ file, expectType }) => {
    const updated = normalizeFileUrl(file);

    if (updated) {
      updated.fsReadDir = '/';
      updated.normalizedUrl = `/${basename(updated.normalizedUrl as string)}`;
      updated.original = `/${basename(updated.original as string)}`;
      updated.value = `/${basename(updated.value as string)}`;

      if (updated.error) {
        updated.error = 'true';
      }
    }
    expect(updated?.type).toBe(expectType);
    expect(updated).toMatchSnapshot();
  });

  it('should have a memo property', () => {
    expect(normalizeFileUrl.memo).toBeDefined();
  });
});

describe('normalizeFilePath', () => {
  it.each([
    {
      description: 'file URL',
      file: pathToFileURL(resolve(process.cwd(), 'package.json')).href,
      expectType: undefined
    },
    {
      description: 'relative file path',
      file: './package.json',
      expectType: 'file'
    },
    {
      description: 'absolute file path',
      file: resolve(process.cwd(), 'package.json'),
      expectType: 'file'
    },
    {
      description: 'package name string',
      file: '@scope/pkg',
      expectType: undefined
    }
  ])('handles $description', ({ file, expectType }) => {
    const updated = normalizeFilePath(file);

    if (updated) {
      updated.fsReadDir = '/';
      updated.normalizedUrl = `/${basename(updated.normalizedUrl as string)}`;
      updated.original = `/${basename(updated.original as string)}`;
      updated.value = `/${basename(updated.value as string)}`;

      if (updated.error) {
        updated.error = 'true';
      }
    }

    expect(updated?.type).toBe(expectType);
    expect(updated).toMatchSnapshot();
  });

  it('should have a memo property', () => {
    expect(normalizeFilePath.memo).toBeDefined();
  });

  it('should use memoization consistently for contextPath and contextUrl results', () => {
    const config = './fixtures/tool.mjs';

    const resultOne = normalizeFilePath.memo(config, { contextPath: '/A', contextUrl: 'file:///A/index.mjs' });
    const resultTwo = normalizeFilePath.memo(config, { contextPath: '/B', contextUrl: 'file:///B/index.mjs' });
    const resultThree = normalizeFilePath.memo(config, { contextUrl: 'file:///B/index.mjs', contextPath: '/B' });

    expect(resultTwo).not.toEqual(resultOne);
    expect(resultThree).toEqual(resultTwo);
  });
});

describe('normalizeFilePackage', () => {
  it.each([
    {
      description: 'file URL',
      file: pathToFileURL(resolve(process.cwd(), 'package.json')).href,
      expectType: 'file'
    },
    {
      description: 'relative file path',
      file: './package.json',
      expectType: 'file'
    },
    {
      description: 'absolute file path',
      file: resolve(process.cwd(), 'package.json'),
      expectType: 'file'
    },
    {
      description: 'package name string',
      file: '@scope/pkg',
      expectType: 'package'
    },
    {
      description: 'http URL (not file)',
      file: 'https://github.com/patternfly/patternfly-mcp/module.mjs',
      expectType: 'package'
    },
    {
      description: 'undefined',
      file: undefined,
      expectType: undefined
    },
    {
      description: 'null',
      file: null,
      expectType: undefined
    },
    {
      description: 'number',
      file: 10_000,
      expectType: undefined
    },
    {
      description: 'invalid file URLs, hostname',
      config: 'file://example.com/etc/hosts',
      expectType: undefined
    },
    {
      description: 'invalid file URLs, encoding',
      file: 'file:///foo/%E0%A4%A',
      expectType: 'invalid'
    }
  ])('handles $description', ({ file, expectType }) => {
    const updated = normalizeFilePackage(file);

    if (updated) {
      updated.fsReadDir = '/';
      updated.normalizedUrl = `/${basename(updated.normalizedUrl as string)}`;
      updated.original = `/${basename(updated.original as string)}`;
      updated.value = `/${basename(updated.value as string)}`;

      if (updated.error) {
        updated.error = 'true';
      }
    }

    expect(updated?.type).toBe(expectType);
    expect(updated).toMatchSnapshot();
  });

  it('should have a memo property', () => {
    expect(normalizeFilePackage.memo).toBeDefined();
  });

  it('should use memoization consistently for contextPath and contextUrl results', () => {
    const config = './fixtures/tool.mjs';

    const resultOne = normalizeFilePackage.memo(config, { contextPath: '/A', contextUrl: 'file:///A/index.mjs' });
    const resultTwo = normalizeFilePackage.memo(config, { contextPath: '/B', contextUrl: 'file:///B/index.mjs' });
    const resultThree = normalizeFilePackage.memo(config, { contextUrl: 'file:///B/index.mjs', contextPath: '/B' });

    expect(resultTwo).not.toEqual(resultOne);
    expect(resultThree).toEqual(resultTwo);
  });
});

describe('normalizeTools', () => {
  it.each([
    {
      description: 'a creator',
      config: (() => {
        const testing = () => ['loremIpsum', { description: 'lorem ipsum', inputSchema: { type: 'object', properties: {} } }, () => {}];

        (testing as any).toolName = 'loremIpsum';

        return testing;
      })()
    },
    {
      description: 'array of creators',
      config: [
        (() => {
          const testing = () => ['loremIpsum', { description: 'lorem ipsum', inputSchema: { type: 'object', properties: {} } }, () => {}];

          (testing as any).toolName = 'loremIpsum';

          return testing;
        })(),
        (() => {
          const testing = () => ['dolorSit', { description: 'dolor sit', inputSchema: { type: 'object', properties: {} } }, () => {}];

          (testing as any).toolName = 'dolorSit';

          return testing;
        })()
      ]
    },
    {
      description: 'an object',
      config: { name: 'loremIpsum', description: 'lorem ipsum', inputSchema: { type: 'object', properties: {} }, handler: () => {} }
    },
    {
      description: 'mix of package, object, tuple, creator',
      config: [
        '@scope/pkg',
        { name: 'ametDolor', description: 'amet dolor', inputSchema: { type: 'object', properties: {} }, handler: () => {} },
        ['loremIpsum', { description: 'lorem ipsum', inputSchema: { type: 'object', properties: {} } }, () => {}],
        (() => {
          const testing = () => ['dolorSit', { description: 'dolor sit', inputSchema: { type: 'object', properties: {} } }, () => {}];

          (testing as any).toolName = 'dolorSit';

          return testing;
        })()
      ]
    },
    {
      description: 'single tuple',
      config: ['loremIpsum', { description: 'lorem ipsum', inputSchema: { type: 'object', properties: {} } }, () => {}]
    },
    {
      description: 'mix of non-configs',
      config: [null, undefined, { x: 1 }, new Error('lorem ipsum')]
    },
    {
      description: 'invalid file URLs, hostname, encoding',
      config: ['file://example.com/etc/hosts', 'file:///foo/%E0%A4%A']
    }
  ])('should normalize configs, $description', ({ config }) => {
    const result = normalizeTools(config);
    const configLength = !normalizeTuple(config) && Array.isArray(config) ? config.length : 1;

    expect(result.length).toBe(configLength);
    expect(result.map(({ index, type, toolName }) => ({ index, type, toolName }))).toMatchSnapshot();
  });

  it('should flatten when using non-tuple configs (arrays)', () => {
    const config = [[1, 2, 3], ['lorem', 'ipsum', 'dolor', 'sit']];
    const result = normalizeTools(config);
    const configLength = config.flat().length;

    expect(result.length).toBe(configLength);
  });

  it('should have a memo property', () => {
    expect(normalizeTools.memo).toBeDefined();
  });

  it.each([
    {
      description: 'file',
      config: './fixtures/tool.mjs'
    },
    {
      description: 'package',
      config: '@scope/pkg'
    },
    {
      description: 'inline function',
      config: () => ['a', { inputSchema: {} }, () => {}]
    },
    {
      description: 'array of inline function',
      config: [() => ['a', { inputSchema: {} }, () => {}]]
    },
    {
      description: 'inline tuple',
      config: ['a', { description: 'a', inputSchema: {} }, () => {}]
    },
    {
      description: 'inline object',
      config: { name: 'a', description: 'a', inputSchema: {}, handler: () => {} }
    },
    {
      description: 'array of inline configurations',
      config: [
        './fixtures/tool.mjs',
        () => ['a', { inputSchema: {} }, () => {}],
        { name: 'b', description: 'b', inputSchema: {}, handler: () => {} },
        ['c', { description: 'c', inputSchema: {} }, () => {}]
      ]
    }
  ])('should use memoization consistently with contextPath and contextUrl results, $description', ({ config }) => {
    const resultOne = normalizeTools.memo(config, { contextPath: '/A', contextUrl: 'file:///A/index.mjs' });
    const resultTwo = normalizeTools.memo(config, { contextPath: '/B', contextUrl: 'file:///B/index.mjs' });
    const resultThree = normalizeTools.memo(config, { contextUrl: 'file:///B/index.mjs', contextPath: '/B' });

    expect(resultTwo).not.toBe(resultOne);
    expect(resultThree).toBe(resultTwo);
  });
});

describe('createMcpTool', () => {
  it.each([
    {
      description: 'a creator',
      config: (() => {
        const testing: ToolCreator = () => ['loremIpsum', { description: 'lorem ipsum', inputSchema: { type: 'object', properties: {} } }, () => {}];

        (testing as any).toolName = 'loremIpsum';

        return testing;
      })()
    },
    {
      description: 'array of creators',
      config: [
        (() => {
          const testing: ToolCreator = () => ['loremIpsum', { description: 'lorem ipsum', inputSchema: { type: 'object', properties: {} } }, () => {}];

          (testing as any).toolName = 'loremIpsum';

          return testing;
        })(),
        (() => {
          const testing: ToolCreator = () => ['dolorSit', { description: 'dolor sit', inputSchema: { type: 'object', properties: {} } }, () => {}];

          (testing as any).toolName = 'dolorSit';

          return testing;
        })()
      ]
    },
    {
      description: 'an object',
      config: { name: 'loremIpsum', description: 'lorem ipsum', inputSchema: { type: 'object', properties: {} }, handler: () => {} } as ToolConfig
    },
    {
      description: 'mix of package, object, tuple, creator',
      config: [
        '@scope/pkg',
        { name: 'ametDolor', description: 'amet dolor', inputSchema: { type: 'object', properties: {} }, handler: () => {} } as ToolConfig,
        ['loremIpsum', { description: 'lorem ipsum', inputSchema: { type: 'object', properties: {} } }, () => {}] as Tool,
        (() => {
          const testing: ToolCreator = () => ['dolorSit', { description: 'dolor sit', inputSchema: { type: 'object', properties: {} } }, () => {}];

          (testing as any).toolName = 'dolorSit';

          return testing;
        })()
      ]
    },
    {
      description: 'single tuple',
      config: ['loremIpsum', { description: 'lorem ipsum', inputSchema: { type: 'object', properties: {} } }, () => {}] as Tool
    },
    {
      description: 'nested createMcpTool calls',
      config: [
        createMcpTool([createMcpTool('@scope/pkg1'), '@scope/pkg2', '@scope/pkg3']),
        createMcpTool(createMcpTool(['loremIpsum', { description: 'lorem ipsum', inputSchema: { type: 'object', properties: {} } }, () => {}])),
        createMcpTool(['dolorSit', { description: 'dolor sit', inputSchema: { type: 'object', properties: {} } }, () => {}]),
        createMcpTool('@scope/pkg4'),
        '@scope/pkg5'
      ] as ToolMultiConfig
    }
  ])('should normalize configs, $description', ({ config }) => {
    const result = createMcpTool(config);

    expect(result).toMatchSnapshot();
  });

  it.each([
    {
      description: 'packages, mix of non-configs',
      config: ['@scope/pkg', '@scope/pkg2', '@scope/pkg3', [1, 2, 3], new Error('lorem ipsum')],
      expectInvalidIndex: 3
    },
    {
      description: 'undefined',
      config: ['@scope/pkg', undefined],
      expectInvalidIndex: 1
    }
  ])('should throw an error, $description', ({ config, expectInvalidIndex }) => {
    expect(() => createMcpTool(config as any)).toThrow(`createMcpTool: invalid configuration used at index ${expectInvalidIndex}:`);
  });

  it.each([
    {
      description: 'invalid file path, hostname',
      config: 'file://example.com/etc/hosts'
    },
    {
      description: 'invalid file path, bad encoding',
      config: 'file:///foo/%E0%A4%A'
    }
  ])('should throw an error with invalid file paths, $description', ({ config }) => {
    expect(() => createMcpTool([config])).toThrow('Failed to resolve file');
  });
});

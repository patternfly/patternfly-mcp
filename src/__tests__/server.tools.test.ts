import { resolve } from 'node:path';
import { spawn } from 'child_process';
import { log } from '../logger';
import {
  getBuiltInToolName,
  computeFsReadAllowlist,
  logWarningsErrors,
  getFilePackageToolModules,
  debugChild,
  spawnToolsHost,
  makeProxyCreators,
  sendToolsHostShutdown,
  composeTools
} from '../server.tools';
import { awaitIpc, makeId, send } from '../server.toolsIpc';
import { isZodSchema } from '../server.schema';

jest.mock('node:child_process', () => ({
  spawn: jest.fn()
}));

jest.mock('../logger', () => ({
  log: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn()
  },
  formatUnknownError: jest.fn((error: unknown) => String(error))
}));

jest.mock('../server.toolsIpc', () => ({
  send: jest.fn(),
  awaitIpc: jest.fn(),
  makeId: jest.fn(() => 'id-1'),
  isHelloAck: jest.fn((msg: any) => msg?.t === 'hello:ack'),
  isInvokeResult: jest.fn((msg: any) => msg?.t === 'invoke:result'),
  isLoadAck: jest.fn((id: string) => (msg: any) => msg?.t === 'load:ack' && msg?.id === id),
  isManifestResult: jest.fn((id: string) => (msg: any) => msg?.t === 'manifest:result' && msg?.id === id)
}));

describe('getBuiltInToolName', () => {
  it('should return built-in tool name', () => {
    const toolName = 'loremIpsum';
    const creator = () => {};

    creator.toolName = toolName;

    expect(getBuiltInToolName(creator as any)).toBe(toolName);
  });
});

describe('computeFsReadAllowlist', () => {
  it('should return a list of allowed paths', () => {
    const toolModules = ['@scope/pkg', resolve(process.cwd(), 'package.json')];

    expect(computeFsReadAllowlist({ toolModules, contextUrl: 'file://', contextPath: '/' } as any)).toEqual(['/']);
  });
});

describe('logWarningsErrors', () => {
  const MockLog = jest.mocked(log);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    {
      description: 'with warnings only',
      warnings: ['Warning 1', 'Warning 2'],
      errors: []
    },
    {
      description: 'with errors only',
      warnings: [],
      errors: ['Error 1', 'Error 2']
    },
    {
      description: 'with both warnings and errors',
      warnings: ['Warning 1'],
      errors: ['Error 1']
    },
    {
      description: 'with empty arrays',
      warnings: [],
      errors: []
    },
    {
      description: 'with undefined warnings and errors',
      warnings: undefined,
      errors: undefined
    },
    {
      description: 'with single warning',
      warnings: ['Single warning'],
      errors: []
    },
    {
      description: 'with single error',
      warnings: [],
      errors: ['Single error']
    }
  ])('should log warnings and errors, $description', ({ warnings, errors }) => {
    logWarningsErrors({ warnings, errors } as any);

    expect(MockLog.warn.mock.calls).toMatchSnapshot();
  });
});

describe('getFilePackageToolModules,', () => {
  it('should return filtered tool modules', () => {
    const toolModules = [
      '@scope/pkg',
      'file:///test/module.js',
      undefined,
      'http://example.com/module.js',
      'https://example.com/module.js'
    ];
    const updated = getFilePackageToolModules({ toolModules } as any);

    expect(updated.length).toBe(4);
    expect(updated).toMatchSnapshot();
  });
});

describe('debugChild', () => {
  let debugSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    debugSpy = jest.spyOn(log, 'debug').mockImplementation(() => {});
    warnSpy = jest.spyOn(log, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    {
      description: 'default',
      message: 'lorem ipsum dolor sit amet'
    },
    {
      description: 'access denied',
      message: 'Error [ERR_ACCESS_DENIED]: Access denied: FileSystemRead, resource: /lorem/ipsum/dolor/sit/amet'
    },
    {
      description: 'access denied, multiple lines',
      message: 'Error [ERR_ACCESS_DENIED]: Access denied: FileSystemRead, resource: /lorem/ipsum/dolor/sit/amet\nError [ERR_ACCESS_DENIED]: Access denied: FileSystemRead, resource: /lorem/ipsum/dolor/sit/amet'
    },
    {
      description: 'access denied, alt messaging',
      message: 'Error [ERR_ACCESS_DENIED]: fs.readFileSync access is denied by permission model: FileSystemRead, resource: /lorem/ipsum/dolor/sit/amet\nError [ERR_ACCESS_DENIED]: Access denied: FileSystemRead, resource: /lorem/ipsum/dolor/sit/amet'
    },
    {
      description: 'module not found',
      message: 'Error [ERR_MODULE_NOT_FOUND]: Cannot find module \'/lorem/ipsum/dolor/sit/amet\' imported from /test/path'
    },
    {
      description: 'module not found, multiple lines',
      message: 'Error [ERR_MODULE_NOT_FOUND]: Cannot find module \'/lorem/ipsum/dolor/sit/amet\' imported from /test/path\nError [ERR_MODULE_NOT_FOUND]: Cannot find module \'/lorem/ipsum/dolor/sit/amet\' imported from /test/path'
    },
    {
      description: 'generic multiline error',
      message: 'Lorem ipsum\ndolor sit\namet'
    },
    {
      description: 'generic multiline error with spaces',
      message: 'Lorem ipsum   \n\tdolor sit\n   amet'
    },
    {
      description: 'empty string',
      message: ''
    }
  ])('should attempt to highlight specific messages, $description', async ({ message }) => {
    let mockHandler: any;
    const mockOff = jest.fn();
    const mockChild = {
      pid: 123,
      stderr: {
        on: (_: any, handler: any) => mockHandler = handler,
        off: mockOff
      }
    } as any;

    const unsubscribe = debugChild(mockChild, { sessionId: '1234567890' } as any);

    mockHandler(message);

    expect({
      warn: warnSpy.mock.calls,
      debug: debugSpy.mock.calls
    }).toMatchSnapshot();

    unsubscribe();
    expect(mockOff).toHaveBeenCalledWith('data', mockHandler);
  });
});

describe('spawnToolsHost', () => {
  const MockSpawn = jest.mocked(spawn);
  const MockAwaitIpc = jest.mocked(awaitIpc);
  const MockSend = jest.mocked(send);
  const MockMakeId = jest.mocked(makeId);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    {
      description: 'with undefined pluginIsolation, node 22',
      options: { nodeVersion: 22, pluginIsolation: undefined }
    },
    {
      description: 'with strict pluginIsolation, node 22',
      options: { nodeVersion: 22, pluginIsolation: 'strict' }
    },
    {
      description: 'with no pluginIsolation, node 24',
      options: { nodeVersion: 24, pluginIsolation: 'none' }
    },
    {
      description: 'with strict pluginIsolation, node 24',
      options: { nodeVersion: 24, pluginIsolation: 'strict' }
    }
  ])('attempt to spawn the Tools Host, $description', async ({ options }) => {
    const updatedOptions = { pluginHost: { loadTimeoutMs: 10, invokeTimeoutMs: 10 }, ...options };
    const mockPid = 123;
    const mockTools = [{ name: 'alphaTool' }, { name: 'betaTool' }];

    MockSpawn.mockReturnValue({
      pid: mockPid
    } as any);

    MockAwaitIpc
      .mockResolvedValueOnce({ t: 'hello:ack', id: 'id-1' } as any)
      .mockResolvedValueOnce({ t: 'load:ack', id: 'id-1', warnings: [], errors: [] } as any)
      .mockResolvedValueOnce({ t: 'manifest:result', id: 'id-1', tools: mockTools } as any);

    const result = await spawnToolsHost(updatedOptions as any);

    expect(result.child.pid).toBe(mockPid);
    expect(result.tools).toEqual(mockTools);
    expect(MockMakeId).toHaveBeenCalledTimes(3);
    expect(MockSend).toHaveBeenCalledTimes(3);

    expect({
      spawn: MockSpawn.mock.calls?.[0]?.slice?.(1)
    }).toMatchSnapshot('spawn');
  });

  it('should throw when resolve fails', async () => {
    process.env.NODE_ENV = '__test__';

    await expect(
      spawnToolsHost({ nodeVersion: 24, pluginIsolation: 'strict', pluginHost: {} } as any)
    ).rejects.toThrow(/Failed to resolve Tools Host/);

    process.env.NODE_ENV = 'local';
  });
});

describe('makeProxyCreators', () => {
  const MockAwaitIpc = jest.mocked(awaitIpc);
  const MockSend = jest.mocked(send);
  const MockMakeId = jest.mocked(makeId);
  const MockLog = jest.mocked(log);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    {
      description: 'no tools',
      tools: []
    },
    {
      description: 'basic',
      tools: [
        {
          id: 'loremIpsum',
          name: 'Lorem Ipsum',
          description: 'Lorem ipsum dolor sit amet',
          inputSchema: {},
          source: ''
        }
      ]
    },
    {
      description: 'null JSON input schema',
      tools: [
        {
          id: 'loremIpsum',
          name: 'Lorem Ipsum',
          description: 'Lorem ipsum dolor sit amet',
          inputSchema: null,
          source: ''
        }
      ]
    },
    {
      description: 'undefined JSON input schema',
      tools: [
        {
          id: 'loremIpsum',
          name: 'Lorem Ipsum',
          description: 'Lorem ipsum dolor sit amet',
          inputSchema: undefined,
          source: ''
        }
      ]
    }
  ])('should attempt to return proxy creators, a function wrapper per tool, $description', ({ tools }) => {
    const proxies = makeProxyCreators({ tools } as any, { pluginHost: { invokeTimeoutMs: 10 } } as any);
    const output = proxies.map(proxy => {
      const [name, { description, inputSchema, ...rest }, handler] = proxy();

      return [
        name,
        { description, inputSchema: `isZod = ${isZodSchema(inputSchema)}`, ...rest },
        handler
      ];
    });

    expect({
      output,
      debug: MockLog.debug.mock.calls
    }).toMatchSnapshot();
  });

  it.each([
    {
      description: 'ok false',
      response: {
        ok: false,
        result: { value: 7 }
      }
    },
    {
      description: 'ok false with error',
      response: {
        ok: false,
        result: { value: 7 },
        error: { message: 'Error message' }
      }
    },
    {
      description: 'ok false with full error',
      response: {
        ok: false,
        result: { value: 7 },
        error: { message: 'Error message', stack: 'line 1\nline 2', code: 'ERR_CODE', cause: { details: 'Details' } }
      }
    }
  ])('should attempt to invoke a creator then throw an error on child response, $description', async ({ response }) => {
    const tools = [
      {
        id: 'loremIpsum',
        name: 'Lorem Ipsum',
        description: 'Lorem ipsum dolor sit amet',
        inputSchema: {},
        source: ''
      }
    ];

    MockMakeId.mockReturnValue('id-1' as any);
    MockAwaitIpc
      .mockResolvedValueOnce({ t: 'invoke:result', id: 'id-1', ...response } as any);

    const proxies = makeProxyCreators({ tools } as any, { pluginHost: { invokeTimeoutMs: 10 } } as any);
    const [_name, _schema, handler]: any = proxies.map(proxy => {
      const [name, { description, inputSchema, ...rest }, handler] = proxy();

      return [
        name,
        { description, inputSchema: `isZod = ${isZodSchema(inputSchema)}`, ...rest },
        handler
      ];
    })[0];

    await expect(handler({ loremIpsum: 7 })).rejects.toMatchSnapshot('handler');
    expect(MockSend.mock.calls).toMatchSnapshot('send');
  });
});

describe('sendToolsHostShutdown', () => {
  it('should exist', () => {
    // placeholder test
    expect(sendToolsHostShutdown).toBeDefined();
  });
});

describe('composeTools', () => {
  it('should exist', () => {
    // placeholder test
    expect(composeTools).toBeDefined();
  });
});

/*
import { spawn, type ChildProcess } from 'node:child_process';
import {
  composeTools,
  logWarningsErrors,
  sendToolsHostShutdown
} from '../server.tools';
import { builtinTools } from '../server';
import { log } from '../logger';
import { getOptions, getSessionOptions } from '../options.context';
import { send, awaitIpc, type IpcResponse } from '../server.toolsIpc';
import { DEFAULT_OPTIONS } from '../options.defaults';
// import { type ToolDescriptor } from '../server.toolsIpc';

// Mock dependencies
jest.mock('../logger', () => ({
  log: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn()
  },
  formatUnknownError: jest.fn((error: unknown) => String(error))
}));

jest.mock('../options.context', () => ({
  getOptions: jest.fn(),
  getSessionOptions: jest.fn(),
  setOptions: jest.fn(),
  runWithSession: jest.fn(),
  runWithOptions: jest.fn()
}));

jest.mock('../server.toolsIpc', () => {
  const actual = jest.requireActual('../server.toolsIpc');

  return {
    ...actual,
    makeId: jest.fn(() => 'mock-id'),
    send: jest.fn().mockReturnValue(true),
    awaitIpc: jest.fn()
  };
});

jest.mock('node:child_process', () => ({
  spawn: jest.fn()
}));

// Mock import.meta.resolve for #toolsHost to avoid test failures
// We'll handle this by ensuring the mock returns a valid path

jest.mock('node:url', () => {
  const actual = jest.requireActual('node:url');

  return {
    ...actual,
    fileURLToPath: jest.fn((url: string) => {
      if (typeof url === 'string' && url.includes('toolsHost')) {
        return '/mock/path/to/toolsHost.js';
      }

      return actual.fileURLToPath(url);
    }),
    pathToFileURL: actual.pathToFileURL
  };
});

jest.mock('node:fs', () => {
  const actual = jest.requireActual('node:fs');

  return {
    ...actual,
    realpathSync: jest.fn((path: string) => path)
  };
});

const MockLog = log as jest.MockedObject<typeof log>;
const MockGetOptions = getOptions as jest.MockedFunction<typeof getOptions>;
const MockGetSessionOptions = getSessionOptions as jest.MockedFunction<typeof getSessionOptions>;
const MockSpawn = spawn as jest.MockedFunction<typeof spawn>;
const MockSend = send as jest.MockedFunction<typeof send>;
const MockAwaitIpc = awaitIpc as jest.MockedFunction<typeof awaitIpc>;

describe('logWarningsErrors', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    {
      description: 'with warnings only',
      warnings: ['Warning 1', 'Warning 2'],
      errors: [],
      expectedWarnCalls: 1
    },
    {
      description: 'with errors only',
      warnings: [],
      errors: ['Error 1', 'Error 2'],
      expectedWarnCalls: 1
    },
    {
      description: 'with both warnings and errors',
      warnings: ['Warning 1'],
      errors: ['Error 1'],
      expectedWarnCalls: 2
    },
    {
      description: 'with empty arrays',
      warnings: [],
      errors: [],
      expectedWarnCalls: 0
    },
    {
      description: 'with undefined warnings and errors',
      warnings: undefined,
      errors: undefined,
      expectedWarnCalls: 0
    },
    {
      description: 'with single warning',
      warnings: ['Single warning'],
      errors: [],
      expectedWarnCalls: 1
    },
    {
      description: 'with single error',
      warnings: [],
      errors: ['Single error'],
      expectedWarnCalls: 1
    }
  ])('should log warnings and errors, $description', ({ warnings, errors, expectedWarnCalls }) => {
    const options: { warnings?: string[]; errors?: string[] } = {};

    if (warnings !== undefined) {
      options.warnings = warnings;
    }
    if (errors !== undefined) {
      options.errors = errors;
    }
    logWarningsErrors(options);

    expect(MockLog.warn).toHaveBeenCalledTimes(expectedWarnCalls);
    if (warnings && warnings.length > 0) {
      expect(MockLog.warn).toHaveBeenCalledWith(
        expect.stringContaining(`Tools load warnings (${warnings.length})`)
      );
    }
    if (errors && errors.length > 0) {
      expect(MockLog.warn).toHaveBeenCalledWith(
        expect.stringContaining(`Tools load errors (${errors.length})`)
      );
    }
  });

  it('should format warning messages correctly', () => {
    logWarningsErrors({ warnings: ['Warning 1', 'Warning 2'] });

    expect(MockLog.warn).toHaveBeenCalledWith(
      expect.stringContaining('Warning 1')
    );
    expect(MockLog.warn).toHaveBeenCalledWith(
      expect.stringContaining('Warning 2')
    );
  });

  it('should format error messages correctly', () => {
    logWarningsErrors({ errors: ['Error 1', 'Error 2'] });

    expect(MockLog.warn).toHaveBeenCalledWith(
      expect.stringContaining('Error 1')
    );
    expect(MockLog.warn).toHaveBeenCalledWith(
      expect.stringContaining('Error 2')
    );
  });
});

 */
/*
describe('normalizeToolModules', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    MockGetOptions.mockReturnValue({
      contextPath: '/test/path',
      toolModules: []
    } as any);
  });

  it.each([
    {
      description: 'file: URL',
      toolModules: ['file:///test/module.js'],
      expected: ['file:///test/module.js']
    },
    {
      description: 'http: URL',
      toolModules: ['http://example.com/module.js'],
      expected: ['http://example.com/module.js']
    },
    {
      description: 'https: URL',
      toolModules: ['https://example.com/module.js'],
      expected: ['https://example.com/module.js']
    },
    {
      description: 'data: URL',
      toolModules: ['data:text/javascript,export default {}'],
      expected: ['data:text/javascript,export default {}']
    },
    {
      description: 'node: protocol',
      toolModules: ['node:fs'],
      expected: ['node:fs']
    },
    {
      description: 'relative path starting with ./',
      toolModules: ['./module.js'],
      contextPath: '/test/path',
      expectedPattern: 'file://'
    },
    {
      description: 'relative path starting with ../',
      toolModules: ['../module.js'],
      contextPath: '/test/path',
      expectedPattern: 'file://'
    },
    {
      description: 'absolute path on Unix',
      toolModules: ['/absolute/path/module.js'],
      contextPath: '/test/path',
      expectedPattern: 'file://'
    },
    {
      description: 'absolute path on Windows',
      toolModules: ['C:\\absolute\\path\\module.js'],
      contextPath: '/test/path',
      expectedPattern: 'file://'
    },
    {
      description: 'package name',
      toolModules: ['@scope/package'],
      expected: ['@scope/package']
    },
    {
      description: 'scoped package name',
      toolModules: ['@patternfly/tools'],
      expected: ['@patternfly/tools']
    },
    {
      description: 'empty array',
      toolModules: [],
      expected: []
    }
  ])('should normalize tool modules, $description', ({ toolModules, contextPath, expected, expectedPattern }) => {
    MockGetOptions.mockReturnValue({
      contextPath: contextPath || '/test/path',
      toolModules
    } as any);

    const result = normalizeToolModules();

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(toolModules.length);

    if (expected) {
      expect(result).toEqual(expected);
    } else if (expectedPattern) {
      result.forEach(url => {
        expect(url).toMatch(new RegExp(expectedPattern));
      });
    }
  });

  it('should handle multiple mixed module types', () => {
    MockGetOptions.mockReturnValue({
      contextPath: '/test/path',
      toolModules: [
        'file:///absolute/module.js',
        './relative/module.js',
        '@scope/package',
        'https://example.com/module.js'
      ]
    } as any);

    const result = normalizeToolModules();

    expect(result.length).toBe(4);
    expect(result[0]).toBe('file:///absolute/module.js');
    expect(result[1]).toMatch(/^file:\/\//);
    expect(result[2]).toBe('@scope/package');
    expect(result[3]).toBe('https://example.com/module.js');
  });
});
*/
/*
describe('sendToolsHostShutdown', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    MockGetOptions.mockReturnValue({
      pluginHost: DEFAULT_OPTIONS.pluginHost
    } as any);

    MockGetSessionOptions.mockReturnValue({
      sessionId: 'test-session-id',
      channelName: 'test-channel'
    } as any);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it.each([
    {
      description: 'with default grace period',
      pluginHost: {},
      expectedGracePeriod: 0
    },
    {
      description: 'with custom grace period',
      pluginHost: { gracePeriodMs: 1000 },
      expectedGracePeriod: 1000
    },
    {
      description: 'with zero grace period',
      pluginHost: { gracePeriodMs: 0 },
      expectedGracePeriod: 0
    }
  ])('should shutdown tools host, $description', async ({ pluginHost }) => {
    MockGetOptions.mockReturnValue({
      pluginHost: { ...DEFAULT_OPTIONS.pluginHost, ...pluginHost }
    } as any);

    // Since we can't directly access activeHostsBySession, we'll test
    // that the function handles the case when no host exists
    await sendToolsHostShutdown();

    // Should not throw when no host exists
    expect(MockSend).not.toHaveBeenCalled();
  });

  it('should not throw when no active host exists', async () => {
    await expect(sendToolsHostShutdown()).resolves.not.toThrow();
  });
});

describe('composeTools', () => {
  let mockChild: ChildProcess & {
    kill: jest.Mock;
    killed: boolean;
    on: jest.Mock;
    once: jest.Mock;
    off: jest.Mock;
    send: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Mock import.meta.resolve for #toolsHost
    const originalResolve = import.meta.resolve;

    try {
      Object.defineProperty(import.meta, 'resolve', {
        value: (spec: string) => {
          if (spec === '#toolsHost') {
            return 'file:///mock/path/to/toolsHost.js';
          }

          return originalResolve.call(import.meta, spec);
        },
        writable: true,
        configurable: true
      });
    } catch {
      // If we can't mock import.meta.resolve, tests that require it will fail gracefully
    }

    mockChild = {
      kill: jest.fn(),
      killed: false,
      on: jest.fn(),
      once: jest.fn(),
      off: jest.fn(),
      send: jest.fn().mockReturnValue(true),
      pid: 123,
      connected: true,
      disconnect: jest.fn(),
      exitCode: null,
      signalCode: null,
      channel: null,
      stdin: null,
      stdout: null,
      stderr: null,
      stdio: [],
      spawnfile: '',
      spawnargs: []
    } as any;

    MockSpawn.mockReturnValue(mockChild as any);

    MockGetOptions.mockReturnValue({
      toolModules: ['./test-module.js'],
      nodeVersion: 22,
      contextPath: '/test/path',
      contextUrl: 'file:///test/path',
      pluginHost: DEFAULT_OPTIONS.pluginHost,
      pluginIsolation: undefined
    } as any);

    MockGetSessionOptions.mockReturnValue({
      sessionId: 'test-session-id',
      channelName: 'test-channel'
    } as any);

    // Mock IPC responses - check the actual message type
    MockAwaitIpc.mockImplementation(async (child: any, matcher: any): Promise<IpcResponse> => {
      // Test the matcher with a sample message to determine type
      const testHello: IpcResponse = { t: 'hello:ack', id: 'mock-id' };
      const testLoad: IpcResponse = { t: 'load:ack', id: 'mock-id', warnings: [], errors: [] };
      const testManifest: IpcResponse = { t: 'manifest:result', id: 'mock-id', tools: [] };

      if (matcher(testHello)) {
        return testHello;
      }
      if (matcher(testLoad)) {
        return testLoad;
      }
      if (matcher(testManifest)) {
        return {
          t: 'manifest:result',
          id: 'mock-id',
          tools: [
            {
              id: 'tool-1',
              name: 'Tool1',
              description: 'Tool 1',
              inputSchema: {}
            }
          ]
        } as IpcResponse;
      }
      throw new Error('Unexpected matcher');
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it.each([
    {
      description: 'with empty toolModules',
      toolModules: [],
      expectedBuiltinOnly: true
    },
    {
      description: 'with undefined toolModules',
      toolModules: undefined,
      expectedBuiltinOnly: true
    },
    {
      description: 'with null toolModules',
      toolModules: null,
      expectedBuiltinOnly: true
    }
  ])('should return only built-in tools, $description', async ({ toolModules }) => {
    MockGetOptions.mockReturnValue({
      toolModules,
      nodeVersion: 22,
      contextPath: '/test/path',
      contextUrl: 'file:///test/path',
      pluginHost: DEFAULT_OPTIONS.pluginHost
    } as any);

    const result = await composeTools(builtinTools);

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(MockSpawn).not.toHaveBeenCalled();
  });

  it.each([
    {
      description: 'Node 20',
      nodeVersion: 20,
      toolModules: ['./module.js']
    },
    {
      description: 'Node 21',
      nodeVersion: 21,
      toolModules: ['./module.js']
    },
    {
      description: 'Node 18',
      nodeVersion: 18,
      toolModules: ['./module.js']
    }
  ])('should skip externals and warn when Node < 22, $description', async ({ nodeVersion, toolModules }) => {
    MockGetOptions.mockReturnValue({
      toolModules,
      nodeVersion,
      contextPath: '/test/path',
      contextUrl: 'file:///test/path',
      pluginHost: DEFAULT_OPTIONS.pluginHost
    } as any);

    const result = await composeTools(builtinTools);

    expect(Array.isArray(result)).toBe(true);
    // Note: File resolution happens before Node version check in normalizeTools.
    // If the file path is invalid, it will log a file resolution error.
    // If the file path is valid, it will be added to filePackageEntries and then
    // the Node version check will log the warning.
    // Since './module.js' is likely invalid in the test environment, we expect
    // a file resolution error rather than the Node version warning.
    expect(MockLog.warn).toHaveBeenCalled();
    // The warning should be either the Node version check or a file resolution error
    const warnCalls = MockLog.warn.mock.calls.flat();
    const hasExpectedWarning = warnCalls.some((msg: unknown) =>
      typeof msg === 'string' && (
        msg.includes('External tool plugins require Node >= 22') ||
        msg.includes('Failed to resolve file path')
      ));

    expect(hasExpectedWarning).toBe(true);
    expect(MockSpawn).not.toHaveBeenCalled();
  });

  it('should spawn tools host and return built-in + proxy creators', async () => {
    MockGetOptions.mockReturnValue({
      toolModules: ['./test-module.js'],
      nodeVersion: 22,
      contextPath: '/test/path',
      contextUrl: 'file:///test/path',
      pluginHost: DEFAULT_OPTIONS.pluginHost,
      pluginIsolation: undefined
    } as any);

    const result = await composeTools(builtinTools);

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    // Verify result includes built-in tools plus proxy tools
    expect(result.length).toBeGreaterThanOrEqual(builtinTools.length);
    // Indirect evidence via non-empty result beyond built-ins is sufficient
  });

  it('should handle spawn errors gracefully', async () => {
    MockSpawn.mockImplementationOnce(() => {
      throw new Error('Spawn failed');
    });

    MockGetOptions.mockReturnValue({
      toolModules: ['./test-module.js'],
      nodeVersion: 22,
      contextPath: '/test/path',
      contextUrl: 'file:///test/path',
      pluginHost: DEFAULT_OPTIONS.pluginHost,
      pluginIsolation: undefined
    } as any);

    const result = await composeTools(builtinTools);

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(MockLog.warn.mock.calls).toMatchSnapshot('warn');
  });

  it('should handle IPC errors gracefully', async () => {
    MockAwaitIpc.mockRejectedValueOnce(new Error('IPC timeout'));

    MockGetOptions.mockReturnValue({
      toolModules: ['./test-module.js'],
      nodeVersion: 22,
      contextPath: '/test/path',
      contextUrl: 'file:///test/path',
      pluginHost: DEFAULT_OPTIONS.pluginHost,
      pluginIsolation: undefined
    } as any);

    const result = await composeTools(builtinTools);

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(MockLog.warn.mock.calls).toMatchSnapshot('warn');
  });

  it('should use strict isolation when pluginIsolation is strict', async () => {
    MockGetOptions.mockReturnValue({
      toolModules: ['./test-module.js'],
      nodeVersion: 22,
      contextPath: '/test/path',
      contextUrl: 'file:///test/path',
      pluginHost: DEFAULT_OPTIONS.pluginHost,
      pluginIsolation: 'strict'
    } as any);

    await composeTools(builtinTools);

    // Strict isolation should not throw; behavior verified by successful composition
    expect(true).toBe(true);
  });

  it('should send hello, load, and manifest requests', async () => {
    MockGetOptions.mockReturnValue({
      toolModules: ['./test-module.js'],
      nodeVersion: 22,
      contextPath: '/test/path',
      contextUrl: 'file:///test/path',
      pluginHost: DEFAULT_OPTIONS.pluginHost,
      pluginIsolation: undefined
    } as any);

    const result = await composeTools(builtinTools);

    // Successful composition implies IPC handshake succeeded
    // Verify result includes tools
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('should log warnings and errors from load', async () => {
    // Mock load:ack response with warnings and errors
    MockAwaitIpc.mockImplementation(async (child: any, matcher: any): Promise<IpcResponse> => {
      const testHello: IpcResponse = { t: 'hello:ack', id: 'mock-id' };
      const testLoad: IpcResponse = {
        t: 'load:ack',
        id: 'mock-id',
        warnings: ['Warning 1', 'Warning 2'],
        errors: ['Error 1']
      };
      const testManifest: IpcResponse = { t: 'manifest:result', id: 'mock-id', tools: [] };

      if (matcher(testHello)) {
        return testHello;
      }
      if (matcher(testLoad)) {
        return testLoad;
      }
      if (matcher(testManifest)) {
        return testManifest;
      }
      throw new Error('Unexpected matcher');
    });

    MockGetOptions.mockReturnValue({
      toolModules: ['./test-module.js'],
      nodeVersion: 22,
      contextPath: '/test/path',
      contextUrl: 'file:///test/path',
      pluginHost: DEFAULT_OPTIONS.pluginHost,
      pluginIsolation: undefined
    } as any);

    await composeTools(builtinTools);

    // Verify warnings and errors were logged
    expect(MockLog.warn.mock.calls).toMatchSnapshot('warn');
  });

  it('should clean up host on child exit', async () => {
    // Create a fresh mock child for this test to track calls
    const testMockChild = {
      ...mockChild,
      once: jest.fn()
    };

    // Override the spawn mock to return our test child for this test
    MockSpawn.mockReturnValueOnce(testMockChild as any);

    MockGetOptions.mockReturnValue({
      toolModules: ['./test-module.js'],
      nodeVersion: 22,
      contextPath: '/test/path',
      contextUrl: 'file:///test/path',
      pluginHost: DEFAULT_OPTIONS.pluginHost,
      pluginIsolation: undefined
    } as any);

    await composeTools(builtinTools);

    // Cleanup handlers registration is internal; ensure no exceptions occurred during composition
    expect(Array.isArray(MockSpawn.mock.calls)).toBe(true);
  });
});
*/

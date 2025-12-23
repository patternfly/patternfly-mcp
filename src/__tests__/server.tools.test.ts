import { resolve } from 'node:path';
import { spawn } from 'child_process';
import { log } from '../logger';
import {
  getBuiltInToolNames,
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

describe('getBuiltInToolNames', () => {
  const MockLog = jest.mocked(log);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return built-in tool name', () => {
    const toolName = 'loremIpsum';
    const creator = () => {};

    creator.toolName = toolName;

    expect(getBuiltInToolNames([creator] as any).has(toolName.toLowerCase())).toBe(true);
  });

  it('should log a warning when a tool name does not exist', () => {
    const creator = () => {};

    getBuiltInToolNames([creator] as any);

    expect(MockLog.warn.mock.calls).toMatchSnapshot('warning');
  });
});

describe('computeFsReadAllowlist', () => {
  it.each([
    {
      description: 'with no tool modules',
      options: {
        toolModules: [],
        contextUrl: 'file://',
        contextPath: '/'
      },
      expected: ['/']
    },
    {
      description: 'with tool modules',
      options: {
        toolModules: ['@scope/pkg', resolve(process.cwd(), 'package.json')],
        contextUrl: 'file://',
        contextPath: '/'
      },
      expected: ['/']
    },
    {
      description: 'with missing context path',
      options: {
        toolModules: ['@scope/pkg', resolve(process.cwd(), 'package.json')],
        contextUrl: 'file://',
        contextPath: undefined
      },
      expected: []
    }
  ])('should return a list of allowed paths, $description', ({ options, expected }) => {
    expect(computeFsReadAllowlist(options as any)).toEqual(expected);
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

    expect({
      warnings: MockLog.warn.mock.calls,
      errors: MockLog.error.mock.calls
    }).toMatchSnapshot();
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
  const MockLog = jest.mocked(log);
  const MockSend = jest.mocked(send);
  let mapGetSpy: jest.SpyInstance;
  let mapDeleteSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mapGetSpy = jest.spyOn(Map.prototype, 'get');
    mapDeleteSpy = jest.spyOn(Map.prototype, 'delete');
  });

  afterEach(() => {
    jest.useRealTimers();
    mapGetSpy.mockRestore();
    mapDeleteSpy.mockRestore();
  });

  it('should attempt graceful shutdown of child', async () => {
    const onceHandlers: Record<string, any> = {};
    const child = {
      kill: jest.fn(),
      killed: false,
      once: jest.fn((event: string, handler: any) => {
        onceHandlers[event] = handler;
      }),
      off: jest.fn(),
      stderr: {
        on: jest.fn(),
        off: jest.fn()
      }
    };
    const handle = { child, closeStderr: jest.fn() };
    const sessionId = 'test-session-id';

    mapGetSpy.mockReturnValue(handle);

    const promise = sendToolsHostShutdown({ pluginHost: { gracePeriodMs: 10 } } as any, { sessionId } as any);

    onceHandlers['disconnect']();

    await promise;

    expect(MockSend).toHaveBeenCalledTimes(1);
    expect(child.once).toHaveBeenCalledTimes(2);
    expect(child.off).toHaveBeenCalledWith('exit', onceHandlers['exit']);
    expect(child.off).toHaveBeenCalledWith('disconnect', onceHandlers['disconnect']);
    expect(handle.closeStderr).toHaveBeenCalledTimes(1);
    expect(mapDeleteSpy).toHaveBeenCalledWith(sessionId);

    jest.advanceTimersByTime(220);
    expect(child.kill).not.toHaveBeenCalled();
  });

  it('should attempt force shutdown of child', async () => {
    const child = {
      // eslint-disable-next-line func-names
      kill: jest.fn(function (this: any) {
        this.killed = true;

        return true;
      }),
      killed: false,
      once: jest.fn(),
      off: jest.fn(),
      stderr: {
        on: jest.fn(),
        off: jest.fn()
      }
    };
    const handle = { child, closeStderr: jest.fn() };
    const sessionId = 'test-session-id';

    mapGetSpy.mockReturnValue(handle);

    const promise = sendToolsHostShutdown({ pluginHost: { gracePeriodMs: 10 } } as any, { sessionId } as any);

    jest.advanceTimersByTime(20);
    await promise;

    jest.advanceTimersByTime(220);

    expect(MockSend).toHaveBeenCalledTimes(1);
    expect(child.once).toHaveBeenCalledTimes(2);
    expect(child.kill).toHaveBeenCalledTimes(1);
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    expect(child.killed).toBe(true);
    expect(child.off).toHaveBeenCalledTimes(2);
    expect(handle.closeStderr).toHaveBeenCalledTimes(1);
    expect(mapDeleteSpy).toHaveBeenCalledWith(sessionId);
  });

  it('should attempt force shutdown of child and fail', async () => {
    const child = {
      kill: jest.fn()
        .mockImplementationOnce(() => {
          throw new Error('Mock failed to kill child process');
        })
        // eslint-disable-next-line func-names
        .mockImplementationOnce(function (this: any) {
          this.killed = true;

          return true;
        }),
      killed: false,
      once: jest.fn(),
      off: jest.fn(),
      stderr: {
        on: jest.fn(),
        off: jest.fn()
      }
    };
    const handle = {
      child,
      closeStderr: jest.fn()
        .mockImplementationOnce(() => {
          throw new Error('Mock close failure 1');
        })
        .mockImplementationOnce(() => {})
    };
    const sessionId = 'test-session-id';

    MockSend.mockImplementationOnce(() => {
      throw new Error('Mock send failure');
    });

    mapGetSpy.mockReturnValue(handle);

    const promise = sendToolsHostShutdown({ pluginHost: { gracePeriodMs: 10 } } as any, { sessionId } as any);

    jest.advanceTimersByTime(10);
    await promise;

    jest.advanceTimersByTime(220);

    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    expect(child.killed).toBe(false);
    expect([...MockLog.error.mock.calls, ...MockLog.warn.mock.calls, ...MockLog.info.mock.calls]).toMatchSnapshot();
  });
});

describe('composeTools', () => {
  const MockSpawn = jest.mocked(spawn);
  const MockAwaitIpc = jest.mocked(awaitIpc);
  const MockLog = jest.mocked(log);

  // Mock default creators
  const loremIpsum = () => ['loremIpsum', { description: 'lorem ipsum', inputSchema: {} }, () => {}];
  const dolorSitAmet = () => ['dolorSitAmet', { description: 'dolor sit amet', inputSchema: {} }, () => {}];
  const consecteturAdipiscingElit = () => ['consecteturAdipiscingElit', { description: 'consectetur adipiscing elit', inputSchema: {} }, () => {}];

  loremIpsum.toolName = 'loremIpsum';
  dolorSitAmet.toolName = 'dolorSitAmet';
  consecteturAdipiscingElit.toolName = 'consecteturAdipiscingElit';

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();
  });

  afterAll(() => {
  });

  it.each([
    {
      description: 'default package creators',
      nodeVersion: 22,
      modules: [],
      expectedModuleCount: 3
    },
    {
      description: 'invalid creator',
      nodeVersion: 22,
      modules: [
        { name: 'dolor', error: 'Creator error message' }
      ],
      expectedModuleCount: 3
    },
    {
      description: 'inline creators',
      nodeVersion: 22,
      modules: [
        (() => {
          const testing = () => ['lorem', { description: 'lorem ipsum', inputSchema: { type: 'object', properties: {} } }, () => {}];

          (testing as any).toolName = 'lorem';

          return testing;
        })(),
        { name: 'dolor', description: 'sit amet', inputSchema: {}, handler: () => {} }
      ],
      expectedModuleCount: 5
    },
    {
      description: 'inline creators, missing toolNames',
      nodeVersion: 22,
      modules: [
        () => ['lorem', { description: 'lorem ipsum', inputSchema: { type: 'object', properties: {} } }, () => {}],
        () => ['dolor', { description: 'sit amet', inputSchema: { type: 'object', properties: {} } }, () => {}]
      ],
      expectedModuleCount: 3
    },
    {
      description: 'inline duplicate creators',
      nodeVersion: 22,
      modules: [
        (() => {
          const testing = () => ['lorem', { description: 'lorem ipsum', inputSchema: { type: 'object', properties: {} } }, () => {}];

          (testing as any).toolName = 'lorem';

          return testing;
        })(),
        { name: 'dolor', description: 'sit amet', inputSchema: {}, handler: () => {} },
        { name: 'dolor', description: 'sit amet', inputSchema: {}, handler: () => {} }
      ],
      expectedModuleCount: 5
    },
    {
      description: 'file package creators',
      nodeVersion: 22,
      modules: ['file:///test/module.js', '@patternfly/tools'],
      expectedModuleCount: 5
    },
    {
      description: 'file package duplicate creators',
      nodeVersion: 22,
      modules: ['file:///test/module.js', '@patternfly/tools', '@patternfly/tools'],
      expectedModuleCount: 5
    },
    {
      description: 'file package creators, Node.js 20',
      nodeVersion: 20,
      modules: ['file:///test/module.js', '@patternfly/tools'],
      expectedModuleCount: 3
    },
    {
      description: 'file package creators, Node.js 24',
      nodeVersion: 24,
      modules: ['file:///test/module.js', '@patternfly/tools'],
      expectedModuleCount: 5
    },
    {
      description: 'file package creators, Node.js undefined',
      nodeVersion: undefined,
      modules: ['file:///test/module.js', '@patternfly/tools'],
      expectedModuleCount: 3
    },
    {
      description: 'inline and file package creators',
      nodeVersion: 22,
      modules: [
        (() => {
          const testing = () => ['lorem', { description: 'lorem ipsum', inputSchema: { type: 'object', properties: {} } }, () => {}];

          (testing as any).toolName = 'lorem';

          return testing;
        })(),
        { name: 'dolor', description: 'sit amet', inputSchema: {}, handler: () => {} },
        'file:///test/module.js',
        '@patternfly/tools'
      ],
      expectedModuleCount: 7
    },
    {
      description: 'inline and file package creators duplicate builtin creators',
      nodeVersion: 22,
      modules: [
        ['loremIpsum', { description: 'lorem ipsum', inputSchema: {} }, () => {}],
        'dolorSitAmet'
      ],
      expectedModuleCount: 3
    },
    {
      description: 'inline and file package creators, duplicates',
      nodeVersion: 22,
      modules: [
        { name: '@patternfly/tools', description: 'lorem ipsum', inputSchema: {}, handler: () => {} },
        { name: 'dolor', description: 'sit amet', inputSchema: {}, handler: () => {} },
        'file:///test/module.js',
        '@patternfly/tools',
        'DOLOR   '
      ],
      expectedModuleCount: 6
    },
    {
      description: 'inline and file package creators, duplicates, Node.js 20',
      nodeVersion: 20,
      modules: [
        { name: '@patternfly/tools', description: 'lorem ipsum', inputSchema: {}, handler: () => {} },
        { name: 'dolor', description: 'sit amet', inputSchema: {}, handler: () => {} },
        'file:///test/module.js',
        '@patternfly/tools',
        'DOLOR   '
      ],
      expectedModuleCount: 5
    }
  ])('should attempt to setup creators, $description', async ({ modules, nodeVersion, expectedModuleCount }) => {
    const mockChild = {
      pid: 123,
      once: jest.fn(),
      off: jest.fn()
    };
    const filePackageToolModules: any[] = modules;
    const mockFilePackageTools = filePackageToolModules.filter(tool => typeof tool === 'string')
      .map(name => ({ name, description: name, inputSchema: {}, source: name }));

    const sessionId = 'test-session-id';

    MockSpawn.mockReturnValueOnce(mockChild as any);

    MockAwaitIpc
      .mockResolvedValueOnce({ t: 'hello:ack', id: 'id-1' } as any)
      .mockResolvedValueOnce({ t: 'load:ack', id: 'id-1', warnings: [], errors: [] } as any)
      .mockResolvedValueOnce({ t: 'manifest:result', id: 'id-1', tools: mockFilePackageTools } as any);

    const defaultCreators: any[] = [loremIpsum, dolorSitAmet, consecteturAdipiscingElit];
    const globalOptions: any = { toolModules: filePackageToolModules, nodeVersion, contextUrl: 'file:///test/path', contextPath: '/test/path' };
    const sessionOptions: any = { sessionId };
    const tools = await composeTools(defaultCreators, globalOptions, sessionOptions);

    expect(tools.length).toBe(expectedModuleCount);
    expect({
      toolsCount: tools.length,
      log: MockLog.warn.mock.calls
    }).toMatchSnapshot();
  });

  it('should attempt to setup handlers for child exit, disconnect', async () => {
    const onceHandlers: Record<string, any> = {};
    const mockChild = {
      pid: 123,
      once: jest.fn((event: string, handler: any) => {
        onceHandlers[event] = handler;
      }),
      off: jest.fn(),
      stderr: {
        on: jest.fn(),
        off: jest.fn()
      }
    };
    const filePackageToolModules: any[] = ['file:///test/module.js', '@patternfly/woot'];
    const mockFilePackageTools = filePackageToolModules.map(tool => ({ name: tool, description: tool, inputSchema: {}, source: tool }));
    const sessionId = 'test-session-id';

    MockSpawn.mockReturnValueOnce(mockChild as any);

    MockAwaitIpc
      .mockResolvedValueOnce({ t: 'hello:ack', id: 'id-1' } as any)
      .mockResolvedValueOnce({ t: 'load:ack', id: 'id-1', warnings: [], errors: [] } as any)
      .mockResolvedValueOnce({ t: 'manifest:result', id: 'id-1', tools: mockFilePackageTools } as any);

    const defaultCreators: any[] = [loremIpsum, dolorSitAmet, consecteturAdipiscingElit];
    const globalOptions: any = { toolModules: filePackageToolModules, nodeVersion: 22, contextUrl: 'file:///test/path', contextPath: '/test/path' };
    const sessionOptions: any = { sessionId };

    await composeTools(defaultCreators, globalOptions, sessionOptions);

    onceHandlers['disconnect']();

    expect(mockChild.once).toHaveBeenCalledTimes(2);
    expect(mockChild.stderr.on).toHaveBeenCalledWith('data', expect.any(Function));
    expect(mockChild.stderr.off).toHaveBeenCalledWith('data', expect.any(Function));
    expect(mockChild.off).toHaveBeenCalledWith('exit', onceHandlers['exit']);
    expect(mockChild.off).toHaveBeenCalledWith('disconnect', onceHandlers['disconnect']);
  });

  it('should return default creators on tools host error', async () => {
    const filePackageToolModules: any[] = ['@patternfly/tools'];

    const sessionId = 'test-session-id';

    MockSpawn.mockImplementationOnce(() => {
      throw new Error('Mock spawn failure');
    });

    const defaultCreators: any[] = [loremIpsum, dolorSitAmet, consecteturAdipiscingElit];
    const globalOptions: any = { toolModules: filePackageToolModules, nodeVersion: 22, contextUrl: 'file:///test/path', contextPath: '/test/path' };
    const sessionOptions: any = { sessionId };
    const tools = await composeTools(defaultCreators, globalOptions, sessionOptions);

    expect(tools.length).toBe(defaultCreators.length);
    expect({
      toolsCount: tools.length,
      log: MockLog.warn.mock.calls
    }).toMatchSnapshot();
  });
});

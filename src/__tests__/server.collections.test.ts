import {
  composeCollections,
  computeFsReadAllowlist,
  debugChild,
  getBuiltInCollectionNames,
  logWarningsErrors,
  makeProxyCreators,
  secureBuiltinCreators,
  sendCollectionsHostShutdown,
  spawnCollectionHost
} from '../server.collections';
import { log } from '../logger';
import { getOptions, getSessionOptions } from '../options.context';
import { spawnChildProcess, shutdownChildProcess, activeChildrenBySession } from '../server.process';

jest.mock('../server.process', () => ({
  spawnChildProcess: jest.fn(),
  shutdownChildProcess: jest.fn().mockResolvedValue(undefined),
  activeChildrenBySession: new Map()
}));

jest.mock('../options.context', () => ({
  getOptions: jest.fn(() => ({})),
  getSessionOptions: jest.fn(() => ({ sessionId: 'test' })),
  getLoggerOptions: jest.fn(() => ({}))
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

describe('getBuiltInCollectionNames', () => {
  const MockLog = jest.mocked(log);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return built-in collection name', () => {
    const collectionName = 'loremIpsum';
    const creator = () => {};

    creator.collectionName = collectionName;

    expect(getBuiltInCollectionNames([creator] as any).has(collectionName.toLowerCase())).toBe(true);
  });

  it('should log a warning when a collection name does not exist', () => {
    const creator = () => {};

    getBuiltInCollectionNames([creator] as any);

    expect(MockLog.warn.mock.calls).toMatchSnapshot('warning');
  });
});

describe('secureBuiltinCreators', () => {
  it('should wrap builtin creators and set _isInternal: true', () => {
    const mockHandler = jest.fn();
    const mockCreator: any = jest.fn(() => ['test-collection', mockHandler, { isRequired: true }]);

    mockCreator.collectionName = 'test-collection';

    const [secured]: any[] = secureBuiltinCreators([mockCreator]);
    const [name, callback, config] = secured({});

    expect(name).toBe('test-collection');
    expect(config?._isInternal).toBe(true);
    expect(config?.isRequired).toBe(true);
    expect(callback).toBe(mockHandler);
    expect(getBuiltInCollectionNames([secured] as any).has('test-collection')).toBe(true);
  });
});

describe('computeFsReadAllowlist', () => {
  it.each([
    {
      description: 'with contextPath',
      options: {
        contextPath: '/'
      },
      expected: ['/']
    },
    {
      description: 'with missing context path',
      options: {
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

describe('debugChild', () => {
  let debugSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    debugSpy = jest.spyOn(log, 'debug').mockImplementation(() => {});
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
  ])('should format and forward lines to log.debug, $description', async ({ message }) => {
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
      debug: debugSpy.mock.calls
    }).toMatchSnapshot();

    unsubscribe();
    expect(mockOff).toHaveBeenCalledWith('data', mockHandler);
  });
});

describe('spawnCollectionHost', () => {
  const MockSpawnChildProcess = jest.mocked(spawnChildProcess);

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
  ])('attempt to spawn the Collections Host, $description', async ({ options }) => {
    const updatedOptions = { collectionModules: [], pluginHost: { loadTimeoutMs: 10, invokeTimeoutMs: 10 }, ...options };
    const mockPid = 123;
    const mockCollections = [{ name: 'alphaCollection', id: 'alphaCollection' }];
    const mockRequest = jest.fn()
      .mockResolvedValueOnce({ t: 'hello:ack', id: 'id-1' })
      .mockResolvedValueOnce({ t: 'load:ack', id: 'id-1', warnings: [], errors: [] })
      .mockResolvedValueOnce({ t: 'manifest:result', id: 'id-1', collections: mockCollections });

    MockSpawnChildProcess.mockReturnValue({
      child: { pid: mockPid } as any,
      request: mockRequest,
      closeStderr: jest.fn()
    } as any);

    jest.mocked(getOptions).mockReturnValue(updatedOptions as any);

    const result = await spawnCollectionHost(updatedOptions as any);

    expect(result.child.pid).toBe(mockPid);
    expect(result.collections).toEqual(mockCollections);
    expect(mockRequest).toHaveBeenCalledTimes(3);

    expect({
      spawnConfig: MockSpawnChildProcess.mock.calls?.[0]?.[0]
    }).toMatchSnapshot('spawn');
  });

  it('should throw when spawn fails', async () => {
    jest.mocked(getOptions).mockReturnValue({ collectionModules: [], pluginHost: {} } as any);
    MockSpawnChildProcess.mockImplementationOnce(() => {
      throw new Error('Failed to resolve Collections Host entry \'#collectionsHost\'.');
    });

    await expect(
      spawnCollectionHost({ nodeVersion: 24, pluginIsolation: 'strict', pluginHost: {} } as any)
    ).rejects.toThrow(/Failed to resolve Collections Host/);
  });
});

describe('makeProxyCreators', () => {
  const MockLog = jest.mocked(log);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    {
      description: 'no collections',
      collections: []
    },
    {
      description: 'single collection',
      collections: [
        {
          id: 'loremIpsum',
          name: 'Lorem Ipsum'
        }
      ]
    },
    {
      description: 'multiple collections',
      collections: [
        {
          id: 'loremIpsum',
          name: 'Lorem Ipsum'
        },
        {
          id: 'dolorSit',
          name: 'Dolor Sit'
        }
      ]
    }
  ])('should attempt to return proxy creators, a function wrapper per collection, $description', ({ collections }) => {
    const proxies = makeProxyCreators({ collections } as any, { pluginHost: { invokeTimeoutMs: 10 } } as any);
    const output = proxies.map(proxy => {
      const [name, handler] = proxy();

      return [
        name,
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
    const collections = [
      {
        id: 'loremIpsum',
        name: 'Lorem Ipsum'
      }
    ];

    const mockRequest = jest.fn().mockResolvedValueOnce({ t: 'invoke:result', ...response });
    const mockHandle = { collections, request: mockRequest, child: { pid: 123 } };

    const proxies = makeProxyCreators(mockHandle as any, { pluginHost: { invokeTimeoutMs: 10 } } as any);
    const proxyCreator = proxies[0];

    expect(proxyCreator).toBeDefined();

    const [, handler] = proxyCreator!();

    await expect(handler({ loremIpsum: 7 })).rejects.toMatchSnapshot('handler');
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(mockRequest.mock.calls).toMatchSnapshot('request');
  });
});

describe('sendCollectionsHostShutdown', () => {
  const MockShutdownChildProcess = jest.mocked(shutdownChildProcess);

  beforeEach(() => {
    jest.clearAllMocks();
    activeChildrenBySession.clear();
  });

  it('should attempt graceful shutdown of child', async () => {
    const child = { pid: 123 };
    const handle = { child, closeStderr: jest.fn() };
    const sessionId = 'test-session-id';
    const registryKey = `${sessionId}:collections`;

    activeChildrenBySession.set(registryKey, handle as any);

    await sendCollectionsHostShutdown({ pluginHost: { gracePeriodMs: 10 } } as any, { sessionId } as any);

    expect(MockShutdownChildProcess).toHaveBeenCalledTimes(1);
    expect(MockShutdownChildProcess).toHaveBeenCalledWith(handle, {
      gracePeriodMs: 10,
      sessionId: registryKey,
      label: 'Collections Host'
    });
  });
});

describe('composeCollections', () => {
  const MockSpawnChildProcess = jest.mocked(spawnChildProcess);
  const MockLog = jest.mocked(log);
  const MockGetOptions = jest.mocked(getOptions);
  const MockGetSessionOptions = jest.mocked(getSessionOptions);

  // Mock default creators
  const loremIpsum = () => ['loremIpsum', () => {}, { isRequired: true }];
  const dolorSitAmet = () => ['dolorSitAmet', () => {}, { isRequired: false }];
  const consecteturAdipiscingElit: any = () => ['consecteturAdipiscingElit', () => {}, { runInChildProcess: true }];

  loremIpsum.collectionName = 'loremIpsum';
  dolorSitAmet.collectionName = 'dolorSitAmet';
  consecteturAdipiscingElit.collectionName = 'consecteturAdipiscingElit';

  beforeEach(() => {
    jest.clearAllMocks();
    activeChildrenBySession.clear();
    MockGetOptions.mockReturnValue({ collectionModules: [], pluginHost: { loadTimeoutMs: 10, invokeTimeoutMs: 10 } } as any);
    MockGetSessionOptions.mockReturnValue({ sessionId: 'test-session-id' } as any);
  });

  it('should wrap builtin creators and set _isInternal: true', async () => {
    const mockHandler = jest.fn();
    const mockCreator: any = jest.fn(() => ['test-collection', mockHandler, { isRequired: true }]);

    const builtinCreators = [mockCreator];
    const result: any = await composeCollections(builtinCreators);

    expect(result.length).toBe(1);

    const [name, callback, config] = result[0]({});

    expect(name).toBe('test-collection');
    expect(config?._isInternal).toBe(true);
    expect(config?.isRequired).toBe(true);
    expect(callback).toBe(mockHandler);
  });

  it('should return an empty array when no creators are provided', async () => {
    const result = await composeCollections([]);

    expect(result).toEqual([]);
  });

  it.each([
    {
      description: 'with custom options',
      options: { some: 'option' },
      session: { sessionId: '123' }
    }
  ])('should handle various configurations, $description', async ({ options, session }) => {
    MockGetOptions.mockReturnValue(options as any);
    MockGetSessionOptions.mockReturnValue(session as any);

    const mockCreator: any = jest.fn(() => ['test', jest.fn()]);
    const result: any = await composeCollections([mockCreator], options as any, session as any);

    expect(result.length).toBe(1);
    expect(result[0]()).toContain('test');
  });

  it('should match snapshot for composed collection creators', async () => {
    const mockCreator: any = jest.fn(() => ['snap-collection', jest.fn(), { isRequired: false }]);
    const result: any = await composeCollections([mockCreator]);

    const output = result.map((collection: any) => {
      const [name, , config] = collection();

      return { name, config };
    });

    expect(output).toMatchSnapshot();
  });

  it.each([
    {
      description: 'default package creators',
      nodeVersion: 22,
      modules: [],
      expectedModuleCount: 2
    },
    {
      description: 'inline creators',
      nodeVersion: 22,
      modules: [
        ['lorem', () => {}]
      ],
      expectedModuleCount: 3
    },
    {
      description: 'inline and duplicate creators',
      nodeVersion: 22,
      modules: [
        ['lorem', () => {}],
        ['lorem', () => {}]
      ],
      expectedModuleCount: 3
    },
    {
      description: 'inline and case-variant duplicate creators',
      nodeVersion: 22,
      modules: [
        ['lorem', () => {}],
        ['LOREM', () => {}]
      ],
      expectedModuleCount: 3
    }
  ])('should attempt to setup creators, $description', async ({ modules, nodeVersion, expectedModuleCount }) => {
    const mockChild = {
      pid: 123,
      once: jest.fn(),
      off: jest.fn()
    };
    const mockHostedCollections = modules.map(([name]) => ({ name, id: name }));

    const sessionId = 'test-session-id';

    const mockRequest = jest.fn()
      .mockResolvedValueOnce({ t: 'hello:ack', id: 'id-1' })
      .mockResolvedValueOnce({ t: 'load:ack', id: 'id-1', warnings: [], errors: [] })
      .mockResolvedValueOnce({ t: 'manifest:result', id: 'id-1', collections: mockHostedCollections });

    MockSpawnChildProcess.mockReturnValue({
      child: mockChild as any,
      request: mockRequest,
      closeStderr: jest.fn()
    } as any);

    const defaultCreators: any[] = [loremIpsum, dolorSitAmet, consecteturAdipiscingElit];
    const globalOptions: any = { collectionModules: modules, nodeVersion, contextUrl: 'file:///test/path', contextPath: '/test/path' };
    const sessionOptions: any = { sessionId };

    MockGetOptions.mockReturnValue(globalOptions);

    const collections = await composeCollections(defaultCreators, globalOptions, sessionOptions);

    expect(collections.length).toBe(expectedModuleCount);
    expect({
      collectionsCount: collections.length,
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
      off: jest.fn()
    };
    const sessionId = 'test-session-id';

    const mockRequest = jest.fn()
      .mockResolvedValueOnce({ t: 'hello:ack', id: 'id-1' })
      .mockResolvedValueOnce({ t: 'load:ack', id: 'id-1', warnings: [], errors: [] })
      .mockResolvedValueOnce({ t: 'manifest:result', id: 'id-1', collections: [] });

    MockSpawnChildProcess.mockReturnValue({
      child: mockChild as any,
      request: mockRequest,
      closeStderr: jest.fn()
    } as any);

    const defaultCreators: any[] = [loremIpsum, dolorSitAmet, consecteturAdipiscingElit];
    const globalOptions: any = { collectionModules: [], nodeVersion: 22, contextUrl: 'file:///test/path', contextPath: '/test/path' };
    const sessionOptions: any = { sessionId };

    MockGetOptions.mockReturnValue(globalOptions);

    await composeCollections(defaultCreators, globalOptions, sessionOptions);

    if (onceHandlers['disconnect']) {
      onceHandlers['disconnect']();
    }

    expect(mockChild.once).toHaveBeenCalledTimes(2);
    expect(mockChild.off).toHaveBeenCalledWith('exit', onceHandlers['exit']);
    expect(mockChild.off).toHaveBeenCalledWith('disconnect', onceHandlers['disconnect']);
  });

  it('should return default creators on collections host error', async () => {
    const sessionId = 'test-session-id';

    MockSpawnChildProcess.mockImplementationOnce(() => {
      throw new Error('Mock spawn failure');
    });

    const defaultCreators: any[] = [loremIpsum, dolorSitAmet, consecteturAdipiscingElit];
    const globalOptions: any = { collectionModules: [], nodeVersion: 22, contextUrl: 'file:///test/path', contextPath: '/test/path' };
    const sessionOptions: any = { sessionId };
    const collections = await composeCollections(defaultCreators, globalOptions, sessionOptions);

    expect(collections.length).toBe(2);
    expect({
      collectionsCount: collections.length,
      log: MockLog.warn.mock.calls
    }).toMatchSnapshot();
  });
});

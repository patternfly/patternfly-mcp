import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { runServer, registerServerTools, registerServerResources } from '../server';
import { log } from '../logger';
import { startHttpTransport, type HttpServerHandle } from '../server.http';
import { DEFAULT_OPTIONS } from '../options.defaults';
import * as mcpSdk from '../mcpSdk';

// Mock dependencies
jest.mock('@modelcontextprotocol/sdk/server/mcp.js', () => {
  const actual = jest.requireActual('@modelcontextprotocol/sdk/server/mcp.js');

  return {
    ...actual,
    McpServer: jest.fn()
  };
});
jest.mock('@modelcontextprotocol/sdk/server/stdio.js');
jest.mock('../logger');
jest.mock('../server.logger', () => ({
  createServerLogger: {
    memo: jest.fn().mockImplementation(() => {})
  }
}));
jest.mock('../server.http');

const MockMcpServer = McpServer as jest.MockedClass<typeof McpServer>;
const MockStdioServerTransport = StdioServerTransport as jest.MockedClass<typeof StdioServerTransport>;
const MockStartHttpTransport = startHttpTransport as jest.MockedFunction<typeof startHttpTransport>;
const MockLog = log as jest.MockedObject<typeof log>;

describe('runServer', () => {
  let mockServer: any;
  let mockTransport: any;
  let mockHttpHandle: HttpServerHandle;
  let mockClose: jest.Mock;
  let processOnSpy: jest.SpyInstance;
  let processOffSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock server instance
    mockServer = {
      registerTool: jest.fn(),
      registerResource: jest.fn(),
      connect: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined)
    };

    // Mock transport instance
    mockTransport = {};

    MockMcpServer.mockImplementation(() => mockServer);
    MockStdioServerTransport.mockImplementation(() => mockTransport);

    // Mock HTTP transport
    mockClose = jest.fn().mockResolvedValue(undefined);
    mockHttpHandle = {
      port: 0,
      close: mockClose
    };

    MockStartHttpTransport.mockResolvedValue(mockHttpHandle);

    // Spy on process methods
    processOnSpy = jest.spyOn(process, 'on').mockImplementation();
    processOffSpy = jest.spyOn(process, 'off');

    // Mock process.exit to prevent Jest from exiting
    jest.spyOn(process, 'exit').mockImplementation((() => {}) as never);
  });

  afterEach(() => {
    processOnSpy.mockRestore();
    processOffSpy.mockRestore();
    // Note: We don't call jest.restoreAllMocks() here as it would clear module mocks
    // The memoization cache persists across tests, which is expected behavior
  });

  it.each([
    {
      description: 'use default tools, stdio',
      options: { name: 'test-server-1', version: '1.0.0' },
      tools: undefined,
      transportMethod: MockStdioServerTransport
    },
    {
      description: 'use default tools, http',
      options: { name: 'test-server-2', version: '1.0.0', isHttp: true },
      tools: undefined,
      transportMethod: MockStartHttpTransport
    },
    {
      description: 'use custom options',
      options: {
        name: 'test-server-3',
        version: '1.0.0'
        // logging: { protocol: false }
      },
      tools: [],
      transportMethod: MockStdioServerTransport
    },
    {
      description: 'create transport, connect, and log success message',
      options: { name: 'test-server-4', version: '1.0.0' },
      tools: [],
      transportMethod: MockStdioServerTransport
    },
    {
      description: 'register a tool',
      options: { name: 'test-server-5', version: '1.0.0' },
      tools: [
        jest.fn().mockReturnValue([
          'loremIpsum',
          { description: 'Lorem Ipsum', inputSchema: z.object({}) },
          jest.fn()
        ])
      ],
      transportMethod: MockStdioServerTransport
    },
    {
      description: 'register multiple tools',
      options: { name: 'test-server-6', version: '1.0.0' },
      tools: [
        jest.fn().mockReturnValue([
          'loremIpsum',
          { description: 'Lorem Ipsum', inputSchema: z.object({}) },
          jest.fn()
        ]),
        jest.fn().mockReturnValue([
          'dolorSit',
          { description: 'Dolor Sit', inputSchema: z.object({}) },
          jest.fn()
        ])
      ],
      transportMethod: MockStdioServerTransport
    },
    {
      description: 'disable SIGINT handler',
      options: { name: 'test-server-7', version: '1.0.0' },
      tools: [],
      enableSigint: false,
      transportMethod: MockStdioServerTransport
    },
    {
      description: 'enable SIGINT handler explicitly',
      options: { name: 'test-server-8', version: '1.0.0' },
      tools: [],
      enableSigint: true,
      transportMethod: MockStdioServerTransport
    }
  ])('should attempt to run server, $description', async ({ options, tools, enableSigint, transportMethod }) => {
    const settings = {
      ...tools && { tools },
      ...enableSigint !== undefined && { enableSigint },
      allowProcessExit: false // Prevent process.exit in tests
    };

    const serverInstance = await runServer(
      {
        minMax: DEFAULT_OPTIONS.minMax,
        patternflyOptions: DEFAULT_OPTIONS.patternflyOptions,
        serverInstanceOptions: DEFAULT_OPTIONS.serverInstanceOptions,
        ...options
      } as any,
      Object.keys(settings).length > 0 ? settings : { allowProcessExit: false }
    );

    expect(transportMethod).toHaveBeenCalled();
    expect(serverInstance.isRunning()).toBe(true);
    expect({
      events: [...MockLog.info.mock.calls, ...MockLog.warn.mock.calls],
      hasDebugLogs: MockLog.debug.mock.calls.length > 0,
      registerTool: mockServer.registerTool.mock.calls?.map((call: any) => call?.[0] || []),
      mcpServer: MockMcpServer.mock.calls,
      process: processOnSpy.mock.calls
    }).toMatchSnapshot('diagnostics');

    // Clean up: stop the server to prevent cache pollution
    await serverInstance.stop();
  });

  it('should skip registration of internal tools with non-Zod schemas', async () => {
    const tools = [
      jest.fn().mockReturnValue([
        'badTool',
        { description: 'Bad Tool', inputSchema: {} },
        jest.fn()
      ])
    ];

    const serverInstance = await runServer(
      { ...DEFAULT_OPTIONS, name: 'test-skip-server' } as any,
      { tools, allowProcessExit: false }
    );

    expect(mockServer.registerTool).not.toHaveBeenCalledWith(
      expect.stringContaining('badTool')
    );

    expect(MockLog.warn).toHaveBeenCalledWith(
      expect.stringContaining('has a non Zod inputSchema. Skipping registration.')
    );

    await serverInstance.stop();
  });

  it.each([
    {
      description: 'stdio stop server',
      options: undefined
    },
    {
      description: 'http stop server',
      options: { isHttp: true }
    }
  ])('should allow server to be stopped, $description', async ({ options }) => {
    const serverInstance = await runServer(
      {
        minMax: DEFAULT_OPTIONS.minMax,
        patternflyOptions: DEFAULT_OPTIONS.patternflyOptions,
        // Check serverInstanceOptions behavior, don't include it
        ...options,
        name: 'test-server'
      } as any,
      { allowProcessExit: false }
    );

    expect(serverInstance.isRunning()).toBe(true);

    await serverInstance.stop();

    expect(processOffSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
    expect(serverInstance.isRunning()).toBe(false);
    expect({
      events: MockLog.info.mock.calls
    }).toMatchSnapshot('diagnostics');
  });

  it('should handle errors during server creation', async () => {
    const error = new Error('Server creation failed');

    MockMcpServer.mockImplementation(() => {
      throw error;
    });

    await expect(runServer(undefined, { tools: [] })).rejects.toThrowErrorMatchingSnapshot('Server creation failed');
  });

  it('should handle errors during connection', async () => {
    const error = new Error('Connection failed');

    mockServer.connect.mockRejectedValue(error);

    await expect(runServer(undefined, { tools: [] })).rejects.toThrowErrorMatchingSnapshot('Connection failed');
  });
});

describe('registerServerTools', () => {
  let mockServer: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockServer = {
      registerTool: jest.fn()
    };
  });

  it('should register and execute a tool successfully', async () => {
    const mockCallback = jest.fn().mockResolvedValue({ content: [{ type: 'text', text: 'result' }] });
    const toolCreator = () => [
      'testTool',
      { description: 'A test tool', inputSchema: z.object({ key: z.string() }) },
      mockCallback
    ];

    await registerServerTools([toolCreator as any], mockServer, DEFAULT_OPTIONS, {} as any);

    // 1. Verify Registration
    expect(mockServer.registerTool).toHaveBeenCalledWith(
      'testTool',
      expect.objectContaining({ description: 'A test tool' }),
      expect.any(Function)
    );

    // 2. Verify Execution
    const response = mockServer.registerTool.mock.calls[0];
    const [_name, _schema, handler] = response || [];

    expect(handler).toBeDefined();

    const args = { key: 'value' };
    const result = await handler(args);

    expect(mockCallback).toHaveBeenCalledWith(args);
    expect(result).toEqual({ content: [{ type: 'text', text: 'result' }] });
  });

  it.each([
    {
      description: 'non-Zod schema',
      tool: () => ['badTool', { description: 'Bad', inputSchema: {} }, jest.fn()]
    },
    {
      description: 'undefined schema',
      tool: () => ['noSchemaTool', { description: 'No Schema' } as any, jest.fn()]
    }
  ])('should skip registration for $description', async ({ tool }) => {
    await registerServerTools([tool as any], mockServer, DEFAULT_OPTIONS, {} as any);

    expect(mockServer.registerTool).not.toHaveBeenCalled();
    expect(MockLog.warn).toHaveBeenCalledWith(expect.stringContaining('has a non Zod inputSchema. Skipping registration.'));
  });

  it('should handle errors during tool registration', async () => {
    const toolCreator = () => [
      'failTool',
      { description: 'Fail', inputSchema: z.object({}) },
      jest.fn()
    ];

    mockServer.registerTool.mockImplementation(() => {
      throw new Error('Registration failed');
    });

    await registerServerTools([toolCreator as any], mockServer);

    expect(MockLog.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to register tool "failTool":'),
      expect.any(Error)
    );
  });
});

describe('registerServerResources', () => {
  let mockServer: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockServer = {
      registerResource: jest.fn()
    };
  });

  it('should register and execute a resource successfully', async () => {
    const mockRegisterResource = jest.spyOn(mcpSdk, 'registerResource');
    const mockCallback = jest.fn().mockResolvedValue({ contents: [{ uri: 'test://uri', text: 'content' }] });
    const resourceCreator = () => [
      'testResource',
      'test://uri',
      { mimeType: 'text/plain' },
      mockCallback
    ];

    await registerServerResources([resourceCreator as any], mockServer, DEFAULT_OPTIONS, {} as any);

    // Verify Registration
    expect(mockRegisterResource).toHaveBeenCalledWith(
      mockServer,
      'testResource',
      'test://uri',
      expect.objectContaining({ mimeType: 'text/plain' }),
      expect.any(Function),
      undefined
    );

    // Verify Execution
    const response = mockRegisterResource.mock.calls[0];
    const [_server, _name, _uri, _config, handler] = response || [];

    expect(handler).toBeDefined();

    const result = await handler?.('arg1');

    expect(mockCallback).toHaveBeenCalledWith('arg1');
    expect(result).toEqual({ contents: [{ uri: 'test://uri', text: 'content' }] });
  });
});

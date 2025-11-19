import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { runServer } from '../server';
import { getOptions } from '../options.context';
import { startHttpTransport, type HttpServerHandle } from '../server.http';

// Mock dependencies
jest.mock('@modelcontextprotocol/sdk/server/mcp.js');
jest.mock('@modelcontextprotocol/sdk/server/stdio.js');
jest.mock('../server.http');

const MockMcpServer = McpServer as jest.MockedClass<typeof McpServer>;
const MockStdioServerTransport = StdioServerTransport as jest.MockedClass<typeof StdioServerTransport>;
const MockStartHttpTransport = startHttpTransport as jest.MockedFunction<typeof startHttpTransport>;

describe('runServer', () => {
  let mockServer: any;
  let mockTransport: any;
  let mockHttpHandle: HttpServerHandle;
  let mockClose: jest.Mock;
  let consoleInfoSpy: jest.SpyInstance;
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let processOnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock server instance
    mockServer = {
      registerTool: jest.fn(),
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
      close: mockClose
    };

    MockStartHttpTransport.mockResolvedValue(mockHttpHandle);

    // Spy on console methods
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    // Spy on process.on method
    processOnSpy = jest.spyOn(process, 'on').mockImplementation();
  });

  afterEach(() => {
    consoleInfoSpy.mockRestore();
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processOnSpy.mockRestore();
  });

  it.each([
    {
      description: 'use default tools, stdio',
      options: undefined,
      tools: undefined,
      transportMethod: MockStdioServerTransport
    },
    {
      description: 'use default tools, http',
      options: { http: true },
      tools: undefined,
      transportMethod: MockStartHttpTransport
    },
    {
      description: 'use custom options',
      options: {
        name: 'test-server',
        version: '1.0.0'
      },
      tools: [],
      transportMethod: MockStdioServerTransport
    },
    {
      description: 'create transport, connect, and log success message',
      options: undefined,
      tools: [],
      transportMethod: MockStdioServerTransport
    },
    {
      description: 'register a tool',
      options: undefined,
      tools: [
        jest.fn().mockReturnValue([
          'loremIpsum',
          { description: 'Lorem Ipsum', inputSchema: {} },
          jest.fn()
        ])
      ],
      transportMethod: MockStdioServerTransport
    },
    {
      description: 'register multiple tools',
      options: undefined,
      tools: [
        jest.fn().mockReturnValue([
          'loremIpsum',
          { description: 'Lorem Ipsum', inputSchema: {} },
          jest.fn()
        ]),
        jest.fn().mockReturnValue([
          'dolorSit',
          { description: 'Dolor Sit', inputSchema: {} },
          jest.fn()
        ])
      ],
      transportMethod: MockStdioServerTransport
    },
    {
      description: 'disable SIGINT handler',
      options: undefined,
      tools: [],
      enableSigint: false,
      transportMethod: MockStdioServerTransport
    },
    {
      description: 'enable SIGINT handler explicitly',
      options: undefined,
      tools: [],
      enableSigint: true,
      transportMethod: MockStdioServerTransport
    }
  ])('should attempt to run server, $description', async ({ options, tools, enableSigint, transportMethod }) => {
    const settings = {
      ...(tools && { tools }),
      ...(enableSigint !== undefined && { enableSigint })
    };

    const serverInstance = await runServer(options as any, Object.keys(settings).length > 0 ? settings : undefined);

    expect(transportMethod).toHaveBeenCalled();
    expect(serverInstance.isRunning()).toBe(true);
    expect({
      info: consoleInfoSpy.mock.calls,
      registerTool: mockServer.registerTool.mock.calls,
      mcpServer: MockMcpServer.mock.calls,
      log: consoleLogSpy.mock.calls,
      process: processOnSpy.mock.calls
    }).toMatchSnapshot('console');
  });

  it.each([
    {
      description: 'stdio stop server',
      options: undefined
    },
    {
      description: 'http stop server',
      options: { http: true }
    }
  ])('should allow server to be stopped, $description', async ({ options }) => {
    const serverInstance = await runServer({ ...options, name: 'test-server' } as any, { allowProcessExit: false });

    expect(serverInstance.isRunning()).toBe(true);

    await serverInstance.stop();

    expect(serverInstance.isRunning()).toBe(false);
    expect({
      log: consoleLogSpy.mock.calls
    }).toMatchSnapshot('console');
  });

  it('should handle errors during server creation', async () => {
    const error = new Error('Server creation failed');

    MockMcpServer.mockImplementation(() => {
      throw error;
    });

    await expect(runServer(undefined, { tools: [] })).rejects.toThrow('Server creation failed');
    expect(consoleErrorSpy).toHaveBeenCalledWith(`Error creating ${getOptions().name} server:`, error);
  });

  it('should handle errors during connection', async () => {
    const error = new Error('Connection failed');

    mockServer.connect.mockRejectedValue(error);

    await expect(runServer(undefined, { tools: [] })).rejects.toThrow('Connection failed');
    expect(consoleErrorSpy).toHaveBeenCalledWith(`Error creating ${getOptions().name} server:`, error);
  });
});

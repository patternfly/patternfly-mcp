import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { runServer } from '../server';
import { type GlobalOptions } from '../options';
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
      description: 'use default tools',
      options: undefined,
      tools: undefined
    },
    {
      description: 'use custom options',
      options: {
        name: 'test-server',
        version: '1.0.0'
      },
      tools: []
    },
    {
      description: 'create transport, connect, and log success message',
      options: undefined,
      tools: []
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
      ]
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
      ]
    },
    {
      description: 'disable SIGINT handler',
      options: undefined,
      tools: [],
      enableSigint: false
    },
    {
      description: 'enable SIGINT handler explicitly',
      options: undefined,
      tools: [],
      enableSigint: true
    }
  ])('should attempt to run server, $description', async ({ options, tools, enableSigint }) => {
    const settings = {
      ...(tools && { tools }),
      ...(enableSigint !== undefined && { enableSigint })
    };

    await runServer(options as GlobalOptions, Object.keys(settings).length > 0 ? settings : undefined);

    expect(MockStdioServerTransport).toHaveBeenCalled();
    expect({
      info: consoleInfoSpy.mock.calls,
      registerTool: mockServer.registerTool.mock.calls,
      mcpServer: MockMcpServer.mock.calls,
      log: consoleLogSpy.mock.calls,
      process: processOnSpy.mock.calls
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

  describe('HTTP transport mode', () => {
    let mockHttpHandle: HttpServerHandle;
    let mockClose: jest.Mock;

    beforeEach(() => {
      mockClose = jest.fn().mockResolvedValue(undefined);
      mockHttpHandle = {
        close: mockClose
      };
      MockStartHttpTransport.mockResolvedValue(mockHttpHandle);
    });

    it('should start HTTP transport when http option is enabled', async () => {
      const options = { http: true, port: 3000, host: 'localhost' } as GlobalOptions;

      const serverInstance = await runServer(options, { tools: [], allowProcessExit: false });

      expect(MockStartHttpTransport).toHaveBeenCalledWith(mockServer, options);
      expect(serverInstance.isRunning()).toBe(true);
    });

    it('should close HTTP server handle when stop() is called', async () => {
      const options = { http: true, port: 3000, host: 'localhost' } as GlobalOptions;

      const serverInstance = await runServer(options, { tools: [], allowProcessExit: false });

      expect(serverInstance.isRunning()).toBe(true);

      await serverInstance.stop();

      expect(mockClose).toHaveBeenCalled();
      expect(serverInstance.isRunning()).toBe(false);
    });

    it('should close HTTP server before closing MCP server', async () => {
      const options = { http: true, port: 3000, host: 'localhost' } as GlobalOptions;

      const serverInstance = await runServer(options, { tools: [], allowProcessExit: false });

      // Track call order
      const callOrder: string[] = [];

      mockClose.mockImplementation(async () => {
        callOrder.push('http-close');

        return Promise.resolve();
      });

      mockServer.close.mockImplementation(async () => {
        callOrder.push('mcp-close');

        return Promise.resolve();
      });

      await serverInstance.stop();

      expect(callOrder).toEqual(['http-close', 'mcp-close']);
    });
  });
});

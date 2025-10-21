import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { runServer } from '../server';
import { type GlobalOptions } from '../options';

// Mock dependencies
jest.mock('@modelcontextprotocol/sdk/server/mcp.js');
jest.mock('@modelcontextprotocol/sdk/server/stdio.js');

const MockMcpServer = McpServer as jest.MockedClass<typeof McpServer>;
const MockStdioServerTransport = StdioServerTransport as jest.MockedClass<typeof StdioServerTransport>;

describe('runServer', () => {
  let mockServer: any;
  let mockTransport: any;
  let consoleInfoSpy: jest.SpyInstance;
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

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
  });

  afterEach(() => {
    consoleInfoSpy.mockRestore();
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
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
    }
  ])('should attempt to run server, $description', async ({ options, tools }) => {
    await runServer(options as GlobalOptions, (tools && { tools }) || undefined);

    expect(MockStdioServerTransport).toHaveBeenCalled();
    expect({
      info: consoleInfoSpy.mock.calls,
      registerTool: mockServer.registerTool.mock.calls,
      mcpServer: MockMcpServer.mock.calls,
      log: consoleLogSpy.mock.calls
    }).toMatchSnapshot('console');
  });

  it('should handle errors during server creation', async () => {
    const error = new Error('Server creation failed');

    MockMcpServer.mockImplementation(() => {
      throw error;
    });

    await expect(runServer(undefined, { tools: [] })).rejects.toThrow('Server creation failed');
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error creating MCP server:', error);
  });

  it('should handle errors during connection', async () => {
    const error = new Error('Connection failed');

    mockServer.connect.mockRejectedValue(error);

    await expect(runServer(undefined, { tools: [] })).rejects.toThrow('Connection failed');
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error creating MCP server:', error);
  });
});

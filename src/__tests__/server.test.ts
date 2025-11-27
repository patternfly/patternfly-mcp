import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { runServer } from '../server';
import { type GlobalOptions } from '../options';
import { log } from '../logger';

// Mock dependencies
jest.mock('@modelcontextprotocol/sdk/server/mcp.js');
jest.mock('@modelcontextprotocol/sdk/server/stdio.js');
jest.mock('../logger');
jest.mock('../server.logger', () => ({
  createServerLogger: {
    memo: jest.fn().mockImplementation(() => {})
  }
}));

const MockMcpServer = McpServer as jest.MockedClass<typeof McpServer>;
const MockStdioServerTransport = StdioServerTransport as jest.MockedClass<typeof StdioServerTransport>;
const MockLog = log as jest.MockedObject<typeof log>;

describe('runServer', () => {
  let mockServer: any;
  let mockTransport: any;
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

    // Spy on process.on method
    processOnSpy = jest.spyOn(process, 'on').mockImplementation();
  });

  afterEach(() => {
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
        // logging: { protocol: false }
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
      events: MockLog.info.mock.calls,
      registerTool: mockServer.registerTool.mock.calls,
      mcpServer: MockMcpServer.mock.calls,
      process: processOnSpy.mock.calls
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

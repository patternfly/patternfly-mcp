import { createServer } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { getProcessOnPort, formatPortConflictError, startHttpTransport } from '../server.http';
import { type GlobalOptions } from '../options';

// Mock dependencies
jest.mock('@modelcontextprotocol/sdk/server/mcp.js');
jest.mock('@modelcontextprotocol/sdk/server/streamableHttp.js');
jest.mock('node:http');
jest.mock('pid-port', () => ({
  __esModule: true,
  portToPid: jest.fn().mockImplementation(async () => 123456789)
}));

const MockMcpServer = McpServer as jest.MockedClass<typeof McpServer>;
const MockStreamableHTTPServerTransport = StreamableHTTPServerTransport as jest.MockedClass<typeof StreamableHTTPServerTransport>;
const MockCreateServer = createServer as jest.MockedFunction<typeof createServer>;

describe('getProcessOnPort', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should attempt to find a process listening on a port', async () => {
    await expect(getProcessOnPort(3000)).resolves.toMatchSnapshot('ps fallback');
  });
});

describe('formatPortConflictError', () => {
  it.each([
    {
      description: 'with process info',
      port: 3000,
      processInfo: { pid: 123456789, command: 'node dist/index.js --http' }
    },
    {
      description: 'without process info',
      port: 3000,
      processInfo: undefined
    }
  ])('should return a formatted message, $description', ({ port, processInfo }) => {
    expect(formatPortConflictError(port, processInfo)).toMatchSnapshot();
  });
});
describe('startHttpTransport', () => {
  const mockFunction = jest.fn();
  const mockEventHandler = jest.fn();
  const mockServerClose = jest.fn();
  let mockServer: any;
  let mockHttpServer: any;
  let mockTransport: any;

  beforeEach(() => {
    mockServer = {
      connect: mockFunction,
      registerTool: mockFunction
    };
    mockHttpServer = {
      on: mockEventHandler,
      listen: mockFunction.mockImplementation((_port: any, _host: any, callback: any) => {
        if (callback) {
          callback();
        }
      }),
      close: mockServerClose.mockImplementation((callback: any) => {
        callback();
      })
    };
    mockTransport = {
      handleRequest: jest.fn(),
      sessionId: 'test-session-123'
    };

    MockMcpServer.mockImplementation(() => mockServer);
    MockStreamableHTTPServerTransport.mockImplementation(() => mockTransport);
    MockCreateServer.mockReturnValue(mockHttpServer);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should start HTTP server, with port and host', async () => {
    const server = await startHttpTransport(mockServer, { port: 3000, host: 'localhost' } as GlobalOptions);

    await server.close();

    expect({
      setupServer: mockFunction.mock.calls,
      setupTransport: MockStreamableHTTPServerTransport.mock.calls,
      setupHandlers: mockEventHandler.mock.calls,
      serverClose: mockServerClose.mock.calls
    }).toMatchSnapshot('server setup');
  });

  it.each([
    {
      description: 'with invalid port',
      options: { port: undefined, host: 'localhost' },
      error: 'are required for HTTP transport'
    },
    {
      description: 'with invalid host',
      options: { port: 3000, host: undefined },
      error: 'are required for HTTP transport'
    }
  ])('should handle option errors, $description', async ({ error, options }) => {
    await expect(startHttpTransport(mockServer, options as any)).rejects.toThrow(error);
  });
});

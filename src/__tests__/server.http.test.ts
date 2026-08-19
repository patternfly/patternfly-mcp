import { createServer } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { getProcessOnPort, startHttpTransport } from '../server.http';

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

describe('startHttpTransport', () => {
  const mockFunction = jest.fn();
  const mockOnHandler = jest.fn();
  const mockOnceHandler = jest.fn();
  const mockOffHandler = jest.fn();
  const mockListen = jest.fn();
  const mockServerClose = jest.fn();
  let mockRequestHandler: ((req: any, res: any) => void) | undefined;
  let mockServer: any;
  let mockHttpServer: any;
  let mockTransport: any;

  beforeEach(() => {
    mockServer = {
      connect: mockFunction,
      registerTool: mockFunction
    };
    mockHttpServer = {
      on: mockOnHandler,
      once: mockOnceHandler,
      off: mockOffHandler,
      listen: mockListen.mockImplementation((_port: any, _host: any, callback: any) => {
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

    MockCreateServer.mockImplementation((handler: any) => {
      mockRequestHandler = handler;

      return mockHttpServer as any;
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should start HTTP server, with port and host', async () => {
    const server = await startHttpTransport(mockServer, { http: { port: 3000, host: 'localhost' } } as any);

    await server.close();

    expect({
      setupServer: mockFunction.mock.calls,
      setupTransport: MockStreamableHTTPServerTransport.mock.calls,
      setupHandlers: {
        on: mockOnHandler.mock.calls,
        once: mockOnceHandler.mock.calls,
        off: mockOffHandler.mock.calls
      },
      serverClose: mockServerClose.mock.calls
    }).toMatchSnapshot('server setup');
  });

  it('should reject startup on EADDRINUSE error', async () => {
    mockHttpServer.listen.mockImplementation(() => {
      const errorHandler = mockHttpServer.once.mock.calls.find((call: any) => call[0] === 'error')?.[1];

      if (errorHandler) {
        const err: any = new Error('Address in use');

        err.code = 'EADDRINUSE';
        errorHandler(err);
      }
    });

    await expect(
      startHttpTransport(mockServer, { http: { port: 5000, host: 'localhost' } } as any)
    ).rejects.toThrow('Port 5000 is already in use');
  });

  it('should log runtime error emitted after startup without throwing unhandled exception', async () => {
    const server = await startHttpTransport(mockServer, { http: { port: 3000, host: 'localhost' } } as any);

    const runtimeErrorHandler = mockHttpServer.on.mock.calls.find((call: any) => call[0] === 'error')?.[1];

    expect(runtimeErrorHandler).toBeDefined();
    await expect(runtimeErrorHandler(new Error('Connection reset'))).resolves.toBeUndefined();

    await server.close();
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

  it.each([
    {
      description: 'accept a basic path',
      url: '/mcp',
      isTransportCalled: true
    },
    {
      description: 'accept a trailing slash',
      url: '/mcp/',
      isTransportCalled: true
    },
    {
      description: 'accept a trailing slash with path',
      url: '/mcp/sse',
      isTransportCalled: true
    },
    {
      description: 'accept a casing insensitive path',
      url: '/MCP',
      isTransportCalled: true
    },
    {
      description: 'accept a path with query params',
      url: '/MCP/SSE?x=1',
      isTransportCalled: true
    },
    {
      description: 'reject a root path',
      url: '/',
      isTransportCalled: false
    },
    {
      description: 'reject a partial path',
      url: '/mc',
      isTransportCalled: false
    },
    {
      description: 'reject an malformed path',
      url: '/mcpish',
      isTransportCalled: false
    },
    {
      description: 'reject an incorrect path',
      url: '/foo/bar?x=1',
      isTransportCalled: false
    },
    {
      description: 'reject a malformed path',
      url: 'http:]//localhost:8000/mcp',
      isTransportCalled: false
    },
    {
      description: 'reject a malformed url',
      url: 'http://[',
      isTransportCalled: false
    }
  ])('accept and reject paths, $description', async ({ url, isTransportCalled }) => {
    await startHttpTransport(mockServer, { http: { port: 3000, host: 'localhost' } } as any);

    const mockResponse = jest.fn();
    const response = {
      statusCode: undefined,
      shouldKeepAlive: undefined,
      setHeader: mockResponse,
      end: mockResponse
    };

    const mockRequest = {
      url,
      method: 'GET',
      socket: { remoteAddress: '127.0.0.1' }
    };

    await mockRequestHandler?.(mockRequest, response);

    const isRequestCalled = mockTransport.handleRequest.mock.calls.length > 0;

    expect({
      response: {
        statusCode: response.statusCode,
        shouldKeepAlive: response.shouldKeepAlive
      },
      responseCalls: mockResponse.mock.calls,
      requestCalls: mockTransport.handleRequest.mock.calls,
      isRequestCalled
    }).toMatchSnapshot();

    expect(isRequestCalled).toBe(isTransportCalled);
  });
});

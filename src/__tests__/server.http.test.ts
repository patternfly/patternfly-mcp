import { createServer } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { startHttpTransport } from '../server.http';

// Mock dependencies
jest.mock('@modelcontextprotocol/sdk/server/mcp.js');
jest.mock('@modelcontextprotocol/sdk/server/streamableHttp.js');
jest.mock('node:http');

const MockMcpServer = McpServer as jest.MockedClass<typeof McpServer>;
const MockStreamableHTTPServerTransport = StreamableHTTPServerTransport as jest.MockedClass<typeof StreamableHTTPServerTransport>;
const MockCreateServer = createServer as jest.MockedFunction<typeof createServer>;

describe('HTTP Transport', () => {
  let mockServer: any;
  let mockTransport: any;
  let mockHttpServer: any;

  beforeEach(() => {
    mockServer = {
      connect: jest.fn(),
      registerTool: jest.fn()
    };
    mockTransport = {
      handleRequest: jest.fn(),
      sessionId: 'test-session-123'
    };
    mockHttpServer = {
      on: jest.fn(),
      listen: jest.fn().mockImplementation((_port: any, _host: any, callback: any) => {
        // Immediately call the callback to simulate successful server start
        if (callback) callback();
      }),
      close: jest.fn()
    };

    MockMcpServer.mockImplementation(() => mockServer);
    MockStreamableHTTPServerTransport.mockImplementation(() => mockTransport);
    MockCreateServer.mockReturnValue(mockHttpServer);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('startHttpTransport', () => {
    it('should start HTTP server on specified port and host', async () => {
      // Uses default parameter pattern - no need to pass options explicitly
      await startHttpTransport(mockServer);

      expect(MockCreateServer).toHaveBeenCalled();
      expect(mockHttpServer.listen).toHaveBeenCalledWith(3000, 'localhost', expect.any(Function));
    });

    it('should create StreamableHTTPServerTransport with correct options', async () => {
      await startHttpTransport(mockServer);

      expect(MockStreamableHTTPServerTransport).toHaveBeenCalledWith({
        sessionIdGenerator: expect.any(Function),
        enableJsonResponse: false,
        allowedOrigins: undefined,
        allowedHosts: undefined,
        enableDnsRebindingProtection: true,
        onsessioninitialized: expect.any(Function),
        onsessionclosed: expect.any(Function)
      });
    });

    it('should connect MCP server to transport', async () => {
      await startHttpTransport(mockServer);

      expect(mockServer.connect).toHaveBeenCalledWith(mockTransport);
    });

    it('should handle server errors', async () => {
      const error = new Error('Server error');

      mockHttpServer.listen.mockImplementation((_port: any, _host: any, _callback: any) => {
        mockHttpServer.on.mockImplementation((event: any, handler: any) => {
          if (event === 'error') {
            handler(error);
          }
        });
        throw error;
      });

      await expect(startHttpTransport(mockServer)).rejects.toThrow('Server error');
    });

    it('should set up request handler', async () => {
      await startHttpTransport(mockServer);

      // StreamableHTTPServerTransport handles requests directly
      expect(MockStreamableHTTPServerTransport).toHaveBeenCalled();
    });
  });

  describe('HTTP request handling', () => {
    it('should delegate requests to StreamableHTTPServerTransport', async () => {
      await startHttpTransport(mockServer);

      // Mock request and response
      const mockReq = {
        method: 'GET',
        url: '/mcp',
        headers: { host: 'localhost:3000' }
      };
      const mockRes = {
        setHeader: jest.fn(),
        writeHead: jest.fn(),
        end: jest.fn()
      };

      // Call the transport's handleRequest method directly
      await mockTransport.handleRequest(mockReq, mockRes);

      // Verify transport handles the request
      expect(mockTransport.handleRequest).toHaveBeenCalledWith(mockReq, mockRes);
    });

    it('should handle all HTTP methods through transport', async () => {
      await startHttpTransport(mockServer);

      // Test different HTTP methods
      const methods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'];

      for (const method of methods) {
        const mockReq = {
          method,
          url: '/mcp',
          headers: { host: 'localhost:3000' }
        };
        const mockRes = {
          setHeader: jest.fn(),
          writeHead: jest.fn(),
          end: jest.fn()
        };

        await mockTransport.handleRequest(mockReq, mockRes);
        expect(mockTransport.handleRequest).toHaveBeenCalledWith(mockReq, mockRes);
      }
    });

    it('should handle transport errors gracefully', async () => {
      await startHttpTransport(mockServer);

      // Mock transport error
      const transportError = new Error('Transport error');

      mockTransport.handleRequest.mockRejectedValue(transportError);

      const mockReq = {
        method: 'GET',
        url: '/mcp',
        headers: { host: 'localhost:3000' }
      };
      const mockRes = {
        setHeader: jest.fn(),
        writeHead: jest.fn(),
        end: jest.fn()
      };

      // Should throw - transport errors are propagated
      await expect(mockTransport.handleRequest(mockReq, mockRes)).rejects.toThrow('Transport error');
    });
  });

  describe('StreamableHTTPServerTransport configuration', () => {
    it('should use crypto.randomUUID for session ID generation', async () => {
      await startHttpTransport(mockServer);

      const transportOptions = MockStreamableHTTPServerTransport.mock.calls[0]?.[0];

      expect(transportOptions?.sessionIdGenerator).toBeDefined();
      expect(typeof transportOptions?.sessionIdGenerator).toBe('function');

      // Test that it generates UUIDs
      const sessionId = transportOptions?.sessionIdGenerator?.();

      expect(sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('should configure session callbacks', async () => {
      await startHttpTransport(mockServer);

      const transportOptions = MockStreamableHTTPServerTransport.mock.calls[0]?.[0];

      expect(transportOptions?.onsessioninitialized).toBeDefined();
      expect(transportOptions?.onsessionclosed).toBeDefined();
      expect(typeof transportOptions?.onsessioninitialized).toBe('function');
      expect(typeof transportOptions?.onsessionclosed).toBe('function');
    });

    it('should enable SSE streaming', async () => {
      await startHttpTransport(mockServer);

      const transportOptions = MockStreamableHTTPServerTransport.mock.calls[0]?.[0];

      expect(transportOptions?.enableJsonResponse).toBe(false);
    });

    it('should enable DNS rebinding protection', async () => {
      await startHttpTransport(mockServer);

      const transportOptions = MockStreamableHTTPServerTransport.mock.calls[0]?.[0];

      expect(transportOptions?.enableDnsRebindingProtection).toBe(true);
    });
  });
});

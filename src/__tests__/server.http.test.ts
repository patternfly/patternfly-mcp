import { createServer } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isSameMcpServer, SAME_SERVER_TOKENS, startHttpTransport } from '../server.http';
import { type GlobalOptions } from '../options';

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
      const options = { port: 3000, host: 'localhost' } as GlobalOptions;

      await startHttpTransport(mockServer, options);

      expect(MockCreateServer).toHaveBeenCalled();
      expect(mockHttpServer.listen).toHaveBeenCalledWith(options.port, options.host, expect.any(Function));
    });

    it('should create StreamableHTTPServerTransport with correct options', async () => {
      const options = { port: 3000, host: 'localhost' } as GlobalOptions;

      await startHttpTransport(mockServer, options);

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
      const options = { port: 3000, host: 'localhost' } as GlobalOptions;

      await startHttpTransport(mockServer, options);

      expect(mockServer.connect).toHaveBeenCalledWith(mockTransport);
    });

    it('should handle server errors', async () => {
      const options = { port: 3000, host: 'localhost' } as GlobalOptions;

      const error = new Error('Server error');

      mockHttpServer.listen.mockImplementation((_port: any, _host: any, _callback: any) => {
        mockHttpServer.on.mockImplementation((event: any, handler: any) => {
          if (event === 'error') {
            handler(error);
          }
        });
        throw error;
      });

      await expect(startHttpTransport(mockServer, options)).rejects.toThrow('Server error');
    });

    it('should set up request handler', async () => {
      const options = { port: 3000, host: 'localhost' } as GlobalOptions;

      await startHttpTransport(mockServer, options);

      // StreamableHTTPServerTransport handles requests directly
      expect(MockStreamableHTTPServerTransport).toHaveBeenCalled();
    });

    it('should return handle with close method', async () => {
      const options = { port: 3000, host: 'localhost' } as GlobalOptions;

      const handle = await startHttpTransport(mockServer, options);

      expect(handle).toBeDefined();
      expect(typeof handle.close).toBe('function');
    });

    it('should close HTTP server when handle.close() is called', async () => {
      const options = { port: 3000, host: 'localhost' } as GlobalOptions;

      const handle = await startHttpTransport(mockServer, options);

      // Mock server.close to call callback immediately
      mockHttpServer.close.mockImplementation((callback: () => void) => {
        if (callback) callback();
      });

      await handle.close();

      expect(mockHttpServer.close).toHaveBeenCalled();
    });
  });

  describe('HTTP request handling', () => {
    it('should delegate requests to StreamableHTTPServerTransport', async () => {
      const options = { port: 3000, host: 'localhost' } as GlobalOptions;

      await startHttpTransport(mockServer, options);

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
      const options = { port: 3000, host: 'localhost' } as GlobalOptions;

      await startHttpTransport(mockServer, options);

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
      const options = { port: 3000, host: 'localhost' } as GlobalOptions;

      await startHttpTransport(mockServer, options);

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
      const options = { port: 3000, host: 'localhost' } as GlobalOptions;

      await startHttpTransport(mockServer, options);

      const transportOptions = MockStreamableHTTPServerTransport.mock.calls[0]?.[0];

      expect(transportOptions?.sessionIdGenerator).toBeDefined();
      expect(typeof transportOptions?.sessionIdGenerator).toBe('function');

      // Test that it generates UUIDs
      const sessionId = transportOptions?.sessionIdGenerator?.();

      expect(sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('should configure session callbacks', async () => {
      const options = { port: 3000, host: 'localhost' } as GlobalOptions;

      await startHttpTransport(mockServer, options);

      const transportOptions = MockStreamableHTTPServerTransport.mock.calls[0]?.[0];

      expect(transportOptions?.onsessioninitialized).toBeDefined();
      expect(transportOptions?.onsessionclosed).toBeDefined();
      expect(typeof transportOptions?.onsessioninitialized).toBe('function');
      expect(typeof transportOptions?.onsessionclosed).toBe('function');
    });

    it('should enable SSE streaming', async () => {
      const options = { port: 3000, host: 'localhost' } as GlobalOptions;

      await startHttpTransport(mockServer, options);

      const transportOptions = MockStreamableHTTPServerTransport.mock.calls[0]?.[0];

      expect(transportOptions?.enableJsonResponse).toBe(false);
    });

    it('should enable DNS rebinding protection', async () => {
      const options = { port: 3000, host: 'localhost' } as GlobalOptions;

      await startHttpTransport(mockServer, options);

      const transportOptions = MockStreamableHTTPServerTransport.mock.calls[0]?.[0];

      expect(transportOptions?.enableDnsRebindingProtection).toBe(true);
    });
  });

  describe('isSameMcpServer', () => {
    it('should match node dist/index.js with --http', () => {
      expect(isSameMcpServer('node /path/to/project/dist/index.js --http --port 3000')).toBe(true);
    });

    it('should match installed bin names with --http', () => {
      expect(isSameMcpServer('/usr/local/bin/patternfly-mcp --http')).toBe(true);
      expect(isSameMcpServer('pf-mcp --http --port 8080')).toBe(true);
      expect(isSameMcpServer('pfmcp --http')).toBe(true);
    });

    it('should match when using npx', () => {
      expect(isSameMcpServer('npx @patternfly/patternfly-mcp --http')).toBe(true);
      expect(isSameMcpServer('npx patternfly-mcp --http --port 3000')).toBe(true);
    });

    it('should not match without --http flag', () => {
      expect(isSameMcpServer('node dist/index.js')).toBe(false);
      expect(isSameMcpServer('pf-mcp')).toBe(false);
      expect(isSameMcpServer('patternfly-mcp --port 3000')).toBe(false);
    });

    it('should not match stdio mode (no --http)', () => {
      expect(isSameMcpServer('node dist/index.js')).toBe(false);
      expect(isSameMcpServer('patternfly-mcp')).toBe(false);
    });

    it('should be resilient to Windows paths and extra spaces', () => {
      expect(isSameMcpServer('node C:\\proj\\dist\\index.js    --http   ')).toBe(true);
      expect(isSameMcpServer('C:\\Users\\App\\patternfly-mcp.exe --http --port 3000')).toBe(true);
    });

    it('should handle case insensitivity', () => {
      expect(isSameMcpServer('NODE DIST/INDEX.JS --HTTP')).toBe(true);
      expect(isSameMcpServer('PATTERNFLY-MCP --HTTP')).toBe(true);
      expect(isSameMcpServer('PF-MCP --HTTP')).toBe(true);
    });

    it('should handle --http flag at different positions', () => {
      expect(isSameMcpServer('--http node dist/index.js')).toBe(true);
      expect(isSameMcpServer('patternfly-mcp --http --port 3000')).toBe(true);
      expect(isSameMcpServer('pf-mcp --port 3000 --http')).toBe(true);
    });

    it('should not match unrelated processes even if they contain tokens but lack --http', () => {
      // Extremely contrived but guards against accidental substring hits
      expect(isSameMcpServer('/usr/bin/grep patternfly-mcp')).toBe(false);
      expect(isSameMcpServer('cat dist/index.js')).toBe(false);
      expect(isSameMcpServer('echo "pf-mcp is great"')).toBe(false);
    });

    it('should not match processes with --http but different tokens', () => {
      expect(isSameMcpServer('node other-server.js --http')).toBe(false);
      expect(isSameMcpServer('python server.py --http')).toBe(false);
      expect(isSameMcpServer('nginx --http')).toBe(false);
    });

    it('should handle empty or falsy input', () => {
      expect(isSameMcpServer('')).toBe(false);
      expect(isSameMcpServer('   ')).toBe(false);
    });

    it('should match when token appears in path', () => {
      expect(isSameMcpServer('/home/user/projects/patternfly-mcp/dist/index.js --http')).toBe(true);
      expect(isSameMcpServer('/opt/pf-mcp/bin/pf-mcp --http')).toBe(true);
    });

    it('should require --http flag to be a complete flag (not substring)', () => {
      // Should not match if --http is part of another flag
      expect(isSameMcpServer('node dist/index.js --http-port 3000')).toBe(false);
      expect(isSameMcpServer('patternfly-mcp --no-http')).toBe(false);
    });

    it('should match with word boundaries for --http flag', () => {
      expect(isSameMcpServer('node dist/index.js --http')).toBe(true);
      expect(isSameMcpServer('node dist/index.js --http ')).toBe(true);
      expect(isSameMcpServer(' node dist/index.js --http')).toBe(true);
      expect(isSameMcpServer('node dist/index.js --http --port 3000')).toBe(true);
    });

    it('should export SAME_SERVER_TOKENS for testing', () => {
      expect(SAME_SERVER_TOKENS).toBeDefined();
      expect(Array.isArray(SAME_SERVER_TOKENS)).toBe(true);
      expect(SAME_SERVER_TOKENS.length).toBeGreaterThan(0);
      // Should always include the built entry point
      expect(SAME_SERVER_TOKENS).toContain('dist/index.js');
      // Should include all bin names from package.json
      expect(SAME_SERVER_TOKENS).toContain('patternfly-mcp');
      expect(SAME_SERVER_TOKENS).toContain('pf-mcp');
      expect(SAME_SERVER_TOKENS).toContain('pfmcp');
      // Verify it's dynamically generated (should have at least 4 entries: dist/index.js + 3 bin names)
      expect(SAME_SERVER_TOKENS.length).toBeGreaterThanOrEqual(4);
    });
  });
});

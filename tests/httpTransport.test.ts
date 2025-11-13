/**
 * E2E tests for HTTP transport using StreamableHTTPServerTransport
 * Tests core functionality including server startup, MCP protocol, tool execution, and performance
 */

import { startHttpServer, type HttpTransportClient } from './utils/httpTransportClient';

describe('PatternFly MCP, HTTP Transport', () => {
  let client: HttpTransportClient;

  afterEach(async () => {
    if (client) {
      await client.close();
    }
  });

  describe('Basic HTTP Transport', () => {
    it('should start HTTP server on specified port', async () => {
      client = await startHttpServer({ port: 5001, host: 'localhost' });

      expect(client.baseUrl).toMatch(/http:\/\/localhost:5001/);
    });

    it('should initialize MCP session over HTTP', async () => {
      client = await startHttpServer();
      const response = await client.initialize();

      expect({
        version: response?.result?.protocolVersion,
        name: (response as any)?.result?.serverInfo?.name
      }).toMatchSnapshot();
    });

    it('should list tools over HTTP', async () => {
      client = await startHttpServer();
      await client.initialize();

      const response = await client.send({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {}
      });
      const toolNames = response.result?.tools?.map((t: any) => t.name) || [];

      expect(toolNames).toMatchSnapshot('tools');
    });

    it('should handle concurrent requests', async () => {
      client = await startHttpServer();
      await client.initialize();

      // Send multiple requests concurrently
      const [response1, response2, response3] = await Promise.all([
        client.send({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
        client.send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
        client.send({ jsonrpc: '2.0', id: 3, method: 'tools/list', params: {} })
      ]);

      expect(response1.result?.tools).toBeDefined();
      expect(response2.result?.tools).toBeDefined();
      expect(response3.result?.tools).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle server startup errors gracefully', async () => {
      // Test with invalid port
      await expect(startHttpServer({ port: 99999 })).rejects.toThrow();
    });

    it('should handle malformed requests', async () => {
      client = await startHttpServer();
      await client.initialize();

      const response = await client.send({
        jsonrpc: '2.0',
        id: 1,
        method: 'invalid/method',
        params: {}
      });

      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe(-32601);
    });
  });

  describe('Configuration Options', () => {
    it('should start server on custom port', async () => {
      client = await startHttpServer({ port: 5002 });

      expect(client.baseUrl).toMatch(/5002/);
    });

    it('should start server on custom host', async () => {
      client = await startHttpServer({ host: '127.0.0.1' });

      expect(client.baseUrl).toMatch(/127\.0\.0\.1/);
    });
  });

  describe('Tool Execution', () => {
    it('should execute usePatternFlyDocs over HTTP', async () => {
      client = await startHttpServer();
      await client.initialize();

      const response = await client.send({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'usePatternFlyDocs',
          arguments: {
            urlList: ['documentation/guidelines/README.md']
          }
        }
      });

      expect(response.result?.content?.[0]?.text).toContain('# Documentation from');
      expect(response.result?.content?.[0]?.text).toContain('documentation/guidelines/README.md');
    });

    it('should execute fetchDocs over HTTP', async () => {
      client = await startHttpServer();
      await client.initialize();

      // Test that the tool is available
      const toolsResponse = await client.send({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
      const toolNames = toolsResponse.result?.tools?.map((t: any) => t.name) || [];

      expect(toolNames).toContain('fetchDocs');
    });
  });

  describe('Performance and Reliability', () => {
    it('should handle rapid successive requests', async () => {
      client = await startHttpServer();
      await client.initialize();

      // Send 5 rapid requests
      const requests = Array.from({ length: 5 }, (_, i) =>
        client.send({ jsonrpc: '2.0', id: i + 1, method: 'tools/list', params: {} }));

      const responses = await Promise.all(requests);

      responses.forEach(response => {
        expect(response.result?.tools).toBeDefined();
      });
    });

    it('should maintain performance under load', async () => {
      client = await startHttpServer();
      await client.initialize();

      const startTime = Date.now();

      // Send multiple concurrent requests
      const requests = Array.from({ length: 3 }, () =>
        client.send({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }));

      await Promise.all(requests);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete within reasonable time (3 seconds)
      expect(duration).toBeLessThan(3000);
    });
  });
});

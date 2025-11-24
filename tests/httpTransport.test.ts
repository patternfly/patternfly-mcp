/**
 * Requires: npm run build prior to running Jest.
 */
import { startHttpServer, type HttpTransportClient } from './utils/httpTransportClient';
import { loadFixture } from './utils/fixtures';
import { setupFetchMock } from './utils/fetchMock';

describe('PatternFly MCP, HTTP Transport', () => {
  let client: HttpTransportClient | undefined;
  let fetchMock: Awaited<ReturnType<typeof setupFetchMock>> | undefined;

  // Set up fetch mock to intercept remote HTTP requests
  // This ensures tests don't depend on external services being available
  beforeAll(async () => {
    // Load fixture content
    const body = loadFixture('README.md');

    // Set up fetch mock with routes
    fetchMock = await setupFetchMock({
      routes: [
        {
          url: /\/readme$/,
          status: 200,
          headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
          body
        },
        {
          url: /.*\.md$/,
          status: 200,
          headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
          body: '# Test Document\n\nThis is a test document for mocking remote HTTP requests.'
        }
      ],
      excludePorts: [5001] // Don't intercept MCP server requests
    });

    // Start the MCP server
    client = await startHttpServer({ port: 5001 });
  });

  afterAll(async () => {
    // Cleanup fetch mock (restores fetch and closes fixture server)
    if (fetchMock) {
      await fetchMock.cleanup();
    }

    // Close MCP server
    if (client) {
      await client.close();
      client = undefined;
    }
  });

  it('should expose expected tools and stable shape', async () => {
    // Client is automatically initialized, so we can directly call tools/list
    if (!client) {
      throw new Error('Client not initialized');
    }

    const response = await client.send({
      method: 'tools/list',
      params: {}
    });
    const tools = response?.result?.tools || [];
    const toolNames = tools.map((tool: any) => tool.name).sort();

    expect(toolNames).toMatchSnapshot();
  });

  /*
  it('should initialize MCP session over HTTP', async () => {
    client = await startHttpServer({ port: 5001, killExisting: true });
    const response = await client.initialize();

    expect({
      version: response?.result?.protocolVersion,
      name: (response as any)?.result?.serverInfo?.name
    }).toMatchSnapshot();
  });

  it('should concatenate headers and separator with two local files', async () => {
    client = await startHttpServer({ port: 5001, killExisting: true });
    const req: RpcRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'usePatternFlyDocs',
        arguments: {
          urlList: [
            'documentation/guidelines/README.md',
            'documentation/components/README.md'
          ]
        }
      }
    };

    const response = await client.send(req);
    const text = response?.result?.content?.[0]?.text || '';

    expect(text.startsWith('# Documentation from')).toBe(true);
    expect(text).toMatchSnapshot();
  });

  it('should start server on custom host', async () => {
    client = await startHttpServer({ port: 5001, killExisting: true });
    await client.close();
    client = await startHttpServer({ host: '127.0.0.1', port: 5011 });

    expect(client.baseUrl).toMatch(/127\.0\.0\.1/);
  });
   */
});

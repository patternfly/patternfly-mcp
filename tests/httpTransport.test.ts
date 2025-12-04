/**
 * Requires: npm run build prior to running Jest.
 */
import {
  startServer,
  type HttpTransportClient,
  type RpcRequest
} from './utils/httpTransportClient';
import { setupFetchMock } from './utils/fetchMock';

describe('PatternFly MCP, HTTP Transport', () => {
  let FETCH_MOCK: Awaited<ReturnType<typeof setupFetchMock>> | undefined;
  let CLIENT: HttpTransportClient | undefined;

  beforeAll(async () => {
    FETCH_MOCK = await setupFetchMock({
      routes: [
        {
          url: /\/README\.md$/,
          status: 200,
          headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
          body: `# PatternFly Development Rules
            This is a generated offline fixture used by the MCP external URLs test.

            Essential rules and guidelines working with PatternFly applications.

            ## Quick Navigation

            ### 🚀 Setup & Environment
            - **Setup Rules** - Project initialization requirements
            - **Quick Start** - Essential setup steps
            - **Environment Rules** - Development configuration`
        },
        {
          url: /.*\.md$/,
          status: 200,
          headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
          body: '# Test Document\n\nThis is a test document for mocking remote HTTP requests.'
        }
      ],
      excludePorts: [5001]
    });

    CLIENT = await startServer({ http: { port: 5001 } });
  });

  afterAll(async () => {
    if (CLIENT) {
      // You may still receive jest warnings about a running process, but clean up case we forget at the test level.
      await CLIENT.close();
      CLIENT = undefined;
    }

    if (FETCH_MOCK) {
      await FETCH_MOCK.cleanup();
    }
  });

  it('should initialize MCP session over HTTP', async () => {
    const response = await CLIENT?.initialize();

    expect({
      version: response?.result?.protocolVersion,
      name: (response as any)?.result?.serverInfo?.name,
      baseUrl: CLIENT?.baseUrl
    }).toMatchSnapshot();
  });

  it('should expose expected tools and stable shape', async () => {
    const response = await CLIENT?.send({
      method: 'tools/list',
      params: {}
    });
    const tools = response?.result?.tools || [];
    const toolNames = tools.map((tool: any) => tool.name).sort();

    expect({ toolNames }).toMatchSnapshot();
  });

  it('should concatenate headers and separator with two local files', async () => {
    const req = {
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
    } as RpcRequest;

    const response = await CLIENT?.send(req);
    const text = response?.result?.content?.[0]?.text || '';

    expect(text.startsWith('# Documentation from')).toBe(true);
    expect(text).toMatchSnapshot();
  });

  it('should concatenate headers and separator with two remote files', async () => {
    const CLIENT = await startServer({ http: { port: 5002 } });
    const req = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'fetchDocs',
        arguments: {
          urlList: [
            'https://www.patternfly.org/notARealPath/README.md',
            'https://www.patternfly.org/notARealPath/AboutModal.md'
          ]
        }
      }
    } as RpcRequest;

    const response = await CLIENT.send(req);
    const text = response?.result?.content?.[0]?.text || '';

    expect(text.startsWith('# Documentation from')).toBe(true);
    expect(text).toMatchSnapshot();
    CLIENT.close();
  });
});

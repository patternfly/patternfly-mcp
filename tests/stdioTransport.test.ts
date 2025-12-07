/**
 *  Requires: npm run build prior to running Jest.
 */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  startServer,
  type StdioTransportClient,
  type RpcRequest
} from './utils/stdioTransportClient';
import { setupFetchMock } from './utils/fetchMock';

describe('PatternFly MCP, STDIO', () => {
  let FETCH_MOCK: Awaited<ReturnType<typeof setupFetchMock>> | undefined;
  let CLIENT: StdioTransportClient;
  // We're unable to mock fetch for stdio since it runs in a separate process, so we run a server and use that path for mocking external URLs.
  let URL_MOCK: string;

  beforeAll(async () => {
    FETCH_MOCK = await setupFetchMock({
      port: 5010,
      routes: [
        {
          url: /\/README\.md$/,
          // url: '/notARealPath/README.md',
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
          // url: '/notARealPath/AboutModal.md',
          status: 200,
          headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
          body: '# Test Document\n\nThis is a test document for mocking remote HTTP requests.'
        }
      ]
    });

    URL_MOCK = `${FETCH_MOCK?.fixture?.baseUrl}/`;
    CLIENT = await startServer();
  });

  afterAll(async () => {
    if (CLIENT) {
      // You may still receive jest warnings about a running process, but clean up case we forget at the test level.
      await CLIENT.close();
    }

    if (FETCH_MOCK) {
      await FETCH_MOCK.cleanup();
    }
  });

  it('should expose expected tools and stable shape', async () => {
    const response = await CLIENT.send({
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

    const response = await CLIENT.send(req);
    const text = response?.result?.content?.[0]?.text || '';

    expect(text.startsWith('# Documentation from')).toBe(true);
    expect(text).toMatchSnapshot();
  });

  it('should concatenate headers and separator with two remote files', async () => {
    const req = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'fetchDocs',
        arguments: {
          urlList: [
            // URL_MOCK
            `${URL_MOCK}notARealPath/README.md`,
            `${URL_MOCK}notARealPath/AboutModal.md`
          ]
        }
      }
    } as RpcRequest;

    const response = await CLIENT.send(req, { timeoutMs: 10000 });
    const text = response?.result?.content?.[0]?.text || '';

    // expect(text.startsWith('# Documentation from')).toBe(true);
    expect(text).toMatchSnapshot();
  });
});

describe('Hosted mode, --docs-host', () => {
  let CLIENT: StdioTransportClient;

  beforeEach(async () => {
    CLIENT = await startServer({ args: ['--docs-host'] });
  });

  afterEach(async () => CLIENT.stop());

  it('should read llms-files and includes expected tokens', async () => {
    const req = {
      method: 'tools/call',
      params: {
        name: 'usePatternFlyDocs',
        arguments: { urlList: ['react-core/6.0.0/llms.txt'] }
      }
    };
    const resp = await CLIENT.send(req);
    const text = resp?.result?.content?.[0]?.text || '';

    expect(text.startsWith('# Documentation from')).toBe(true);
    expect(text.includes('react-core')).toBe(true);
    expect(text.split(/\n/g).filter(Boolean).splice(1)).toMatchSnapshot();
  });
});

describe('Logging', () => {
  it.each([
    {
      description: 'default',
      args: []
    },
    {
      description: 'stderr',
      args: ['--log-stderr']
    },
    {
      description: 'with log level filtering',
      args: ['--log-level', 'warn']
    },
    {
      description: 'with mcp protocol',
      args: ['--log-protocol']
    }
  ])('should allow setting logging options, $description', async ({ args }) => {
    const serverArgs = [...args];
    const CLIENT = await startServer({ args: serverArgs });

    expect(CLIENT.logs()).toMatchSnapshot();

    await CLIENT.stop();
  });
});

describe('Tools', () => {
  let CLIENT: StdioTransportClient;

  beforeEach(async () => {
    const abs = resolve(process.cwd(), 'tests/__fixtures__/tool.echo.js');
    const url = pathToFileURL(abs).href;

    CLIENT = await startServer({ args: ['--log-stderr', '--plugin-isolation', 'strict', '--tool', url] });
  });

  afterEach(async () => CLIENT.stop());

  itSkip(envNodeVersion >= 22)('should access a new tool', async () => {
    const req = {
      method: 'tools/list',
      params: {}
    };

    const resp = await CLIENT.send(req);
    const names = (resp?.result?.tools ?? []).map((tool: any) => tool.name);

    expect(CLIENT.logs().join(',')).toContain('Registered tool: echo_plugin_tool');
    expect(names).toContain('echo_plugin_tool');
  });

  itSkip(envNodeVersion <= 20)('should fail to access a new tool', async () => {
    const req = {
      method: 'tools/list',
      params: {}
    };

    await CLIENT.send(req);

    expect(CLIENT.logs().join(',')).toContain('External tool plugins require Node >= 22; skipping file-based tools.');
  });

  itSkip(envNodeVersion >= 22)('should interact with the new tool', async () => {
    const req = {
      method: 'tools/call',
      params: {
        name: 'echo_plugin_tool',
        arguments: {
          type: 'echo',
          lorem: 'ipsum',
          dolor: 'sit amet'
        }
      }
    };

    const resp: any = await CLIENT.send(req);

    expect(resp.result).toMatchSnapshot();
    expect(resp.result.isError).toBeUndefined();
  });

  itSkip(envNodeVersion <= 20)('should fail to interact with the new tool', async () => {
    const req = {
      method: 'tools/call',
      params: {
        name: 'echo_plugin_tool',
        arguments: {
          type: 'echo',
          lorem: 'ipsum',
          dolor: 'sit amet'
        }
      }
    };

    const resp: any = await CLIENT.send(req);

    expect(resp.result.isError).toBe(true);
  });
});

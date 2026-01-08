/**
 * Requires: npm run build prior to running Jest.
 * - If typings are needed, use public types from dist to avoid type identity mismatches between src and dist
 */
// @ts-ignore - dist/index.js isn't necessarily built yet, remember to build before running tests
import { createMcpTool } from '../dist/index.js';
import { startServer, type HttpTransportClient, type RpcRequest } from './utils/httpTransportClient';
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

    CLIENT = await startServer({ http: { port: 5001 }, logging: { level: 'debug', protocol: true } });
  });

  afterAll(async () => {
    if (CLIENT) {
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
    const CLIENT = await startServer({ http: { port: 0 } });
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
    await CLIENT.close();
  });
});

describe('Inline tools over HTTP', () => {
  let CLIENT: HttpTransportClient | undefined;

  afterAll(async () => {
    if (CLIENT) {
      await CLIENT.close();
    }
  });

  it.each([
    {
      description: 'inline tool module',
      toolName: 'inline_module',
      tool: createMcpTool({
        name: 'inline_module',
        description: 'Create inline',
        inputSchema: { additionalProperties: true },
        handler: (args: any) => ({ content: [{ type: 'text', text: JSON.stringify(args) }] })
      })
    },
    {
      description: 'inline tool creator',
      toolName: 'inline_creator',
      tool: (() => {
        const inlineCreator = (_options: any) => [
          'inline_creator',
          {
            description: 'Func inline',
            inputSchema: { additionalProperties: true }
          },
          (args: any) => ({ content: [{ type: 'text', text: JSON.stringify(args) }] })
        ];

        inlineCreator.toolName = 'inline_creator';

        return inlineCreator;
      })()
    },
    {
      description: 'inline object',
      toolName: 'inline_obj',
      tool: {
        name: 'inline_obj',
        description: 'Obj inline',
        inputSchema: { additionalProperties: true },
        handler: (args: any) => ({ content: [{ type: 'text', text: JSON.stringify(args) }] })
      }
    },
    {
      description: 'inline tuple',
      toolName: 'inline_tuple',
      tool: [
        'inline_tuple',
        {
          description: 'Tuple inline',
          inputSchema: { additionalProperties: true }
        },
        (args: any) => ({ content: [{ type: 'text', text: JSON.stringify(args) }] })
      ]
    }
  ])('should register and invoke an inline tool module, $description', async ({ tool, toolName }) => {
    CLIENT = await startServer(
      {
        http: { port: 0 },
        isHttp: true,
        logging: { level: 'info', protocol: true },
        toolModules: [tool as any]
      },
      { allowProcessExit: false }
    );

    const list = await CLIENT.send({ method: 'tools/list', params: {} });
    const names = (list?.result?.tools || []).map((tool: any) => tool.name);

    expect(names).toEqual(expect.arrayContaining([toolName]));

    const req = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: { x: 1, y: 'z' }
      }
    } as RpcRequest;

    const res = await CLIENT.send(req);

    expect(res?.result?.content?.[0]?.text).toContain('"x":1');

    await CLIENT.close();
  });
});

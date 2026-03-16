/**
 * Requires: npm run build prior to running Jest.
 * - If typings are needed, use public types from dist to avoid type identity mismatches between src and dist
 */
// @ts-ignore - dist/index.js isn't necessarily built yet, remember to build before running tests
import { createMcpTool } from '../../dist/index.js';
import { startServer, type HttpTransportClient, type RpcRequest } from './utils/httpTransportClient';
import { setupFetchMock } from './utils/fetchMock';

describe('Builtin tools, HTTP transport', () => {
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
      ]
    });

    CLIENT = await startServer({
      isHttp: true,
      modeOptions: { test: { baseUrl: FETCH_MOCK?.fixture?.baseUrl } },
      logging: { level: 'debug', protocol: true }
    });
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

    expect({ toolNames }).toMatchSnapshot('tools');
  });

  it('should concatenate headers and separator with two fixture server routes', async () => {
    const URL_MOCK = `${FETCH_MOCK?.fixture?.baseUrl}/`;
    const req = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'usePatternFlyDocs',
        arguments: {
          urlList: [
            // README.md matches /README\.md/ route in fetchMock
            `${URL_MOCK}README.md`,
            `${URL_MOCK}AboutModal.md`
          ]
        }
      }
    } as RpcRequest;

    const response = await CLIENT?.send(req);
    const text = response?.result?.content?.[0]?.text || '';

    expect(text.includes('AboutModal.md')).toBe(true);
    expect(text.includes('This is a test document for mocking remote HTTP requests')).toBe(true);
    expect(text.includes('README.md')).toBe(true);
    expect(text.includes('This is a generated offline fixture')).toBe(true);
  });

  it('should concatenate headers and separator with two remote files', async () => {
    const CLIENT = await startServer({ http: { port: 0 } });
    const req = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'usePatternFlyDocs',
        arguments: {
          urlList: [
            'https://www.patternfly.org/notARealPath/ChartLegend.md',
            'https://www.patternfly.org/notARealPath/AboutModal.md'
          ]
        }
      }
    } as RpcRequest;

    const response = await CLIENT.send(req);
    const text = response?.result?.content?.[0]?.text || '';

    expect(text.includes('This is a test document for mocking')).toBe(true);
    expect(text).toMatchSnapshot();
    await CLIENT.close();
  });
});

describe('Builtin resources, HTTP transport', () => {
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
          url: /.*button.*/i,
          status: 200,
          headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
          body: '# Test Document\n\nThis is a test document for mocking remote HTTP requests.'
        }
      ]
    });

    CLIENT = await startServer({
      isHttp: true,
      modeOptions: { test: { baseUrl: FETCH_MOCK?.fixture?.baseUrl } },
      logging: { level: 'debug', protocol: true }
    });
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

  it('should expose expected resources and templates', async () => {
    const resources = await CLIENT?.send({ method: 'resources/list' });
    const updatedResources = resources?.result?.resources || [];
    const resourceNames = updatedResources.map((resource: any) => resource.uri).sort();

    const templates = await CLIENT?.send({ method: 'resources/templates/list' });
    const updatedTemplates = templates?.result?.resourceTemplates || [];
    const templateNames = updatedTemplates.map((template: any) => template.uriTemplate).sort();

    expect(resourceNames).toContain('patternfly://context');
    expect(templateNames).toContain('patternfly://components/index');
    expect(templateNames).toContain('patternfly://components/meta');
    expect(templateNames).toContain('patternfly://components/index{?version,category}');
    expect(templateNames).toContain('patternfly://docs/index');
    expect(templateNames).toContain('patternfly://docs/meta');
    expect(templateNames).toContain('patternfly://docs/index{?version,category,section}');
    expect(templateNames).toContain('patternfly://docs/{name}{?version,category,section}');
    expect(templateNames).toContain('patternfly://schemas/index');
    expect(templateNames).toContain('patternfly://schemas/meta');
    expect(templateNames).toContain('patternfly://schemas/index{?version,category}');
    expect(templateNames).toContain('patternfly://schemas/{name}{?version,category}');
  });

  it('should read the patternfly-context resource', async () => {
    const response = await CLIENT?.send({
      method: 'resources/read',
      params: { uri: 'patternfly://context' }
    });
    const content = response?.result.contents[0];

    expect(content.text).toContain('PatternFly is an open-source design system');
    expect(content.mimeType).toBe('text/markdown');
  });

  it('should read the patternfly-docs-meta', async () => {
    const uri = 'patternfly://docs/meta';
    const response = await CLIENT?.send({
      method: 'resources/read',
      params: { uri }
    });
    const content = response?.result.contents[0];

    expect(content.uri).toBe(uri);
    expect(content.text).toContain('PatternFly Documentation Index Metadata');
    expect(content).toMatchSnapshot('meta output');
  });

  it('should read the patternfly-docs-index with query params', async () => {
    const uri = 'patternfly://docs/index?version=v6&category=accessibility&section=components';
    const response = await CLIENT?.send({
      method: 'resources/read',
      params: { uri }
    });
    const content = response?.result.contents[0];

    expect(content.uri).toBe(uri);
    expect(content.text).toContain('PatternFly Documentation Index');
  });

  it('should read a doc through a template', async () => {
    const uri = 'patternfly://docs/button?version=v6&category=react&section=components';
    const response = await CLIENT?.send({
      method: 'resources/read',
      params: { uri }
    });
    const content = response?.result.contents[0];

    expect(content.uri).toBe(uri);
    expect(content.text).toContain('This is a test document for mocking remote HTTP requests');
  });

  it('should read the patternfly-schemas-index', async () => {
    const uri = 'patternfly://schemas/index?version=v6&category=react';
    const response = await CLIENT?.send({
      method: 'resources/read',
      params: { uri }
    });
    const content = response?.result.contents[0];

    expect(content.uri).toBe(uri);
    expect(content.text).toContain('PatternFly Component JSON Schemas Index');
  });

  it('should read the patternfly-schemas-meta', async () => {
    const uri = 'patternfly://schemas/meta';
    const response = await CLIENT?.send({
      method: 'resources/read',
      params: { uri }
    });
    const content = response?.result.contents[0];

    expect(content.uri).toBe(uri);
    expect(content.text).toContain('PatternFly Component Schemas Index Metadata');
  });
});

describe('Inline tools, HTTP transport', () => {
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

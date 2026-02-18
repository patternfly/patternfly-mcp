/**
 *  Requires: npm run build prior to running Jest.
 * - If typings are needed, use public types from dist to avoid type identity mismatches between src and dist
 * - We're unable to mock fetch for stdio since it runs in a separate process, so we run a server and use that path for mocking external URLs.
 */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  startServer,
  type StdioTransportClient,
  type RpcRequest
} from './utils/stdioTransportClient';
import { setupFetchMock } from './utils/fetchMock';

describe('Builtin tools, STDIO', () => {
  let FETCH_MOCK: Awaited<ReturnType<typeof setupFetchMock>> | undefined;
  let CLIENT: StdioTransportClient;
  let URL_MOCK: string;

  beforeAll(async () => {
    FETCH_MOCK = await setupFetchMock({
      port: 5010,
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

    URL_MOCK = `${FETCH_MOCK?.fixture?.baseUrl}/`;
    CLIENT = await startServer({
      args: [
        '--mode-test-url',
        FETCH_MOCK?.fixture?.baseUrl
      ]
    });
  });

  afterAll(async () => {
    if (CLIENT) {
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
            'documentation:components/README.md'
          ]
        }
      }
    } as RpcRequest;

    const response = await CLIENT.send(req);
    const text = response?.result?.content?.[0]?.text || '';

    expect(text.startsWith('# Documentation')).toBe(true);
    expect(text).toMatchSnapshot();
  });

  it('should concatenate headers and separator with two remote files', async () => {
    const req = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'usePatternFlyDocs',
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

    expect(text.startsWith('# Documentation')).toBe(true);
    expect(text).toMatchSnapshot();
  });
});

describe('Builtin resources, STDIO', () => {
  let FETCH_MOCK: Awaited<ReturnType<typeof setupFetchMock>> | undefined;
  let CLIENT: StdioTransportClient;

  beforeAll(async () => {
    FETCH_MOCK = await setupFetchMock({
      port: 5011,
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
      args: [
        '--mode-test-url',
        FETCH_MOCK?.fixture?.baseUrl
      ]
    });
  });

  afterAll(async () => {
    if (CLIENT) {
      await CLIENT.close();
    }

    if (FETCH_MOCK) {
      await FETCH_MOCK.cleanup();
    }
  });

  it('should expose expected resources and templates', async () => {
    const resources = await CLIENT.send({ method: 'resources/list' });
    const updatedResources = resources?.result?.resources || [];
    const resourceNames = updatedResources.map((resource: any) => resource.uri).sort();

    const templates = await CLIENT.send({ method: 'resources/templates/list' });
    const updatedTemplates = templates?.result?.resourceTemplates || [];
    const templateNames = updatedTemplates.map((template: any) => template.uriTemplate).sort();

    expect(resourceNames).toContain('patternfly://context');
    expect(templateNames).toContain('patternfly://components/index{?version,section,category}');
  });

  it('should read the patternfly-context resource', async () => {
    const response = await CLIENT.send({
      method: 'resources/read',
      params: { uri: 'patternfly://context' }
    });
    const content = response?.result.contents[0];

    expect(content.text).toContain('PatternFly is an open-source design system');
    expect(content.mimeType).toBe('text/markdown');
  });

  it('should read the patternfly-docs-index', async () => {
    const response = await CLIENT.send({
      method: 'resources/read',
      params: { uri: 'patternfly://docs/index' }
    });
    const content = response?.result.contents[0];

    expect(content.uri).toBe('patternfly://docs/index');
    expect(content.text).toContain('PatternFly Documentation Index');
  });

  it('should read a doc through a template', async () => {
    const response = await CLIENT.send({
      method: 'resources/read',
      params: { uri: 'patternfly://docs/Button' }
    });
    const content = response?.result.contents[0];

    expect(content.uri).toBe('patternfly://docs/Button');
    expect(content.text).toContain('This is a test document for mocking remote HTTP requests');
  });

  it('should read the patternfly-schemas-index', async () => {
    const response = await CLIENT.send({
      method: 'resources/read',
      params: { uri: 'patternfly://schemas/index' }
    });
    const content = response?.result.contents[0];

    expect(content.uri).toBe('patternfly://schemas/index');
    expect(content.text).toContain('PatternFly Component Names Index');
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
    const echoBasicFileUrl = pathToFileURL(resolve(process.cwd(), 'tests/e2e/__fixtures__/tool.echoBasic.js')).href;
    const echoBasicErrorFileUrl = pathToFileURL(resolve(process.cwd(), 'tests/e2e/__fixtures__/tool.echoBasicError.js')).href;
    const echoToolHelperFileUrl = pathToFileURL(resolve(process.cwd(), 'tests/e2e/__fixtures__/tool.echoToolHelper.js')).href;

    CLIENT = await startServer({
      args: [
        '--log-stderr',
        '--plugin-isolation',
        'strict',
        '--tool',
        echoBasicFileUrl,
        '--tool',
        echoBasicErrorFileUrl,
        '--tool',
        echoToolHelperFileUrl
      ]
    });
  });

  afterEach(async () => CLIENT.stop());

  itSkip(envNodeVersion >= 22)('should access new tools', async () => {
    const req = {
      method: 'tools/list',
      params: {}
    };

    const resp = await CLIENT.send(req);
    const names = (resp?.result?.tools || []).map((tool: any) => tool.name);

    expect(CLIENT.logs().join(',')).toContain('Registered tool: echo_basic_tool');
    expect(names).toContain('echo_basic_tool');

    expect(CLIENT.logs().join(',')).toContain('No usable tool creators found from module.');

    expect(CLIENT.logs().join(',')).toContain('Registered tool: echo_createMcp_tool');
    expect(names).toContain('echo_createMcp_tool');
  });

  itSkip(envNodeVersion <= 20)('should fail to access a new tool', async () => {
    const req = {
      method: 'tools/list',
      params: {}
    };

    await CLIENT.send(req);

    expect(CLIENT.logs().join(',')).toContain('External tool plugins require Node >= 22; skipping file-based tools.');
  });

  itSkip(envNodeVersion >= 22).each([
    {
      description: 'echo basic tool',
      name: 'echo_basic_tool',
      args: { type: 'echo', lorem: 'ipsum', dolor: 'sit amet' }
    },
    {
      description: 'echo create MCP tool',
      name: 'echo_createMcp_tool',
      args: { type: 'echo', lorem: 'ipsum', dolor: 'sit amet' }
    }
  ])('should interact with a tool, $description', async ({ name, args }) => {
    const req = {
      method: 'tools/call',
      params: {
        name,
        arguments: args
      }
    };

    const resp: any = await CLIENT.send(req);

    expect(resp.result).toMatchSnapshot();
    expect(resp.result.isError).toBeUndefined();
  });

  itSkip(envNodeVersion <= 20).each([
    {
      description: 'echo basic tool',
      name: 'echo_basic_tool',
      args: { type: 'echo', lorem: 'ipsum', dolor: 'sit amet' }
    },
    {
      description: 'echo create MCP tool',
      name: 'echo_createMcp_tool',
      args: { type: 'echo', lorem: 'ipsum', dolor: 'sit amet' }
    }
  ])('should fail to interact with a tool, $description', async ({ name, args }) => {
    const req = {
      method: 'tools/call',
      params: {
        name,
        arguments: args
      }
    };

    const resp: any = await CLIENT.send(req);

    expect(resp.result.isError).toBe(true);
  });
});

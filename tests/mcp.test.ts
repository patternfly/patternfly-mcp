/**
 *  Requires: npm run build prior to running Jest.
 */

import { startServer, type StdioClient } from './utils/stdioClient';
import { loadFixture, startHttpFixture } from './utils/httpFixtureServer';

describe('PatternFly MCP', () => {
  let client: StdioClient;

  beforeEach(async () => {
    client = await startServer();
  });

  afterEach(async () => client.stop());

  it('should concatenate headers and separator with two local files', async () => {
    const req = {
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

    const resp = await client.send(req);
    const text = resp?.result?.content?.[0]?.text || '';

    expect(text.startsWith('# Documentation from')).toBe(true);
    expect(text).toMatchSnapshot();
  });

  it('should expose expected tools and stable shape', async () => {
    const resp = await client.send({ method: 'tools/list' });
    const tools = resp?.result?.tools || [];
    const toolNames = tools.map(tool => tool.name).sort();

    expect(toolNames).toEqual(expect.arrayContaining(['usePatternFlyDocs', 'fetchDocs']));
    expect({ toolNames }).toMatchSnapshot();
  });
});

describe('Hosted mode, --docs-host', () => {
  let client: StdioClient;

  beforeEach(async () => {
    client = await startServer({ args: ['--docs-host'] });
  });

  afterEach(async () => client.stop());

  it('should read llms-files and includes expected tokens', async () => {
    const req = {
      method: 'tools/call',
      params: {
        name: 'usePatternFlyDocs',
        arguments: { urlList: ['react-core/6.0.0/llms.txt'] }
      }
    };
    const resp = await client.send(req);
    const text = resp?.result?.content?.[0]?.text || '';

    expect(text.startsWith('# Documentation from')).toBe(true);
    expect(text.includes('react-core')).toBe(true);
    expect(text.split(/\n/g).filter(Boolean).splice(1)).toMatchSnapshot();
  });
});

describe('External URLs', () => {
  let fixture: { baseUrl: string; close: () => Promise<void>; };
  let url: string;
  let client: StdioClient;

  beforeEach(async () => {
    client = await startServer();
  });

  afterEach(async () => client.stop());

  beforeAll(async () => {
    const body = loadFixture('README.md');

    fixture = await startHttpFixture({
      routes: {
        '/readme': {
          status: 200,
          headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
          body
        }
      }
    });
    url = `${fixture.baseUrl}/readme`;
  });

  afterAll(async () => {
    await fixture.close();
  });

  it('should fetch a document', async () => {
    const req = {
      method: 'tools/call',
      params: { name: 'fetchDocs', arguments: { urlList: [url] } }
    };
    const resp = await client.send(req, { timeoutMs: 10000 });
    const text = resp?.result?.content?.[0]?.text || '';

    expect(text.startsWith('# Documentation from')).toBe(true);
    expect(/patternfly/i.test(text)).toBe(true);
    expect(text.split(/\n/g).filter(Boolean).splice(1)).toMatchSnapshot();
  });
});

import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  generateMarkdownTable,
  generateMetaContent,
  getUriVariations,
  setMetadataOptions,
  getUriBreakdown,
  setMetaResources
} from '../server.resourceMeta';

describe('generateMarkdownTable', () => {
  it.each([
    {
      description: 'simple table',
      headers: ['Col1', 'Col2'],
      rows: [['Val1', 'Val2'], ['Val3', 'Val4']],
      options: {}
    },
    {
      description: 'with wrapped contents',
      headers: ['Param', 'Values'],
      rows: [['p1', ['v1', 'v2']]],
      options: { wrapContents: [true, true] }
    }
  ])('should generate a markdown table, $description', ({ headers, rows, options }) => {
    expect(generateMarkdownTable(headers, rows as any, options)).toMatchSnapshot();
  });
});

describe('generateMetaContent', () => {
  it('should generate standardized meta content', () => {
    const content = generateMetaContent({
      title: 'Test Title',
      description: 'Test Description',
      params: [{ name: 'category', values: ['c1', 'c2'], description: 'Filter by category' }],
      exampleUris: [{ label: 'Base', uri: 'test://uri' }]
    });

    expect(content).toContain('# Test Title');
    expect(content).toContain('## Available Parameters');
    expect(content).toContain('## Available Patterns');
    expect(content).toMatchSnapshot('meta-content');
  });
});

describe('getUriVariations', () => {
  it.each([
    {
      baseUri: 'test://uri',
      params: ['v1', 'v2'],
      allCombos: false
    },
    {
      baseUri: 'test://uri',
      params: ['v1'],
      allCombos: true
    }
  ])('should get URI variations, allCombos=$allCombos', ({ baseUri, params, allCombos }) => {
    expect(getUriVariations(baseUri, params, allCombos)).toMatchSnapshot();
  });
});

describe('setMetadataOptions', () => {
  it('should return default metadata options', async () => {
    const options = setMetadataOptions({
      name: 'test',
      baseUri: 'test://uri',
      searchParams: [],
      config: { title: 'Test Config' } as any,
      metaConfig: {},
      complete: undefined,
      registerAllSearchCombinations: undefined
    });

    expect(options.metaName).toBe('test-meta');
    expect(options.metaTitle).toBe('Test Config Metadata');
    expect(typeof options.metaHandler).toBe('function');

    const content = await options.metaHandler('v6');

    expect(content).toContain('# Test Config Metadata');
  });
});

describe('getUriBreakdown', () => {
  it.each([
    {
      description: 'static URI',
      uriOrTemplate: 'test://uri',
      configUri: undefined,
      complete: undefined,
      expected: { isMetaTemplate: false, metaUri: 'test://uri/meta' }
    },
    {
      description: 'template URI',
      uriOrTemplate: 'test://uri{?version}',
      configUri: undefined,
      complete: { version: jest.fn() },
      expected: { isMetaTemplate: true, metaUri: 'test://uri/meta{?version}' }
    }
  ])('should breakdown URI, $description', ({ uriOrTemplate, configUri, complete, expected }) => {
    const result = getUriBreakdown({ uriOrTemplate, configUri, complete } as any);

    expect(result.isMetaTemplate).toBe(expected.isMetaTemplate);
    expect(result.metaUri).toBe(expected.metaUri);
  });
});

describe('setMetaResources', () => {
  it.each([
    {
      description: 'metaConfig is undefined',
      uri: 'test://uri',
      metaConfig: undefined,
      expected: 'test://uri'
    },
    {
      description: 'metaConfig is empty',
      uri: 'test://uri',
      metaConfig: {},
      expected: 'test://uri/meta'
    },
    {
      description: 'metaConfig is unique',
      uri: 'test://uri',
      metaConfig: {
        uri: 'test://lorem-ipsum/meta'
      },
      expected: 'test://lorem-ipsum/meta'
    },
    {
      description: 'metaConfig is almost a template',
      uri: 'test://uri{?version}',
      metaConfig: {
        uri: 'test://lorem-ipsum/meta'
      },
      expected: 'test://lorem-ipsum/meta'
    },
    {
      description: 'metaConfig is a template string',
      uri: 'test://uri{?version}',
      complete: undefined,
      metaConfig: {},
      expected: 'test://uri/meta{?version}'
    },
    {
      description: 'metaConfig is a template',
      uri: new ResourceTemplate('test://uri{?version}', {
        list: undefined
      }),
      complete: { version: jest.fn() },
      metaConfig: {},
      expected: 'test://uri/meta{?version}'
    }
  ])('should attempt to return a resource, $description', ({ uri, complete, metaConfig, expected }) => {
    const callback = jest.fn();
    const resource = () => [
      'test-resource',
      uri,
      { title: 'Test', description: 'Test' },
      callback,
      { metaConfig, complete }
    ];

    const metaResource: any = setMetaResources([resource] as any)[0];
    const response = metaResource();

    expect(JSON.stringify(response[1])).toContain(expected);
    expect(response).toMatchSnapshot();
  });
});

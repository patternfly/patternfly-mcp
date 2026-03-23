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

    const content = await options.metaHandler({ version: 'v6' });

    expect(content).toContain('# Test Config Metadata');
  });

  it('should merge values from multiple complete callbacks', async () => {
    const completeVersion = jest.fn().mockResolvedValue(['v1']);
    const completeCategory = jest.fn().mockResolvedValue(['cat1']);
    const options = setMetadataOptions({
      name: 'test',
      baseUri: 'test://uri',
      searchParams: [],
      config: { title: 'Test Multiple Callbacks' } as any,
      metaConfig: {},
      complete: { version: completeVersion, category: completeCategory },
      registerAllSearchCombinations: undefined
    });

    const content = await options.metaHandler({});

    expect(completeVersion).toHaveBeenCalledTimes(1);
    expect(completeCategory).toHaveBeenCalledTimes(1);
    expect(content).toContain('version');
    expect(content).toContain('category');
    expect(content).toContain('v1');
    expect(content).toContain('cat1');
  });

  it('should fall back to empty values when a complete callback throws', async () => {
    const throwingComplete = jest.fn().mockRejectedValue(new Error('network error'));
    const options = setMetadataOptions({
      name: 'test',
      baseUri: 'test://uri',
      searchParams: [],
      config: { title: 'Test Config' } as any,
      metaConfig: {},
      complete: { version: throwingComplete },
      registerAllSearchCombinations: undefined
    });

    const content = await options.metaHandler({ version: 'v6' });

    expect(content).toContain('# Test Config Metadata');
    expect(throwingComplete).toHaveBeenCalledTimes(1);
  });
});

describe('getUriBreakdown', () => {
  it.each([
    {
      description: 'static URI',
      uriOrTemplate: 'test://uri',
      configUri: undefined,
      expected: {
        isMetaTemplate: false,
        metaBaseUri: 'test://uri/meta',
        metaUri: 'test://uri/meta'
      }
    },
    {
      description: 'template URI',
      uriOrTemplate: 'test://uri{?version}',
      configUri: undefined,
      expected: {
        isMetaTemplate: true,
        metaBaseUri: 'test://uri/meta',
        metaUri: 'test://uri/meta{?version}'
      }
    },
    {
      description: 'configUri provided overrides derived meta URI',
      uriOrTemplate: 'test://uri{?version}',
      configUri: 'test://custom/meta{?version}',
      expected: {
        isMetaTemplate: true,
        metaBaseUri: 'test://custom/meta',
        metaUri: 'test://custom/meta{?version}'
      }
    },
    {
      description: 'searchFields provided, empty fields',
      uriOrTemplate: 'test://uri{?version}',
      configUri: 'test://custom/meta{?version}',
      searchFields: [],
      expected: {
        isMetaTemplate: false,
        metaBaseUri: 'test://custom/meta',
        metaUri: 'test://custom/meta'
      }
    },
    {
      description: 'searchFields provided, added field',
      uriOrTemplate: 'test://uri{?version}',
      configUri: 'test://custom/meta{?version}',
      searchFields: ['category'],
      expected: {
        isMetaTemplate: true,
        metaBaseUri: 'test://custom/meta',
        metaUri: 'test://custom/meta{?category}'
      }
    }
  ])('should breakdown URI, $description', ({ uriOrTemplate, configUri, searchFields, expected }) => {
    const result = getUriBreakdown({ uriOrTemplate, configUri, searchFields } as any);

    expect(result.metaBaseUri).toBe(expected.metaBaseUri);
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
      description: 'metaConfig is a template string with complete undefined',
      uri: 'test://uri{?version}',
      complete: undefined,
      metaConfig: {},
      expected: 'test://uri/meta'
    },
    {
      description: 'metaConfig is a template string with complete',
      uri: 'test://uri{?version}',
      complete: { version: jest.fn() },
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

  it('should append meta content to original resource read result', async () => {
    const originalContent = {
      contents: [{ uri: 'test://uri', mimeType: 'text/markdown', text: 'original' }]
    };
    const callback = jest.fn().mockResolvedValue(originalContent);
    const resource = () => [
      'test-resource',
      'test://uri',
      { title: 'Test', description: 'Test' },
      callback,
      { metaConfig: {} }
    ];

    const [, enhancedResource]: any = setMetaResources([resource] as any);
    const [, , , enhancedCallback] = enhancedResource();
    const result = await enhancedCallback(new URL('test://uri'), {});

    expect(callback).toHaveBeenCalledTimes(1);
    expect(result.contents).toHaveLength(2);
    expect(result.contents[0]).toBe(originalContent.contents[0]);
    expect(result.contents[0].text).toBe('original');
    expect(result.contents[1].text).toContain('Test Metadata');
  });
});

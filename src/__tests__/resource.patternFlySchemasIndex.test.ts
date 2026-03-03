import { patternFlySchemasIndexResource } from '../resource.patternFlySchemasIndex';
import { isPlainObject } from '../server.helpers';

jest.mock('../server.caching', () => ({
  memo: jest.fn(fn => fn)
}));

jest.mock('../api.client', () => ({
  getComponentList: Object.assign(
    jest.fn(async () => ['Alert', 'Button', 'Card', 'Table']),
    { memo: jest.fn(async () => ['Alert', 'Button', 'Card', 'Table']) }
  ),
  getComponentInfo: Object.assign(
    jest.fn(async (name: string) => ({
      name,
      section: 'components',
      page: name.toLowerCase(),
      tabs: ['react'],
      hasProps: name !== 'Card',
      hasCss: false,
      exampleCount: 0
    })),
    {
      memo: jest.fn(async (name: string) => ({
        name,
        section: 'components',
        page: name.toLowerCase(),
        tabs: ['react'],
        hasProps: name !== 'Card',
        hasCss: false,
        exampleCount: 0
      }))
    }
  )
}));

describe('patternFlySchemasIndexResource', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should have a consistent return structure', () => {
    const resource = patternFlySchemasIndexResource();

    expect({
      name: resource[0],
      uri: resource[1],
      config: isPlainObject(resource[2]),
      handler: resource[3]
    }).toMatchSnapshot('structure');
  });
});

describe('patternFlySchemasIndexResource, callback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return only components with props', async () => {
    const [_name, _uri, _config, callback] = patternFlySchemasIndexResource();
    const result = await callback();

    expect(result.contents).toBeDefined();
    expect(Object.keys(result.contents[0])).toEqual(['uri', 'mimeType', 'text']);
    expect(result.contents[0].text).toContain('# PatternFly Component Schemas Index');
    expect(result.contents[0].text).toContain('Alert');
    expect(result.contents[0].text).toContain('Button');
    expect(result.contents[0].text).not.toContain('Card');
    expect(result.contents[0].text).toContain('Table');
  });
});

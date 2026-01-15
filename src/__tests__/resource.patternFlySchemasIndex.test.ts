import { patternFlySchemasIndexResource } from '../resource.patternFlySchemasIndex';
import { isPlainObject } from '../server.helpers';

// Mock dependencies
jest.mock('../tool.searchPatternFlyDocs', () => ({
  componentNames: ['Button', 'Card', 'Table']
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

  it.each([
    {
      description: 'default',
      args: []
    }
  ])('should return component schemas index, $description', async ({ args }) => {
    const [_name, _uri, _config, callback] = patternFlySchemasIndexResource();
    const result = await callback(...args);

    expect(result.contents).toBeDefined();
    expect(Object.keys(result.contents[0])).toEqual(['uri', 'mimeType', 'text']);
    expect(result.contents[0].text).toContain('# PatternFly Component Names Index');
  });
});

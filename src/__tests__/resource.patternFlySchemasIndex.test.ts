import { patternFlySchemasIndexResource, listResources } from '../resource.patternFlySchemasIndex';
import { isPlainObject } from '../server.helpers';

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

describe('listResources', () => {
  it('should return a list of resources', async () => {
    const resources = await listResources();

    expect(resources.resources).toBeDefined();

    const everyResourceSameProperties = resources.resources.every((obj: any) =>
      Boolean(obj.uri) &&
      /^patternfly:\/\/schemas\//.test(obj.uri) &&
      Boolean(obj.name) &&
      Boolean(obj.mimeType) &&
      Boolean(obj.description));

    expect(everyResourceSameProperties).toBe(true);
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
    expect(result.contents[0].text).toContain('# PatternFly Component JSON Schemas Index');
  });
});

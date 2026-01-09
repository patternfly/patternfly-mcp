import { patternFlyContextResource } from '../resource.patternFlyContext';
import { isPlainObject } from '../server.helpers';

describe('patternFlyContextResource', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should have a consistent return structure', () => {
    const resource = patternFlyContextResource();

    expect({
      name: resource[0],
      uri: resource[1],
      config: isPlainObject(resource[2]),
      handler: resource[3]
    }).toMatchSnapshot('structure');
  });
});

describe('patternFlyContextResource, callback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    {
      description: 'default',
      args: []
    }
  ])('should return context content, $description', async ({ args }) => {
    const [_name, _uri, _config, callback] = patternFlyContextResource();
    const result = await callback(...args);

    expect(result.contents).toBeDefined();
    expect(Object.keys(result.contents[0])).toEqual(['uri', 'mimeType', 'text']);
  });
});

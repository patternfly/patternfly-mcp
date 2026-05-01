import {
  patternFlyContextResource,
  resourceCallback
} from '../resource.patternFlyContext';
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

describe('resourceCallback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    {
      description: 'default',
      expected: 'Troubleshooting'
    }
  ])('should return context content, $description', async ({ expected }) => {
    const result = await resourceCallback(undefined as any);

    expect(result.contents).toBeDefined();
    expect(Object.keys(result.contents[0] as any)).toEqual(['uri', 'mimeType', 'text']);
    expect(result.contents[0]?.text).toContain(expected);
  });
});

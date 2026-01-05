import { patternFlyDocsIndexResource } from '../resource.patternFlyDocsIndex';
import { getLocalDocs } from '../docs.local';
import { isPlainObject } from '../server.helpers';

// Mock dependencies
jest.mock('../docs.local');

const mockGetLocalDocs = getLocalDocs as jest.MockedFunction<typeof getLocalDocs>;

describe('patternFlyDocsIndexResource', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetLocalDocs.mockReturnValue(['[@patternfly/react-guidelines](./guidelines/README.md)']);
  });

  it('should have a consistent return structure', () => {
    const resource = patternFlyDocsIndexResource();

    expect({
      name: resource[0],
      uri: resource[1],
      config: isPlainObject(resource[2]),
      handler: resource[3]
    }).toMatchSnapshot('structure');
  });
});

describe('patternFlyDocsIndexResource, callback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetLocalDocs.mockReturnValue(['[@patternfly/react-guidelines](./guidelines/README.md)']);
  });

  it.each([
    {
      description: 'default',
      args: []
    }
  ])('should return context content, $description', async ({ args }) => {
    const [_name, _uri, _config, callback] = patternFlyDocsIndexResource();
    const result = await callback(...args);

    expect(result.contents).toBeDefined();
    expect(Object.keys(result.contents[0])).toEqual(['uri', 'mimeType', 'text']);
    expect(result.contents[0].text).toContain('[@patternfly/react-guidelines](./guidelines/README.md)');
  });
});

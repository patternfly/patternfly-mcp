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
    },
    {
      description: 'contextManagement enabled',
      options: {
        contextManagement: true,
        experimental: ['contextManagement'],
        mode: 'test',
        version: '1.0.0',
        nodeVersion: 22
      },
      expected: [
        'search, list and access',
        'list and access available documentation resources',
        'Active Experimental Features',
        'contextManagement'
      ]
    }
  ])('should return context content, $description', async ({ options, expected }) => {
    const result = await resourceCallback(new URL('patternfly://context'), options as any);

    expect(result.contents).toBeDefined();
    const text = result.contents[0]?.text;

    if (Array.isArray(expected)) {
      expected.forEach(snippet => expect(text).toContain(snippet));
    } else {
      expect(text).toContain(expected);
    }
  });
});

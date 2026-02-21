import { patternFlyDocsIndexResource, listResources, uriVersionComplete } from '../resource.patternFlyDocsIndex';
import { isPlainObject } from '../server.helpers';
import { DEFAULT_OPTIONS } from '../options.defaults';

describe('patternFlyDocsIndexResource', () => {
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

describe('listResources', () => {
  it('should return a list of resources', async () => {
    const resources = await listResources();

    expect(resources.resources).toBeDefined();

    const everyResourceSameProperties = resources.resources.every((obj: any) =>
      Boolean(obj.uri) &&
      /^patternfly:\/\/docs\//.test(obj.uri) &&
      Boolean(obj.name) &&
      Boolean(obj.mimeType) &&
      Boolean(obj.description));

    expect(everyResourceSameProperties).toBe(true);
  });
});

describe('uriVersionComplete', () => {
  it('should attempt to return enumerated PatternFly versions', async () => {
    await expect(uriVersionComplete('')).resolves.toEqual(expect.arrayContaining([
      ...DEFAULT_OPTIONS.patternflyOptions.availableSearchVersions
    ]));
  });
});

describe('patternFlyDocsIndexResource, callback', () => {
  it.each([
    {
      description: 'default',
      args: []
    }
  ])('should return context content, $description', async ({ args }) => {
    const [_name, _uri, _config, callback] = (patternFlyDocsIndexResource as any)();
    const result = await (callback as any)(...args);

    expect(result.contents).toBeDefined();
    expect(Object.keys(result.contents[0])).toEqual(['uri', 'mimeType', 'text']);
    expect(result.contents[0].text).toContain('[AboutModal - Design Guidelines, Accessibility, Examples');
  });
});

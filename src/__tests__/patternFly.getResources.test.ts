import {
  setCategoryDisplayLabel,
  getPatternFlyComponentSchema,
  getPatternFlyComponentNames,
  mutateKeyWordsMap,
  getPatternFlyMcpResources
} from '../patternFly.getResources';

describe('setCategoryDisplayLabel', () => {
  it.each([
    {
      description: 'empty string',
      entry: ''
    },
    {
      description: 'undefined',
      entry: undefined
    },
    {
      description: 'null',
      entry: null
    },
    {
      description: 'design',
      entry: {
        displayName: 'Lorem Ipsum',
        section: 'components',
        category: 'design-guidelines',
        path: 'https://www.patternfly.org/v6/components/lorem-ipsum/design-guidelines'
      }
    },
    {
      description: 'accessibility',
      entry: {
        displayName: 'Dolor Sit',
        section: 'components',
        category: 'accessibility',
        path: 'https://www.patternfly.org/v6/components/dolor-sit/accessibility'
      }
    },
    {
      description: 'example',
      entry: {
        displayName: 'Lorem Sit',
        section: 'components',
        category: 'react',
        path: 'https://www.patternfly.org/v6/components/lorem-sit/components'
      }
    },
    {
      description: 'guidelines',
      entry:
        {
          displayName: 'Sit Sit',
          section: 'guidelines',
          category: 'react',
          path: 'documentation:components/sit-sit/guidelines.md'
        }
    }
  ])('should normalize categories and apply linking markdown, $description', ({ entry }) => {
    expect(setCategoryDisplayLabel(entry as any)).toMatchSnapshot();
  });
});

describe('getPatternFlyComponentSchema', () => {
  it.each([
    {
      description: 'default',
      componentName: 'Button',
      expected: true
    },
    {
      description: 'unknown component',
      componentName: 'Lorem',
      expected: false
    }
  ])('should attempt to return a schema', async ({ componentName, expected }) => {
    const output = await getPatternFlyComponentSchema(componentName);

    expect(Boolean(output)).toBe(expected);
  });

  it('should have a memoized property', () => {
    expect(getPatternFlyComponentSchema).toHaveProperty('memo');
  });
});

describe('getPatternFlyComponentNames', () => {
  it('should return multiple organized facets', async () => {
    const result = await getPatternFlyComponentNames();

    expect(Object.keys(result)).toMatchSnapshot('properties');
  });

  it('should have a memoized property', () => {
    expect(getPatternFlyComponentNames).toHaveProperty('memo');
  });
});

describe('mutateKeyWordsMap', () => {
  it.each([
    {
      description: 'blocklist is prioritized over exception for split tokens',
      params: {
        keyword: 'component cli tooling',
        name: 'resource',
        version: 'v1'
      },
      settings: {
        blockList: ['component'],
        exceptionList: ['component', 'cli']
      }
    },
    {
      description: 'exception keeps length token when not blocked',
      params: {
        keyword: 'cli guidelines',
        name: 'resource',
        version: 'v1'
      },
      settings: undefined
    },
    {
      description: 'word length filter combined with blocklist',
      params: {
        keyword: 'cli or guidelines',
        name: 'resource',
        version: 'v1'
      },
      settings: {
        blockList: ['cli', 'guidelines'],
        lengthFilter: 2
      }
    }
  ])('should handle filtering keywords map, $description', ({ params, settings }) => {
    const keywordsMap = new Map();

    mutateKeyWordsMap(keywordsMap, params, settings);

    expect(Object.keys(Object.fromEntries(keywordsMap))).toMatchSnapshot();
  });
});

describe('getPatternFlyMcpResources', () => {
  it('should return multiple organized facets', async () => {
    const result = await getPatternFlyMcpResources();

    expect(Object.keys(result)).toMatchSnapshot('properties');
  });

  it('should have a memoized property', async () => {
    expect(getPatternFlyMcpResources).toHaveProperty('memo');
  });
});

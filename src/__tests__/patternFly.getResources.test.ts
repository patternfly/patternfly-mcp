import {
  setCategoryDisplayLabel,
  getPatternFlyComponentSchema,
  getPatternFlyReactComponentNames,
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

describe('getPatternFlyReactComponentNames', () => {
  it('should return multiple organized facets', async () => {
    const result = await getPatternFlyReactComponentNames();

    expect(Object.keys(result)).toMatchSnapshot('properties');
  });

  it('should have a memoized property', () => {
    expect(getPatternFlyReactComponentNames).toHaveProperty('memo');
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

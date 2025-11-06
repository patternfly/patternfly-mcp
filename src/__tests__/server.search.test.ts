import { normalizeString, fuzzySearch, findClosest } from '../server.search';

describe('normalizeString', () => {
  it('should normalize a string', () => {
    expect(normalizeString('résumé')).toBe(normalizeString('resume'));
  });

  it('should have memo property', () => {
    expect(normalizeString.memo).toBeDefined();
  });
});

describe('findClosest', () => {
  const components = ['Button', 'ButtonGroup', 'Badge', 'BadgeGroup', 'Alert', 'AlertGroup'];

  it.each([
    {
      description: 'undefined items',
      query: 'Button',
      items: undefined
    },
    {
      description: 'null items',
      query: 'Button',
      items: null
    },
    {
      description: 'empty haystack',
      query: 'Button',
      items: []
    },
    {
      description: 'empty needle',
      query: '',
      items: components
    },
    {
      description: 'non-existent needle',
      query: 'lorem',
      items: components
    },
    {
      description: 'non-existent needle with case insensitive search',
      query: 'LOREM',
      items: components
    },
    {
      description: 'exact match',
      query: 'Alert',
      items: components
    },
    {
      description: 'partial query',
      query: 'but',
      items: components
    },
    {
      description: 'typo',
      query: 'buton',
      items: components
    },
    {
      description: 'multiple matches',
      query: 'badge',
      items: components
    },
    {
      description: 'multiple matches with case insensitive search',
      query: 'BADGE',
      items: components
    },
    {
      description: 'match spacing',
      query: 'dolor sit',
      items: ['sit', 'dolor', 'dolor sit']
    },
    {
      description: 'all empty string items',
      query: 'test',
      items: ['', '', '']
    }
  ])('should attempt to find a closest match, $description', ({ query, items }) => {
    expect({
      query,
      match: findClosest(query, items as string[])
    }).toMatchSnapshot();
  });

  it('should handle normalizeFn errors in findClosest', () => {
    const throwingNormalizeFn = () => {
      throw new Error('Normalization failed');
    };

    expect(() => {
      findClosest('button', ['Button', 'Badge'], { normalizeFn: throwingNormalizeFn });
    }).toThrow('Normalization failed');
  });
});

describe('fuzzySearch', () => {
  const components = ['Button', 'ButtonGroup', 'Badge', 'BadgeGroup', 'Alert', 'AlertGroup', 'Card', 'CardHeader'];

  it.each([
    {
      description: 'undefined items',
      query: 'Button',
      items: undefined,
      options: undefined
    },
    {
      description: 'null items',
      query: 'Button',
      items: null,
      options: undefined
    },
    {
      description: 'exact match',
      query: 'Button',
      items: components,
      options: undefined
    },
    {
      description: 'exact match case-insensitive',
      query: 'button',
      items: components,
      options: undefined
    },
    {
      description: 'prefix match',
      query: 'but',
      items: components,
      options: undefined
    },
    {
      description: 'prefix match multiple',
      query: 'butt',
      items: components,
      options: {
        maxDistance: 10
      }
    },
    {
      description: 'contains match multiple',
      query: 'roup',
      items: components,
      options: {
        maxDistance: 10
      }
    },
    {
      description: 'fuzzy match within distance',
      query: 'button',
      items: components,
      options: {
        maxDistance: 10,
        isExactMatch: false,
        isPrefixMatch: false,
        isSuffixMatch: false,
        isContainsMatch: false,
        isFuzzyMatch: true
      }
    },
    {
      description: 'match within max results',
      query: 'a',
      items: components,
      options: {
        maxDistance: 10,
        maxResults: 2,
        isFuzzyMatch: true
      }
    },
    {
      description: 'match within restricted distance',
      query: 'button',
      items: components,
      options: {
        maxDistance: 1
      }
    },
    {
      description: 'empty query',
      query: '',
      items: components,
      options: {
        isFuzzyMatch: true
      }
    },
    {
      description: 'empty query extended distance',
      query: '',
      items: components,
      options: {
        maxDistance: 20,
        isFuzzyMatch: true
      }
    },
    {
      description: 'trimmed query',
      query: ' button  ',
      items: components,
      options: undefined
    },
    {
      description: 'empty items',
      query: 'button',
      items: [],
      options: undefined
    },
    {
      description: 'single item',
      query: 'button',
      items: ['BUTTON'],
      options: undefined
    },
    {
      description: 'multiple words maxDistance',
      query: 'ipsum dolor',
      items: ['Lorem Ipsum Dolor Sit'],
      options: {
        maxDistance: 10
      }
    },
    {
      description: 'multiple words',
      query: 'badge   group',
      items: ['BadgeGroup'],
      options: {
        isFuzzyMatch: true,
        maxDistance: 2
      }
    },
    {
      description: 'negative maxDistance',
      query: 'button',
      items: ['Button'],
      options: {
        maxDistance: -1
      }
    },
    {
      description: 'empty query against maxDistance',
      query: '',
      items: ['A', 'AB', 'ABCDE', 'ABCDEFG'],
      options: {
        maxDistance: 3,
        isFuzzyMatch: true
      }
    },
    {
      description: 'length-delta precheck for maxDistance',
      query: 'AB',
      items: ['ABCDEFGH'],
      options: {
        maxDistance: 2,
        isExactMatch: false,
        isPrefixMatch: false,
        isSuffixMatch: false,
        isFuzzyMatch: true
      }
    },
    {
      description: 'duplicate items',
      query: 'button',
      items: ['Button', 'Button', 'Button'],
      options: {
        maxDistance: 10
      }
    },
    {
      description: 'suffix match',
      query: 'header',
      items: ['Card', 'CardHeader'],
      options: {
        isExactMatch: false,
        isPrefixMatch: false,
        isContainsMatch: false,
        isFuzzyMatch: false
      }
    },
    {
      description: 'mixed types by maxDistance',
      query: 'butto',
      items: ['Button', 'ButtonGroup', 'Burrito'],
      options: {
        maxDistance: 1,
        isFuzzyMatch: true
      }
    },
    {
      description: 'matches are alphabetized',
      query: 'butt',
      items: ['ButtonGroup', 'Button'],
      options: {
        maxDistance: 10
      }
    },
    {
      description: 'matches are normalized',
      query: 'resume',
      items: ['Résumé', 'resume', 'RESUME'],
      options: undefined
    },
    {
      description: 'deduplicate by normalized value',
      query: 'button',
      items: ['Button', 'button', 'BUTTON'],
      options: {
        deduplicateByNormalized: true
      }
    }
  ])('should fuzzy match, $description', ({ query, items, options }) => {
    expect(fuzzySearch(query, items as string[], options)).toMatchSnapshot();
  });

  it('should handle normalizeFn errors in fuzzySearch', () => {
    const throwingNormalizeFn = () => {
      throw new Error('Normalization failed');
    };

    expect(() => {
      fuzzySearch('button', ['Button', 'Badge'], { normalizeFn: throwingNormalizeFn });
    }).toThrow('Normalization failed');
  });
});

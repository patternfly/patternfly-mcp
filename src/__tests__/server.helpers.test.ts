import { generateHash, isPromise, fuzzySearch, findClosest } from '../server.helpers';

describe('generateHash', () => {
  it('should minimally generate a consistent hash', () => {
    expect({
      valueObject: generateHash({ lorem: 'ipsum', dolor: ['sit', null, undefined, 1, () => 'hello world'] }),
      valueObjectConfirm:
        generateHash({ lorem: 'ipsum', dolor: ['sit', null, undefined, 1, () => 'hello world'] }) ===
        generateHash({ lorem: 'ipsum', dolor: ['sit', null, undefined, 1, () => 'hello world'] }),
      valueObjectConfirmSort:
        generateHash({ lorem: 'ipsum', dolor: ['sit', null, undefined, 1, () => 'hello world'] }) ===
        generateHash({ dolor: ['sit', null, undefined, 1, () => 'hello world'], lorem: 'ipsum' }),
      valueInt: generateHash(200),
      valueFloat: generateHash(20.000006),
      valueNull: generateHash(null),
      valueUndefined: generateHash(undefined),
      valueArray: generateHash([1, 2, 3]),
      valueArraySort: generateHash([3, 2, 1]),
      valueArrayConfirmSort: generateHash([1, 2, 3]) !== generateHash([3, 2, 1]),
      valueSet: generateHash(new Set([1, 2, 3])),
      valueSetConfirmSort: generateHash(new Set([1, 2, 3])) === generateHash(new Set([3, 2, 1])),
      valueSymbol: generateHash(Symbol('lorem ipsum')),
      valueSymbolUndefined: generateHash(Symbol('lorem ipsum')) === generateHash(undefined),
      valueBoolTrue: generateHash(true),
      valueBoolFalse: generateHash(false)
    }).toMatchSnapshot('hash, object and primitive values');
  });
});

describe('isPromise', () => {
  it.each([
    {
      description: 'Promise.resolve',
      func: Promise.resolve(),
      value: true
    },
    {
      description: 'async function',
      func: async () => {},
      value: true
    },
    {
      description: 'non-promise',
      func: () => 'lorem',
      value: false
    }
  ])('should determine a promise for $description', ({ func, value }) => {
    expect(isPromise(func)).toBe(value);
  });
});

describe('findClosest', () => {
  const components = ['Button', 'ButtonGroup', 'Badge', 'BadgeGroup', 'Alert', 'AlertGroup'];

  it.each([
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
    }
  ])('should attempt to find a closest match, $description', ({ query, items }) => {
    expect({
      query,
      match: findClosest(query, items)
    }).toMatchSnapshot();
  });
});

describe('fuzzySearch', () => {
  const components = ['Button', 'ButtonGroup', 'Badge', 'BadgeGroup', 'Alert', 'AlertGroup', 'Card', 'CardHeader'];

  it.each([
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
      description: 'multiple words',
      query: 'ipsum dolor',
      items: ['Lorem Ipsum Dolor Sit'],
      options: {
        maxDistance: 10
      }
    }
  ])('should fuzzy match, $description', ({ query, items, options }) => {
    expect(fuzzySearch(query, items, options)).toMatchSnapshot();
  });
});

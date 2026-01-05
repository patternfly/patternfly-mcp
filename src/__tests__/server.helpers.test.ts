import {
  freezeObject,
  generateHash,
  hashCode,
  isPlainObject,
  isPromise,
  isReferenceLike,
  mergeObjects,
  portValid
} from '../server.helpers';

describe('freezeObject', () => {
  it.each([
    {
      description: 'null',
      obj: null
    },
    {
      description: 'undefined',
      obj: undefined
    },
    {
      description: 'plain object',
      obj: { lorem: 'ipsum' }
    },
    {
      description: 'array',
      obj: [1, 2, 3]
    },
    {
      description: 'number',
      obj: 1
    },
    {
      description: 'string',
      obj: 'lorem ipsum'
    },
    {
      description: 'boolean',
      obj: true
    },
    {
      description: 'function',
      obj: () => 'lorem ipsum'
    },
    {
      description: 'symbol',
      obj: Symbol('lorem ipsum')
    },
    {
      description: 'error',
      obj: new Error('lorem ipsum')
    },
    {
      description: 'date',
      obj: new Date('2023-01-01')
    },
    {
      description: 'regex',
      obj: /lorem/g
    },
    {
      description: 'map',
      obj: new Map([['lorem', 1], ['ipsum', 2]])
    },
    {
      description: 'set',
      obj: new Set([1, 2, 3])
    }
  ])('should freeze an object, $description', ({ obj, outcome = true }: any = {}) => {
    expect(Object.isFrozen(freezeObject(obj))).toBe(outcome);
  });
});

describe('generateHash', () => {
  it.each([
    {
      description: 'null',
      value: null,
      comparisonValue: undefined,
      expectedComparison: false,
      expectedUndefined: false
    },
    {
      description: 'undefined',
      value: undefined,
      comparisonValue: null,
      expectedComparison: false,
      expectedUndefined: true
    },
    {
      description: 'string',
      value: 'lorem ipsum',
      comparisonValue: 'ipsum lorem',
      expectedComparison: false,
      expectedUndefined: false
    },
    {
      description: 'number, int',
      value: 200,
      comparisonValue: 200.000006,
      expectedComparison: false,
      expectedUndefined: false
    },
    {
      description: 'number, float',
      value: 200.000006,
      comparisonValue: 200,
      expectedComparison: false,
      expectedUndefined: false
    },
    {
      description: 'number, NaN',
      value: NaN,
      comparisonValue: null,
      expectedComparison: false,
      expectedUndefined: false
    },
    {
      description: 'number, Infinity',
      value: Infinity,
      comparisonValue: null,
      expectedComparison: false,
      expectedUndefined: false
    },
    {
      description: 'number, negative Infinity',
      value: -Infinity,
      comparisonValue: null,
      expectedComparison: false,
      expectedUndefined: false
    },
    {
      description: 'number, negative zero',
      value: -0,
      comparisonValue: 0,
      expectedComparison: false,
      expectedUndefined: false
    },
    {
      description: 'number, negative zero inside array',
      value: [-0],
      comparisonValue: [0],
      expectedComparison: false,
      expectedUndefined: false
    },
    {
      description: 'boolean',
      value: true,
      comparisonValue: false,
      expectedComparison: false,
      expectedUndefined: false
    },
    {
      description: 'bigint',
      value: BigInt(200),
      comparisonValue: BigInt(201),
      expectedComparison: false,
      expectedUndefined: false
    },
    {
      description: 'function',
      value: () => 'lorem ipsum',
      comparisonValue: () => 'ipsum lorem',
      expectedComparison: false,
      expectedUndefined: false
    },
    {
      description: 'symbols, different instances BUT with same string will return the same',
      value: Symbol('lorem ipsum'),
      comparisonValue: Symbol('lorem ipsum'),
      expectedComparison: true,
      expectedUndefined: false
    },
    {
      description: 'symbols, different instances AND with different strings will NOT return the same',
      value: Symbol('lorem ipsum'),
      comparisonValue: Symbol('ipsum lorem'),
      expectedComparison: false,
      expectedUndefined: false
    },
    {
      description: 'array, same order',
      value: [1, 2, 3],
      comparisonValue: [1, 2, 3],
      expectedComparison: true,
      expectedUndefined: false
    },
    {
      description: 'array, reversed order',
      value: [1, 2, 3],
      comparisonValue: [3, 2, 1],
      expectedComparison: false,
      expectedUndefined: false
    },
    {
      description: 'array of objects, same order',
      value: [{ 1: 'lorem' }, { 2: 'ipsum' }],
      comparisonValue: [{ 1: 'lorem' }, { 2: 'ipsum' }],
      expectedComparison: true,
      expectedUndefined: false
    },
    {
      description: 'array of objects, reversed order',
      value: [{ 1: 'lorem' }, { 2: 'ipsum' }],
      comparisonValue: [{ 2: 'ipsum' }, { 1: 'lorem' }],
      expectedComparison: false,
      expectedUndefined: false
    },
    {
      description: 'error',
      value: new Error('lorem ipsum'),
      comparisonValue: new Error('ipsum lorem'),
      expectedComparison: false,
      expectedUndefined: false
    },
    {
      description: 'date',
      value: new Date('2023-01-01'),
      comparisonValue: new Date('2023-01-02'),
      expectedComparison: false,
      expectedUndefined: false
    },
    {
      description: 'regex',
      value: /lorem/g,
      comparisonValue: /ipsum/g,
      expectedComparison: false,
      expectedUndefined: false
    },
    {
      description: 'map, same order',
      value: new Map([['lorem', 1], ['ipsum', 2]]),
      comparisonValue: new Map([['lorem', 1], ['ipsum', 2]]),
      expectedComparison: true,
      expectedUndefined: false
    },
    {
      description: 'map, reversed order',
      value: new Map([['lorem', 1], ['ipsum', 2]]),
      comparisonValue: new Map([['ipsum', 2], ['lorem', 1]]),
      expectedComparison: true,
      expectedUndefined: false
    },
    {
      description: 'map with number vs string number',
      value: new Map([[1, 'a']]),
      comparisonValue: new Map([['1', 'a']]),
      expectedComparison: false,
      expectedUndefined: false
    },
    {
      description: 'map of objects, same order',
      value: new Map([['lorem', { 1: 'lorem' }], ['ipsum', { 2: 'ipsum' }]]),
      comparisonValue: new Map([['lorem', { 1: 'lorem' }], ['ipsum', { 2: 'ipsum' }]]),
      expectedComparison: true,
      expectedUndefined: false
    },
    {
      description: 'map of objects, reversed order',
      value: new Map([['lorem', { 1: 'lorem' }], ['ipsum', { 2: 'ipsum' }]]),
      comparisonValue: new Map([['ipsum', { 2: 'ipsum' }], ['lorem', { 1: 'lorem' }]]),
      expectedComparison: true,
      expectedUndefined: false
    },
    {
      description: 'set, same order',
      value: new Set([1, 2, 3]),
      comparisonValue: new Set([1, 2, 3]),
      expectedComparison: true,
      expectedUndefined: false
    },
    {
      description: 'set, reversed order',
      value: new Set([1, 2, 3]),
      comparisonValue: new Set([3, 2, 1]),
      expectedComparison: true,
      expectedUndefined: false
    },
    {
      description: 'set of objects, same order',
      value: new Set([{ 1: 'lorem' }, { 2: 'ipsum' }]),
      comparisonValue: new Set([{ 1: 'lorem' }, { 2: 'ipsum' }]),
      expectedComparison: true,
      expectedUndefined: false
    },
    {
      description: 'set of objects, reversed order',
      value: new Set([{ 1: 'lorem' }, { 2: 'ipsum' }]),
      comparisonValue: new Set([{ 2: 'ipsum' }, { 1: 'lorem' }]),
      expectedComparison: true,
      expectedUndefined: false
    },
    {
      description: 'plain object',
      value: { lorem: 'ipsum' },
      comparisonValue: { dolor: 'sit amet' },
      expectedComparison: false,
      expectedUndefined: false
    },
    {
      description: 'plain object with nested values, same order',
      value: { lorem: 'ipsum', dolor: ['sit', null, undefined, 1, () => 'sit amet'] },
      comparisonValue: { lorem: 'ipsum', dolor: ['sit', null, undefined, 1, () => 'sit amet'] },
      expectedComparison: true,
      expectedUndefined: false
    },
    {
      description: 'plain object with nested values, reversed order',
      value: { lorem: 'ipsum', dolor: ['sit', null, undefined, 1, () => 'sit amet'] },
      comparisonValue: { dolor: ['sit', null, undefined, 1, () => 'sit amet'], lorem: 'ipsum' },
      expectedComparison: true,
      expectedUndefined: false
    },
    {
      description: 'circular reference',
      value: (() => {
        const obj: any = {};

        obj.a = { b: obj };

        return obj;
      })(),
      comparisonValue: (() => {
        const obj: any = {};

        obj.a = { b: obj };

        return obj;
      })(),
      expectedComparison: true,
      expectedUndefined: false
    }
  ])('should generate a consistent hash, $description', ({ value, comparisonValue, expectedComparison, expectedUndefined }) => {
    expect(generateHash(value) === generateHash(undefined)).toBe(expectedUndefined);
    expect(generateHash(value) === generateHash(comparisonValue)).toBe(expectedComparison);
    expect(generateHash(value)).toMatchSnapshot();
  });
});

describe('hashCode', () => {
  it.each([
    {
      description: 'string',
      param: 'lorem ipsum'
    },
    {
      description: 'number',
      param: 200
    },
    {
      description: 'undefined',
      param: undefined
    },
    {
      description: 'null',
      param: null
    },
    {
      description: 'JSON string',
      param: JSON.stringify({ lorem: 'ipsum' })
    }
  ])('should generate a consistent hash code, $description', ({ param }) => {
    expect(hashCode(param)).toBe(hashCode(param));
  });
});

describe('isPromise', () => {
  it.each([
    {
      description: 'Promise.resolve',
      param: Promise.resolve(),
      value: true
    },
    {
      description: 'async function',
      param: async () => {},
      value: true
    },
    {
      description: 'non-promise',
      param: () => 'lorem',
      value: false
    }
  ])('should determine a promise for $description', ({ param, value }) => {
    expect(isPromise(param)).toBe(value);
  });
});

describe('isPlainObject', () => {
  it.each([
    {
      description: 'plain object, empty',
      param: {},
      value: true
    },
    {
      description: 'plain object',
      param: { 1: 'lorem', 2: 'ipsum' },
      value: true
    },
    {
      description: 'create object',
      param: Object.create(null),
      value: true
    },
    {
      description: 'array',
      param: [],
      value: false
    },
    {
      description: 'null',
      param: null,
      value: false
    },
    {
      description: 'undefined',
      param: undefined,
      value: false
    },
    {
      description: 'NaN',
      param: NaN,
      value: false
    },
    {
      description: 'function',
      param: () => 'lorem',
      value: false
    },
    {
      description: 'date',
      param: new Date('2023-01-01'),
      value: false
    }
  ])('should determine a plain object for $description', ({ param, value }) => {
    expect(isPlainObject(param)).toBe(value);
  });
});

describe('isReferenceLike', () => {
  it.each([
    {
      description: 'string',
      param: 'lorem',
      value: false
    },
    {
      description: 'number',
      param: 10_0000,
      value: false
    },
    {
      description: 'plain object, empty',
      param: {},
      value: true
    },
    {
      description: 'plain object',
      param: { 1: 'lorem', 2: 'ipsum' },
      value: true
    },
    {
      description: 'create object',
      param: Object.create(null),
      value: true
    },
    {
      description: 'array',
      param: [],
      value: true
    },
    {
      description: 'null',
      param: null,
      value: false
    },
    {
      description: 'undefined',
      param: undefined,
      value: false
    },
    {
      description: 'NaN',
      param: NaN,
      value: false
    },
    {
      description: 'function',
      param: () => 'lorem',
      value: true
    },
    {
      description: 'date',
      param: new Date('2023-01-01'),
      value: true
    },
    {
      description: 'symbol',
      param: Symbol('lorem ipsum'),
      value: false
    },
    {
      description: 'error',
      param: new Error('lorem ipsum'),
      value: true
    },
    {
      description: 'regex',
      param: /lorem/g,
      value: true
    },
    {
      description: 'map',
      param: new Map([['lorem', 1], ['ipsum', 2]]),
      value: true
    },
    {
      description: 'set',
      param: new Set([1, 2, 3]),
      value: true
    }
  ])('should determine a non-primitive for $description', ({ param, value }) => {
    expect(isReferenceLike(param)).toBe(value);
  });
});

describe('mergeObjects', () => {
  it.each([
    {
      description: 'non-objects',
      obj1: 'lorem',
      obj2: 'ipsum'
    },
    {
      description: 'plain object against plain object',
      obj1: {},
      obj2: {}
    },
    {
      description: 'plain object against undefined',
      obj1: {},
      obj2: undefined
    },
    {
      description: 'plain object against null',
      obj1: {},
      obj2: null
    },
    {
      description: 'plain object against array',
      obj1: {},
      obj2: []
    },
    {
      description: 'recursive plain object against recursive plain object',
      obj1: {
        lorem: {
          ipsum: 'lorem',
          sit: ['ipsum'],
          dolor: [
            {
              amet: 'consectetur'
            }
          ],
          amet: {
            consectetur: 'adipiscing',
            elit: {
              sed: 'do'
            }
          },
          adipiscing: {
            consectetur: 'elit'
          },
          elit: {
            sed: 'do'
          }
        }
      },
      obj2: {
        lorem: {
          ipsum: 'dolor',
          sit: ['amet'],
          dolor: ['sit', 'amet'],
          consectetur: () => 'adipiscing',
          amet: {
            elit: {
              dolor: 'magna'
            }
          },
          adipiscing: null,
          elit: {
            sed: undefined
          }
        }
      }
    }
  ])('should merge two objects, $description', ({ obj1, obj2 }) => {
    expect(mergeObjects(obj1 as any, obj2 as any)).toMatchSnapshot();
  });

  it('mergeObjects should ignore prototype pollution keys', () => {
    const merged = mergeObjects({}, { __proto__: { polluted: true } });

    expect((merged as any).polluted).toBeUndefined();
    expect((Object.prototype as any).polluted).toBeUndefined();
  });
});

describe('portValid', () => {
  it.each([
    {
      description: 'valid',
      port: 8080,
      expected: 8080
    },
    {
      description: 'zero',
      port: 0,
      expected: 0
    },
    {
      description: 'upper-range',
      port: 65535,
      expected: 65535
    },
    {
      description: 'out-of-range',
      port: 10_0000,
      expected: undefined
    },
    {
      description: 'out-of-range negative',
      port: -10_0000,
      expected: undefined
    },
    {
      description: 'string',
      port: '9000',
      expected: 9000
    },
    {
      description: 'empty string',
      port: '',
      expected: undefined
    },
    {
      description: 'NaN',
      port: NaN,
      expected: undefined
    },
    {
      description: 'float',
      port: 1.088,
      expected: undefined
    },
    {
      description: 'out-of-range float',
      port: -1.088,
      expected: undefined
    },
    {
      description: 'undefined',
      port: undefined,
      expected: undefined
    },
    {
      description: 'null',
      port: null,
      expected: undefined
    }
  ])('should validate a port, $description', ({ port, expected }) => {
    expect(portValid(port)).toBe(expected);
  });
});

import {
  assertInput,
  assertInputString,
  assertInputStringLength,
  assertInputStringArrayEntryLength,
  assertInputStringNumberEnumLike
} from '../server.assertions';

describe('assertInput', () => {
  it.each([
    {
      description: 'basic string validation',
      condition: '  '.trim().length > 0
    },
    {
      description: 'pattern in string validation with callback format',
      condition: () => new RegExp('patternfly://', 'i').test('fly://lorem-ipsum')
    },
    {
      description: 'array entry length validation',
      condition: Array.isArray(['lorem']) && ['lorem'].length > 2
    }
  ])('should throw an error for validation, $description', ({ condition }) => {
    const errorMessage = `Lorem ipsum error message for validation.`;

    expect(() => assertInput(
      condition,
      errorMessage
    )).toThrow(errorMessage);
  });
});

describe('assertInputString', () => {
  it.each([
    {
      description: 'empty string',
      input: ''
    },
    {
      description: 'undefined',
      input: undefined
    },
    {
      description: 'number',
      input: 1
    },
    {
      description: 'null',
      input: null
    }
  ])('should throw an error for validation, $description', ({ input }) => {
    const errorMessage = '"Input" must be a string';

    expect(() => assertInputString(
      input
    )).toThrow(errorMessage);
  });
});

describe('assertInputStringLength', () => {
  it.each([
    {
      description: 'empty string',
      input: ''
    },
    {
      description: 'undefined',
      input: undefined
    },
    {
      description: 'number',
      input: 1
    },
    {
      description: 'null',
      input: null
    },
    {
      description: 'max',
      input: 'lorem ipsum',
      options: { max: 5 }
    },
    {
      description: 'min',
      input: 'lorem ipsum',
      options: { min: 15 }
    },
    {
      description: 'max and min',
      input: 'lorem ipsum',
      options: { min: 1, max: 10 }
    },
    {
      description: 'max and min and display name',
      input: 'lorem ipsum',
      options: { min: 1, max: 10, inputDisplayName: 'lorem ipsum' }
    },
    {
      description: 'max and min and description',
      input: 'lorem ipsum',
      options: { min: 1, max: 10, message: 'dolor sit amet, consectetur adipiscing elit.' }
    }
  ])('should throw an error for validation, $description', ({ input, options }) => {
    const errorMessage = options?.message || `"${options?.inputDisplayName || 'Input'}" must be a string`;

    expect(() => assertInputStringLength(
      input,
      { min: 1, max: 100, ...options } as any
    )).toThrow(errorMessage);
  });
});

describe('assertInputStringArrayEntryLength', () => {
  it.each([
    {
      description: 'empty string',
      input: ''
    },
    {
      description: 'undefined',
      input: undefined
    },
    {
      description: 'number',
      input: 1
    },
    {
      description: 'null',
      input: null
    },
    {
      description: 'max',
      input: ['lorem ipsum'],
      options: { max: 5 }
    },
    {
      description: 'min',
      input: ['lorem ipsum'],
      options: { min: 15 }
    },
    {
      description: 'max and min',
      input: ['lorem ipsum'],
      options: { min: 1, max: 10 }
    },
    {
      description: 'max and min and display name',
      input: ['lorem ipsum'],
      options: { min: 1, max: 10, inputDisplayName: 'lorem ipsum' }
    },
    {
      description: 'max and min and description',
      input: ['lorem ipsum'],
      options: { min: 1, max: 10, message: 'dolor sit amet, consectetur adipiscing elit.' }
    }
  ])('should throw an error for validation, $description', ({ input, options }) => {
    const errorMessage = options?.message || `"${options?.inputDisplayName || 'Input'}" array must contain strings`;

    expect(() => assertInputStringArrayEntryLength(
      input as any,
      { min: 1, max: 100, ...options } as any
    )).toThrow(errorMessage);
  });
});

describe('assertInputStringNumberEnumLike', () => {
  it.each([
    {
      description: 'empty string',
      input: '',
      compare: [2, 3]
    },
    {
      description: 'undefined',
      input: undefined,
      compare: [2, 3]
    },
    {
      description: 'null',
      input: null,
      compare: [2, 3]
    },
    {
      description: 'number',
      input: 1,
      compare: [2, 3]
    },
    {
      description: 'string',
      input: 'lorem ipsum',
      compare: ['amet', 'dolor sit']
    },
    {
      description: 'string and display name',
      input: 'lorem ipsum',
      compare: ['amet', 'dolor sit'],
      options: { inputDisplayName: 'lorem ipsum' }
    },
    {
      description: 'string and description',
      input: 'lorem ipsum',
      compare: [1, 2],
      options: { message: 'dolor sit amet, consectetur adipiscing elit.' }
    }
  ])('should throw an error for validation, $description', ({ input, compare, options }) => {
    const errorMessage = options?.message || `"${options?.inputDisplayName || 'Input'}" must be one of the following values`;

    expect(() => assertInputStringNumberEnumLike(
      input as any,
      compare as any,
      { ...options } as any
    )).toThrow(errorMessage);
  });

  it('should throw an internal error for validation when missing comparison values', () => {
    const errorMessage = 'List of allowed values is empty';

    expect(() => assertInputStringNumberEnumLike(
      1,
      []
    )).toThrow(errorMessage);
  });
});

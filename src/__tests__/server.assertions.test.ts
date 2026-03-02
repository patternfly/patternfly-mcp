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
      param: '',
      condition: (value: any) => typeof value === 'string' && value.trim().length > 0
    },
    {
      description: 'pattern in string validation',
      param: 'patternfly://lorem-ipsum',
      condition: (value: any) => new RegExp('patternfly://', 'i').test(value)
    },
    {
      description: 'array entry length validation',
      param: ['lorem', 'ipsum'],
      condition: (value: any) => Array.isArray(value) && value.length > 2
    }
  ])('should throw an error for validation, $description', ({ param, condition }) => {
    const errorMessage = `Lorem ipsum error message for ${param} validation.`;

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
      param: ''
    },
    {
      description: 'undefined',
      param: undefined
    },
    {
      description: 'number',
      param: 1
    },
    {
      description: 'null',
      param: null
    }
  ])('should throw an error for validation, $description', ({ param }) => {
    const errorMessage = '"Input" must be a string';

    expect(() => assertInputString(
      param
    )).toThrow(errorMessage);
  });
});

describe('assertInputStringLength', () => {
  it.each([
    {
      description: 'empty string',
      param: ''
    },
    {
      description: 'undefined',
      param: undefined
    },
    {
      description: 'number',
      param: 1
    },
    {
      description: 'null',
      param: null
    },
    {
      description: 'max',
      param: 'lorem ipsum',
      options: { max: 5 }
    },
    {
      description: 'min',
      param: 'lorem ipsum',
      options: { min: 15 }
    },
    {
      description: 'max and min',
      param: 'lorem ipsum',
      options: { min: 1, max: 10 }
    },
    {
      description: 'max and min and display name',
      param: 'lorem ipsum',
      options: { min: 1, max: 10, inputDisplayName: 'lorem ipsum' }
    },
    {
      description: 'max and min and description',
      param: 'lorem ipsum',
      options: { min: 1, max: 10, message: 'dolor sit amet, consectetur adipiscing elit.' }
    }
  ])('should throw an error for validation, $description', ({ param, options }) => {
    const errorMessage = options?.message || `"${options?.inputDisplayName || 'Input'}" must be a string`;

    expect(() => assertInputStringLength(
      param,
      { min: 1, max: 100, ...options } as any
    )).toThrow(errorMessage);
  });
});

describe('assertInputStringArrayEntryLength', () => {
  it.each([
    {
      description: 'empty string',
      param: ''
    },
    {
      description: 'undefined',
      param: undefined
    },
    {
      description: 'number',
      param: 1
    },
    {
      description: 'null',
      param: null
    },
    {
      description: 'max',
      param: ['lorem ipsum'],
      options: { max: 5 }
    },
    {
      description: 'min',
      param: ['lorem ipsum'],
      options: { min: 15 }
    },
    {
      description: 'max and min',
      param: ['lorem ipsum'],
      options: { min: 1, max: 10 }
    },
    {
      description: 'max and min and display name',
      param: ['lorem ipsum'],
      options: { min: 1, max: 10, inputDisplayName: 'lorem ipsum' }
    },
    {
      description: 'max and min and description',
      param: ['lorem ipsum'],
      options: { min: 1, max: 10, message: 'dolor sit amet, consectetur adipiscing elit.' }
    }
  ])('should throw an error for validation, $description', ({ param, options }) => {
    const errorMessage = options?.message || `"${options?.inputDisplayName || 'Input'}" array must contain strings`;

    expect(() => assertInputStringArrayEntryLength(
      param as any,
      { min: 1, max: 100, ...options } as any
    )).toThrow(errorMessage);
  });
});

describe('assertInputStringNumberEnumLike', () => {
  it.each([
    {
      description: 'empty string',
      param: '',
      compare: [2, 3]
    },
    {
      description: 'undefined',
      param: undefined,
      compare: [2, 3]
    },
    {
      description: 'null',
      param: null,
      compare: [2, 3]
    },
    {
      description: 'number',
      param: 1,
      compare: [2, 3]
    },
    {
      description: 'string',
      param: 'lorem ipsum',
      compare: ['amet', 'dolor sit']
    },
    {
      description: 'string and display name',
      param: 'lorem ipsum',
      compare: ['amet', 'dolor sit'],
      options: { inputDisplayName: 'lorem ipsum' }
    },
    {
      description: 'string and description',
      param: 'lorem ipsum',
      compare: [1, 2],
      options: { message: 'dolor sit amet, consectetur adipiscing elit.' }
    }
  ])('should throw an error for validation, $description', ({ param, compare, options }) => {
    const errorMessage = options?.message || `"${options?.inputDisplayName || 'Input'}" must be one of the following values`;

    expect(() => assertInputStringNumberEnumLike(
      param as any,
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

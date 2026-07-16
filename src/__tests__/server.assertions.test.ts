import {
  assertInput,
  assertInputString,
  assertInputStringLength,
  assertInputStringArrayEntryLength,
  assertInputStringNumberEnumLike,
  assertInputUrlWhiteListed
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

  it('should pass for a valid input', () => {
    expect(() => assertInput('dolor'.length > 1, 'Lorem Ipsum')).not.toThrow();
  });

  it('should allow custom errors when provided', () => {
    const errorMessage = 'Lorem ipsum error message for validation.';

    expect(() => assertInput(
      false,
      errorMessage,
      (message, cause) => new Error(`Custom: ${message}`, { cause })
    )).toThrow(`Custom: ${errorMessage}`);
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
    const errorMessage = '"Input" must be a non-empty string';

    expect(() => assertInputString(
      input
    )).toThrow(errorMessage);
  });

  it('should pass for a valid string', () => {
    expect(() => assertInputString('dolor')).not.toThrow();
  });

  it('should allow custom errors when provided', () => {
    const errorMessage = 'Lorem ipsum error message for validation.';

    expect(() => assertInputString(
      false,
      { message: errorMessage, codeOrError: (message, cause) => new Error(`Custom: ${message}`, { cause }) }
    )).toThrow(`Custom: ${errorMessage}`);
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
    const errorMessage = options?.message || `"${options?.inputDisplayName || 'Input'}" must be a string from`;

    expect(() => assertInputStringLength(
      input,
      { min: 1, max: 100, ...options }
    )).toThrow(errorMessage);
  });

  it('should pass for a valid string within range', () => {
    expect(() => assertInputStringLength('dolor', { min: 1, max: 10 })).not.toThrow();
  });

  it('should allow custom errors when provided', () => {
    const errorMessage = 'Lorem ipsum error message for validation.';

    expect(() => assertInputStringLength(
      false,
      { min: 1, max: 10, message: errorMessage, codeOrError: (message, cause) => new Error(`Custom: ${message}`, { cause }) }
    )).toThrow(`Custom: ${errorMessage}`);
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
      input,
      { min: 1, max: 100, ...options }
    )).toThrow(errorMessage);
  });

  it('should pass for a valid array of strings', () => {
    expect(() => assertInputStringArrayEntryLength(['dolor'], { min: 1, max: 10 })).not.toThrow();
  });

  it('should allow custom errors when provided', () => {
    const errorMessage = 'Lorem ipsum error message for validation.';

    expect(() => assertInputStringArrayEntryLength(
      false,
      { min: 1, max: 10, message: errorMessage, codeOrError: (message, cause) => new Error(`Custom: ${message}`, { cause }) }
    )).toThrow(`Custom: ${errorMessage}`);
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
      input,
      compare,
      { ...options }
    )).toThrow(errorMessage);
  });

  it('should throw an internal error for validation when missing comparison values', () => {
    const errorMessage = 'List of allowed values is empty';

    expect(() => assertInputStringNumberEnumLike(
      1,
      []
    )).toThrow(errorMessage);
  });

  it('should pass for a valid value in enum-like array', () => {
    expect(() => assertInputStringNumberEnumLike('dolor', ['dolor'])).not.toThrow();
  });

  it('should allow custom errors when provided', () => {
    const errorMessage = 'Lorem ipsum error message for validation.';

    expect(() => assertInputStringNumberEnumLike(
      false,
      ['dolor'],
      { message: errorMessage, codeOrError: (message, cause) => new Error(`Custom: ${message}`, { cause }) }
    )).toThrow(`Custom: ${errorMessage}`);
  });
});

describe('assertInputUrlWhiteListed', () => {
  it.each([
    {
      description: 'empty string',
      input: '',
      compare: ['https://patternfly.org']
    },
    {
      description: 'undefined',
      input: undefined,
      compare: ['https://patternfly.org']
    },
    {
      description: 'null',
      input: null,
      compare: ['https://patternfly.org']
    },
    {
      description: 'number',
      input: 1,
      compare: ['https://patternfly.org']
    },
    {
      description: 'string',
      input: 'lorem ipsum',
      compare: ['https://patternfly.org']
    },
    {
      description: 'URL and display name',
      input: 'https://github.com/patternfly',
      compare: ['https://patternfly.org'],
      options: { inputDisplayName: 'lorem ipsum' }
    },
    {
      description: 'URL and description',
      input: 'https://github.com/patternfly',
      compare: ['https://patternfly.org'],
      options: { message: 'dolor sit amet, consectetur adipiscing elit.' }
    }
  ])('should throw an error for validation, $description', ({ input, compare, options }) => {
    const errorMessage = options?.message || `"${options?.inputDisplayName || 'URL input'}" must be within the whitelisted URLs`;

    expect(() => assertInputUrlWhiteListed(
      input,
      compare as any,
      { ...options }
    )).toThrow(errorMessage);
  });

  it('should pass for a valid value in a whitelist array', () => {
    expect(() => assertInputUrlWhiteListed('https://patternfly.org', ['https://patternfly.org'])).not.toThrow();
  });

  it('should allow custom errors when provided', () => {
    const errorMessage = 'Lorem ipsum error message for validation.';

    expect(() => assertInputUrlWhiteListed(
      false,
      ['http://patternfly.org'],
      { message: errorMessage, codeOrError: (message, cause) => new Error(`Custom: ${message}`, { cause }) }
    )).toThrow(`Custom: ${errorMessage}`);
  });
});

import {
  assertProtocol
} from '../options.assertions';

describe('assertProtocol', () => {
  it.each([
    {
      description: 'invalid URL format',
      urls: ['not-a-url'],
      protocols: ['http', 'https']
    },
    {
      description: 'disallowed protocol',
      urls: ['ftp://example.com'],
      protocols: ['http', 'https']
    },
    {
      description: 'valid URL but disallowed specific protocol',
      urls: ['http://example.com'],
      protocols: ['https']
    },
    {
      description: 'empty protocol list with valid URL',
      urls: ['https://example.com'],
      protocols: []
    }
  ])('should throw an error for validation, $description', ({ urls, protocols }) => {
    const errorMessage = 'Invalid URL protocol configuration';

    expect(() => assertProtocol(
      urls,
      protocols
    )).toThrow(errorMessage);
  });

  it('should pass for valid inputs', () => {
    expect(() => assertProtocol(
      ['https://patternfly.org', 'http://localhost', 'HTTP://127.0.0.1'],
      ['HTTP', 'https']
    )).not.toThrow();
  });

  it('should pass for an empty URL list', () => {
    expect(() => assertProtocol([], ['http', 'https'])).not.toThrow();
  });
});

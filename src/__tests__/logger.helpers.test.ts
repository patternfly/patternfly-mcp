import {
  sanitizeHeaderContent,
  sanitizeMessage,
  sanitizeTokenContent,
  sanitizeUrlContent
} from '../logger.helpers';

describe('sanitizeHeaderContent', () => {
  it.each([
    {
      description: 'authorization bearer token',
      input: 'Authorization: Bearer abc123',
      expected: 'Authorization: Bearer [REDACTED]'
    },
    {
      description: 'private token header',
      input: 'Private-Token: abc123',
      expected: 'Private-Token: [REDACTED]'
    },
    {
      description: 'non-string input',
      input: undefined,
      expected: undefined
    },
    {
      description: 'custom redacted marker',
      input: 'Authorization: Bearer abc123',
      options: { redacted: '<MASKED>' },
      expected: 'Authorization: Bearer <MASKED>'
    }
  ])('should sanitize header content, $description', ({ input, options, expected }) => {
    expect(sanitizeHeaderContent(input, options as any)).toBe(expected);
  });
});

describe('sanitizeUrlContent', () => {
  it.each([
    {
      description: 'redact secret query param in absolute URL',
      input: 'https://example.com/docs?private_token=abc123&page=1',
      expected: 'https://example.com/docs?private_token=%5BREDACTED%5D&page=1'
    },
    {
      description: 'redact basic auth credentials',
      input: 'https://user:pass@example.com/docs',
      expected: 'https://%5BREDACTED%5D:%5BREDACTED%5D@example.com/docs'
    },
    {
      description: 'leave non-url content unchanged',
      input: 'not a url',
      expected: 'not a url'
    },
    {
      description: 'sanitize url embedded in text',
      input: 'Fetch https://example.com/api?access_token=xyz now',
      expected: 'Fetch https://example.com/api?access_token=%5BREDACTED%5D now'
    },
    {
      description: 'non-string input',
      input: null,
      expected: undefined
    },
    {
      description: 'custom redacted marker',
      input: 'https://example.com/docs?token=abc',
      options: { redacted: '<MASKED>' },
      expected: 'https://example.com/docs?token=%3CMASKED%3E'
    }
  ])('should sanitize url content, $description', ({ input, options, expected }) => {
    expect(sanitizeUrlContent(input as any, options as any)).toBe(expected);
  });
});

describe('sanitizeTokenContent', () => {
  it.each([
    {
      description: 'redact sha-like token',
      input: 'token 0123456789abcdef0123456789abcdef',
      expected: 'token [REDACTED]'
    },
    {
      description: 'redact base64-like token',
      input: 'token QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo=',
      expected: 'token [REDACTED]'
    },
    {
      description: 'keep normal sentence intact',
      input: 'this is normal text',
      expected: 'this is normal text'
    },
    {
      description: 'custom min length avoids short token redaction',
      input: 'token abcdef12',
      options: { minLength: 64 },
      expected: 'token abcdef12'
    },
    {
      description: 'custom redacted marker',
      input: 'token 0123456789abcdef0123456789abcdef',
      options: { redacted: '<MASKED>' },
      expected: 'token <MASKED>'
    },
    {
      description: 'non-string input',
      input: { token: 'abc' },
      expected: undefined
    },
    {
      description: 'does not redact natural language, "adipiscing" false positive',
      input: 'consectetur adipiscing elit',
      expected: 'consectetur adipiscing elit'
    },
    {
      description: 'does not redact natural language in a serialized object',
      input: '{"lorem":"ipsum dolor sit amet","dolor":"sit amet","amet":"consectetur adipiscing elit"}',
      expected: '{"lorem":"ipsum dolor sit amet","dolor":"sit amet","amet":"consectetur adipiscing elit"}'
    }
  ])('should sanitize token content, $description', ({ input, options, expected }) => {
    expect(sanitizeTokenContent(input as any, options as any)).toBe(expected);
  });
});

describe('sanitizeMessage', () => {
  it.each([
    {
      description: 'sanitize bearer token and url query token in one message',
      input: 'Authorization: Bearer abc123 https://example.com/api?access_token=xyz',
      expected: 'Authorization: Bearer [REDACTED] https://example.com/api?access_token=%5BREDACTED%5D'
    },
    {
      description: 'sanitize secret in Error message',
      input: new Error('Private-Token: abc123'),
      expected: 'Error: Private-Token: [REDACTED]'
    },
    {
      description: 'non-string serializable object',
      input: { auth: 'Authorization: Bearer abc123' },
      expected: '{"auth":"Authorization: Bearer [REDACTED]"}'
    }
  ])('should sanitize message content, $description', ({ input, expected }) => {
    expect(sanitizeMessage(input)).toContain(expected);
  });
});

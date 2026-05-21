import { messagesList, MESSAGE_TYPES, parseCommitMessage, start } from '../../scripts/workflow.commitLint.js';

describe('parseCommitMessage', () => {
  it.each([
    {
      description: 'standard commit with type, scope, and PR',
      message: 'feat(core): add something (#123)',
      expected: {
        type: 'feat',
        scope: 'core',
        description: 'add something',
        prNumber: '123'
      }
    },
    {
      description: 'multiple colons in description (should not mutate description)',
      message: 'feat: check: missing colon (#789)',
      expected: {
        type: 'feat',
        description: 'check: missing colon',
        prNumber: '789'
      }
    },
    {
      description: 'greedy PR extraction (should not merge description numbers)',
      message: 'fix: resolve 500 error (#123)',
      expected: {
        type: 'fix',
        description: 'resolve 500 error',
        prNumber: '123'
      }
    },
    {
      description: 'breaking change with bang',
      message: 'feat(ui)!: breaking change',
      expected: {
        type: 'feat',
        isBreaking: true,
        description: 'breaking change'
      }
    },
    {
      description: 'fallback when type is invalid',
      message: 'unknown: some message',
      expected: {
        type: undefined,
        description: 'unknown: some message'
      }
    },
    {
      description: 'issue number parsing',
      message: 'feat(ui)!: issues/123 breaking change',
      expected: {
        type: 'feat',
        description: 'issues/123 breaking change',
        issueNumber: 'issues/123'
      }
    },
    {
      description: 'issue number parsing, misplaced',
      message: 'feat(ui): a change issues/123',
      settings: { allowIssuesAnywhere: false },
      expected: {
        type: 'feat',
        description: 'a change issues/123',
        issueNumber: undefined
      }
    },
    {
      description: 'issue number parsing, jira',
      message: 'feat(ui): jira-12345 a change',
      expected: {
        type: 'feat',
        description: 'jira-12345 a change',
        issueNumber: 'jira-12345'
      }
    }
  ])('should parse $description', ({ message, settings, expected }) => {
    const result = parseCommitMessage({ hash: 'abc1234', message }, { messageTypes: MESSAGE_TYPES, ...settings } as any);

    expect(result).toMatchObject(expected);
  });
});

describe('messagesList', () => {
  it.each([
    {
      description: 'valid standard commit',
      parsed: [{
        type: 'feat',
        scope: 'any',
        description: 'JIRA-123 add feature',
        issueNumber: 'JIRA-123',
        messageLength: 30,
        hash: 'abc1234',
        message: 'feat(any): JIRA-123 add feature'
      }],
      options: { typeScopeExceptions: [], issueNumberExceptions: [] },
      expected: {
        type: 'valid',
        issueNumber: 'valid'
      }
    },
    {
      description: 'validation masking show issue number error even if type is invalid',
      parsed: [{
        type: undefined,
        scope: 'any',
        description: 'no issue here',
        messageLength: 30,
        hash: 'abc1234',
        message: 'foo(any): no issue here'
      }],
      options: { typeScopeExceptions: [], issueNumberExceptions: ['feat'] },
      expected: {
        type: expect.stringContaining('INVALID: type'),
        issueNumber: expect.stringContaining('INVALID: issue number')
      }
    },
    {
      description: 'message length validation',
      parsed: [{
        type: 'feat',
        description: 'very long description',
        messageLength: 100,
        hash: 'abc1234',
        message: 'feat: very long description'
      }],
      options: { maxMessageLength: 50 },
      expected: {
        length: 'INVALID: message length (100 > 50).'
      }
    },
    {
      description: 'message length validation, pr and issue number',
      parsed: [{
        type: 'feat',
        description: 'issues/123 very long description',
        messageLength: 100,
        hash: 'abc1234',
        message: 'feat: issues/123 very long description (#123)',
        issueNumber: 'issues/123',
        prNumber: '123'
      }],
      options: { maxMessageLength: 50 },
      expected: {
        length: 'INVALID: message length (100 > 50). PRs do not count towards message length. Issue numbers do not count towards message length.'
      }
    },
    {
      description: 'typeScopeExceptions using wildcard',
      parsed: [{
        type: 'feat',
        scope: undefined,
        description: 'JIRA-123 desc',
        messageLength: 20,
        hash: 'abc1234'
      }],
      options: { typeScopeExceptions: '*' },
      expected: {
        scope: 'valid'
      }
    }
  ])('should validate $description', ({ parsed, options, expected }) => {
    const results = messagesList(parsed, options as any);

    expect(results[0]).toMatchObject(expected);
  });
});

describe('start', () => {
  const options = {
    allowIssuesAnywhere: false,
    issueNumberExceptions: [],
    maxMessageLength: 65,
    typeScopeExceptions: '*'
  };

  it.each([
    {
      description: 'valid commits',
      commits: [
        { sha: 'abcdef123456', commit: { message: 'feat(core): JIRA-123 add something (#1)' } },
        { sha: '123456abcdef', commit: { message: 'fix: JIRA-456 resolve bug (#2)' } }
      ],
      options,
      expected: {
        resultsArray: [],
        resultsString: '[]'
      }
    },
    {
      description: 'mixed valid and invalid commits',
      commits: [
        { sha: 'abcdef123456', commit: { message: 'feat(core): JIRA-123 add something' } },
        { sha: '111111222222', commit: { message: 'invalid message format' } }
      ],
      options,
      expected: {
        resultsArray: [
          {
            hash: '1111112',
            commit: 'invalid message format',
            type: expect.stringContaining('INVALID: type'),
            issueNumber: expect.stringContaining('INVALID: issue number')
          }
        ]
      }
    },
    {
      description: 'enforcing max message length with metadata bypass',
      commits: [
        {
          sha: 'abcdef123456',
          commit: { message: 'feat: JIRA-123 a very long description that exceeds the normal limit (#1)' }
        }
      ],
      options: { ...options, maxMessageLength: 10 },
      expected: {
        resultsArray: [
          {
            hash: 'abcdef1',
            length: expect.stringContaining('INVALID: message length')
          }
        ]
      }
    },
    {
      description: 'handling allowIssuesAnywhere toggle',
      commits: [
        { sha: 'abcdef123456', commit: { message: 'feat: add feature (JIRA-123)' } }
      ],
      options,
      expected: {
        resultsArray: [
          {
            hash: 'abcdef1',
            issueNumber: expect.stringContaining('INVALID: issue number')
          }
        ]
      }
    },
    {
      description: 'respecting issueNumberExceptions',
      commits: [
        { sha: 'abcdef123456', commit: { message: 'chore: cleanup code' } }
      ],
      options: { ...options, issueNumberExceptions: ['chore'] },
      expected: {
        resultsArray: [],
        resultsString: '[]'
      }
    },
    {
      description: 'empty or missing commits',
      commits: null,
      options,
      expected: {
        resultsArray: [],
        resultsString: ''
      }
    }
  ])('should handle $description', ({ commits, options, expected }) => {
    const result = start(commits as any, options as any);

    if (expected.resultsArray) {
      expect(result.resultsArray).toMatchObject(expected.resultsArray);
    }
    if (expected.resultsString !== undefined) {
      expect(result.resultsString).toBe(expected.resultsString);
    }
  });
});

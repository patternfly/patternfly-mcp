import fs from 'node:fs';
import { jest } from '@jest/globals';
import {
  coreContributors,
  doesListContainAnotherListValues,
  signatureScan,
  getCommentId,
  getPullRequest,
  setLabels,
  setComment,
  start
} from '../../scripts/workflow.preCheck.js';

describe('coreContributors', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    {
      description: 'dependabot',
      params: {
        authorType: 'Bot',
        author: 'dependabot[bot]'
      },
      expected: true
    },
    {
      description: 'dependabot, user',
      params: {
        authorType: 'User',
        author: 'dependabot[bot]'
      },
      expected: true
    },
    {
      description: 'other bot',
      params: {
        authorType: 'Bot',
        author: 'lorem-ipsum-bot'
      },
      expected: true
    },
    {
      description: 'general user',
      params: {
        authorType: 'User',
        author: 'lorem-ipsum-user'
      },
      expected: false
    },
    {
      description: 'owner',
      params: {
        authorRole: 'OWNER',
        author: 'dolor-sit-user'
      },
      expected: true
    },
    {
      description: 'member',
      params: {
        authorRole: 'MEMBER',
        author: 'dolor-sit-user'
      },
      expected: false
    },
    {
      description: 'collaborator',
      params: {
        authorRole: 'COLLABORATOR',
        author: 'dolor-sit-user'
      },
      expected: false
    },
    {
      description: 'contributor',
      params: {
        authorRole: 'CONTRIBUTOR',
        author: 'dolor-sit-user'
      },
      expected: false
    }
  ])('should handle actual authors, $description', ({ params, expected }) => {
    // This is a live test against the actual CODEOWNERS file
    const result = coreContributors(params);

    expect(result).toBe(expected);
  });

  it.each([
    {
      description: 'codeowner, owner',
      account: '@lorem',
      params: {
        author: 'lorem', authorRole: 'OWNER', authorType: 'User'
      },
      expected: true
    },
    {
      description: 'owner',
      account: undefined,
      params: {
        author: 'lorem', authorRole: 'OWNER', authorType: 'User'
      },
      expected: true
    },
    {
      description: 'codeowner, member',
      account: '@lorem',
      params: {
        author: 'lorem', authorRole: 'MEMBER', authorType: 'User'
      },
      expected: true
    },
    {
      description: 'member',
      account: undefined,
      params: {
        author: 'lorem', authorRole: 'MEMBER', authorType: 'User'
      },
      expected: false
    },
    {
      description: 'codeowner with comma delimiter',
      account: '@other, @lorem',
      params: {
        author: 'lorem', authorRole: 'MEMBER', authorType: 'User'
      },
      expected: true
    },
    {
      description: 'codeowner with parentheses',
      account: '(@lorem) @other',
      params: {
        author: 'lorem', authorRole: 'MEMBER', authorType: 'User'
      },
      expected: true
    },
    {
      description: 'prevent partial name match (suffix)',
      account: '@lorem-suffix',
      params: {
        author: 'lorem', authorRole: 'MEMBER', authorType: 'User'
      },
      expected: false
    },
    {
      description: 'prevent partial name match (prefix)',
      account: 'prefix-@lorem',
      params: {
        author: 'lorem', authorRole: 'MEMBER', authorType: 'User'
      },
      expected: false
    }
  ])('should verify simulated authors against a simulated CODEOWNERS file, $description', ({ account, params, expected }) => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    const mockReadFileSyncSpy = jest.spyOn(fs, 'readFileSync').mockReturnValue(account ? `package*.json ${account} @dolor-sit` : 'package*.json @dolor-sit');
    const result = coreContributors(params);

    expect(result).toBe(expected);
    expect(mockReadFileSyncSpy).toHaveBeenCalledWith(expect.stringContaining('CODEOWNERS'), 'utf8');
  });
});

describe('doesListContainAnotherListValues', () => {
  it.each([
    {
      description: 'empty lists',
      listBase: [],
      listCheck: ['src/'],
      expected: []
    },
    {
      description: 'exact match',
      listBase: [{ filename: 'src/server.ts' }],
      listCheck: ['src/server.ts'],
      expected: ['src/server.ts']
    },
    {
      description: 'case insensitivity',
      listBase: [{ filename: 'src/SERVER.ts' }],
      listCheck: ['SRC/server.TS'],
      expected: ['src/SERVER.ts']
    },
    {
      description: 'prefix/directory match',
      listBase: [{ filename: 'src/cli.ts' }],
      listCheck: ['src/cli'],
      expected: ['src/cli.ts']
    },
    {
      description: 'contains match',
      listBase: [{ filename: 'some/path/scripts/workflow.script.js' }],
      listCheck: ['scripts/workflow'],
      expected: ['some/path/scripts/workflow.script.js']
    },
    {
      description: 'multiple matches',
      listBase: [
        { filename: 'src/server.ts' },
        { filename: 'tests/e2e/test.ts' }
      ],
      listCheck: ['src/', 'tests/e2e'],
      expected: ['src/server.ts', 'tests/e2e/test.ts']
    },
    {
      description: 'no match',
      listBase: [{ filename: 'README.md' }],
      listCheck: ['src/'],
      expected: []
    }
  ])('should verify list containment, $description', ({ listBase, listCheck, expected }) => {
    const result = doesListContainAnotherListValues(listBase, listCheck);

    expect(result).toEqual(expected);
  });
});

describe('signatureScan', () => {
  it.each([
    {
      description: 'valid PR',
      params: {
        description: '<!-- GH_PR_METADATA_V1_789 -->',
        files: [{ filename: 'src/patternfly.ts' }],
        fileCount: 1
      },
      expected: 0
    },
    {
      description: 'too many files',
      params: {
        description: '<!-- GH_PR_METADATA_V1_789 -->',
        files: [],
        fileCount: 16
      },
      expected: 1
    },
    {
      description: 'missing template metadata',
      params: {
        description: 'Just a PR description',
        files: [],
        fileCount: 1
      },
      expected: 0
    },
    {
      description: 'core modifications',
      params: {
        description: '<!-- GH_PR_METADATA_V1_789 -->',
        files: [{ filename: 'src/server.ts' }],
        fileCount: 1
      },
      expected: 1
    },
    {
      description: 'security modifications',
      params: {
        description: '<!-- GH_PR_METADATA_V1_789 -->',
        files: [{ filename: '.github/workflows/pr_precheck.yml' }],
        fileCount: 1
      },
      expected: 1
    },
    {
      description: 'agent modifications',
      params: {
        description: '<!-- GH_PR_METADATA_V1_789 -->',
        files: [{ filename: '.aiignore' }],
        fileCount: 1
      },
      expected: 1
    },
    {
      description: 'extra/generated files',
      params: {
        description: '<!-- GH_PR_METADATA_V1_789 -->',
        files: [{ filename: 'scripts/__mocks__' }],
        fileCount: 1
      },
      expected: 1
    },
    {
      description: '"The Tell"',
      params: {
        description: 'Missing metadata',
        files: [
          { filename: 'src/server.ts' },
          { filename: 'tests/e2e/__snapshots__/stdioTransport.test.ts.snap' }
        ],
        fileCount: 20
      },
      expected: 2
    }
  ])('should scan for signatures, $description', ({ params, expected }) => {
    const result = signatureScan(params);

    expect(result.errors.length).toBe(expected);
    expect(result).toMatchSnapshot();
  });
});

describe('getCommentId', () => {
  it('should return the ID of a comment matching the signature', async () => {
    const github = {
      rest: {
        issues: {
          listComments: jest.fn<any>().mockResolvedValue({
            data: [
              { id: 101, body: 'some other comment' },
              { id: 202, body: 'matching signature <!-- metadata-123 -->' }
            ]
          })
        }
      }
    };
    const context = { repo: { owner: 'lorem', repo: 'ipsum' }, issue: { number: 1 } };
    const id = await getCommentId('<!-- metadata-123 -->', { github, context });

    expect(id).toBe(202);
  });
});

describe('getPullRequest', () => {
  it('should resolve and aggregate PR metadata and resources', async () => {
    const github = {
      rest: {
        pulls: { listFiles: jest.fn<any>().mockResolvedValue({ data: ['file1'] }) },
        issues: { listComments: jest.fn<any>().mockResolvedValue({ data: ['comment1'] }) }
      }
    };
    const context = {
      payload: {
        pull_request: {
          user: { login: 'author1', type: 'User' },
          author_association: 'MEMBER',
          body: 'description',
          changed_files: 10
        }
      },
      repo: { owner: 'lorem', repo: 'ipsum' },
      issue: { number: 1 }
    };

    const result = await getPullRequest({ github, context });

    expect(result).toMatchSnapshot('pr');
  });

  it('should handle errors when fetching PR metadata', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const github = {
      rest: {
        pulls: { listFiles: jest.fn<any>().mockRejectedValue(new Error('API Error')) }
      }
    } as any;
    const context = {
      payload: {
        pull_request: {
          user: { login: 'author1', type: 'User' },
          author_association: 'MEMBER',
          body: 'description',
          changed_files: 10
        }
      },
      repo: { owner: 'lorem', repo: 'ipsum' },
      issue: { number: 1 }
    } as any;

    const result = await getPullRequest({ github, context });

    expect(result).toEqual({});
    expect(consoleSpy).toHaveBeenCalledWith('Failed to get pull request context', 'API Error');
    consoleSpy.mockRestore();
  });
});

describe('setLabels', () => {
  it('should provide methods to add and remove labels', async () => {
    const github = {
      rest: {
        issues: {
          addLabels: jest.fn<any>().mockResolvedValue({}),
          removeLabel: jest.fn<any>().mockResolvedValue({})
        }
      }
    };
    const context = { repo: { owner: 'lorem', repo: 'ipsum' }, issue: { number: 1 } } as any;

    const labels = setLabels({ github, context });

    await labels.add(['label-a']);
    await labels.remove(['label-b']);

    expect(github.rest.issues.addLabels).toHaveBeenCalled();
    expect(github.rest.issues.removeLabel).toHaveBeenCalled();
  });

  it('should handle errors when adding labels', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const github = {
      rest: {
        issues: {
          addLabels: jest.fn<any>().mockRejectedValue(new Error('Permission denied'))
        }
      }
    };
    const context = { repo: { owner: 'lorem', repo: 'ipsum' }, issue: { number: 1 } } as any;
    const labels = setLabels({ github, context });

    await labels.add(['label-a']);

    expect(github.rest.issues.addLabels).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Workflow add labels (label-a) failed'),
      'Permission denied'
    );
    consoleSpy.mockRestore();
  });
});

describe('setComment', () => {
  it('should update an existing comment if a signature match is found', async () => {
    const github = {
      rest: {
        issues: {
          createComment: jest.fn<any>().mockResolvedValue({}),
          listComments: jest.fn<any>().mockResolvedValue({
            data: [{ id: 500, body: 'matching signature <!-- signature-123 -->' }]
          }),
          updateComment: jest.fn<any>().mockResolvedValue({})
        }
      }
    };
    const context = { repo: { owner: 'lorem', repo: 'ipsum' }, issue: { number: 1 } };
    const comment = await setComment({ signature: '<!-- signature-123 -->', github, context });

    await comment.add('new body');

    expect(github.rest.issues.updateComment).toHaveBeenCalledWith(expect.objectContaining({
      comment_id: 500,
      body: 'new body<!-- signature-123 -->'
    }));
    expect(github.rest.issues.createComment).not.toHaveBeenCalled();
  });

  it('should create a new comment if no signature match is found', async () => {
    const github = {
      rest: {
        issues: {
          createComment: jest.fn<any>().mockResolvedValue({}),
          listComments: jest.fn<any>().mockResolvedValue({ data: [] }),
          updateComment: jest.fn<any>().mockResolvedValue({})
        }
      }
    };
    const context = { repo: { owner: 'lorem', repo: 'ipsum' }, issue: { number: 1 } };
    const comment = await setComment({ signature: '<!-- signature-123 -->', github, context });

    await comment.add('new body');

    expect(github.rest.issues.createComment).toHaveBeenCalledWith(expect.objectContaining({
      issue_number: 1,
      body: 'new body<!-- signature-123 -->'
    }));
    expect(github.rest.issues.updateComment).not.toHaveBeenCalled();
  });

  it('should remove a comment if a signature match is found', async () => {
    const github = {
      rest: {
        issues: {
          listComments: jest.fn<any>().mockResolvedValue({ data: [{ id: 500, body: '<!-- signature-123 -->' }] }),
          deleteComment: jest.fn<any>().mockResolvedValue({})
        }
      }
    };
    const context = { repo: { owner: 'lorem', repo: 'ipsum' }, issue: { number: 1 } };
    const comment = await setComment({ signature: '<!-- signature-123 -->', github, context });

    await comment.remove();

    expect(github.rest.issues.deleteComment).toHaveBeenCalledWith(expect.objectContaining({
      comment_id: 500
    }));
  });

  it('should handle errors when commenting fails', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const github = {
      rest: {
        issues: {
          createComment: jest.fn<any>().mockRejectedValue(new Error('Permission denied')),
          listComments: jest.fn<any>().mockResolvedValue({ data: [] })
        }
      }
    };
    const context = { repo: { owner: 'lorem', repo: 'ipsum' }, issue: { number: 1 } };
    const comment = await setComment({ signature: '<!-- signature-123 -->', github, context });

    await comment.add('new body');

    expect(github.rest.issues.createComment).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Workflow create comment failed'),
      'Permission denied'
    );
    consoleSpy.mockRestore();
  });
});

describe('start', () => {
  let github: any;
  let context: any;
  let core: any;
  let config: any;

  beforeEach(() => {
    github = {
      rest: {
        pulls: { listFiles: jest.fn<any>().mockResolvedValue({ data: [] }) },
        issues: {
          listComments: jest.fn<any>().mockResolvedValue({ data: [] }),
          addLabels: jest.fn<any>().mockResolvedValue({}),
          removeLabel: jest.fn<any>().mockResolvedValue({}),
          createComment: jest.fn<any>().mockResolvedValue({}),
          updateComment: jest.fn<any>().mockResolvedValue({}),
          deleteComment: jest.fn<any>().mockResolvedValue({})
        }
      }
    };
    context = {
      payload: {
        pull_request: {
          user: { login: 'contributor', type: 'User' },
          author_association: 'CONTRIBUTOR',
          body: '<!-- GH_PR_METADATA_V1_789 -->',
          changed_files: 1,
          labels: [],
          node_id: 'PR_123'
        }
      },
      repo: { owner: 'o', repo: 'r' },
      issue: { number: 123 }
    };
    core = { setFailed: jest.fn(), log: jest.fn(), notice: jest.fn(), error: jest.fn(), warning: jest.fn() };
    config = {
      LABEL_PRECHECKS_PASS: 'bot:policy-ready',
      LABEL_NEEDS_CLEANUP: 'bot:needs-cleanup',
      LABEL_NEEDS_MAINTAINER: 'bot:needs-maintainer',
      LABEL_PRECHECKS_FAIL: 'bot:policy-hold'
    };
  });

  it('should immediately apply the pass label for core contributors', async () => {
    // 1. Simulate an OWNER opening a PR
    context.payload.pull_request.author_association = 'OWNER';

    await start(config, { github, context, core });

    // 2. Verify that it applied the pass label and skipped further checks
    expect(github.rest.issues.addLabels).toHaveBeenCalledWith(expect.objectContaining({
      labels: [config.LABEL_PRECHECKS_PASS]
    }));

    expect(github.rest.issues.createComment).not.toHaveBeenCalled();
    expect(core.notice).toHaveBeenCalledWith(expect.stringContaining('Contributor found'));
  });

  it('should place PR on policy hold if signature scan finds complex changes (hasTell)', async () => {
    // 1. Mock fileCount and description to trigger hasTell
    context.payload.pull_request.changed_files = 100;
    context.payload.pull_request.body = 'Missing template signature';
    github.rest.pulls.listFiles.mockResolvedValue({
      data: [{ filename: 'src/server.ts' }, { filename: 'tests/e2e/utils/stdioTransportClient.ts' }]
    });

    await start(config, { github, context, core });

    // 2. Verify policy hold labeling
    expect(github.rest.issues.addLabels).toHaveBeenCalledWith(expect.objectContaining({
      labels: [config.LABEL_NEEDS_CLEANUP, config.LABEL_PRECHECKS_FAIL]
    }));

    expect(github.rest.issues.createComment).toHaveBeenCalledWith(expect.objectContaining({
      body: expect.stringContaining("I've flagged this PR for a **Policy Hold**")
    }));

    expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('Policy Hold'));
  });

  it('should apply needs-cleanup label and fail if scan find errors', async () => {
    // 1. Mock fileCount to trigger the error list but not hasTell
    context.payload.pull_request.changed_files = 20;

    await start(config, { github, context, core });

    // 2. Verify cleanup label and error comment
    expect(github.rest.issues.addLabels).toHaveBeenCalledWith(expect.objectContaining({
      labels: [config.LABEL_NEEDS_CLEANUP]
    }));

    expect(github.rest.issues.createComment).toHaveBeenCalledWith(expect.objectContaining({
      body: expect.stringContaining('I found some issues with your work')
    }));

    expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('found some issues'));
  });

  it('should apply needs-maintainer label for security-sensitive changes', async () => {
    github.rest.pulls.listFiles.mockResolvedValue({
      data: [{ filename: '.github/workflows/integration.yml' }]
    });

    await start(config, { github, context, core });

    expect(github.rest.issues.addLabels).toHaveBeenCalledWith(expect.objectContaining({
      labels: [config.LABEL_NEEDS_MAINTAINER]
    }));

    expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('Security-sensitive changes detected'));
    expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining("core contributor's security review"));
  });

  it('should notify success and apply pass label when all pre-checks pass', async () => {
    await start(config, { github, context, core });

    // 1. Verify Success Notification
    expect(github.rest.issues.createComment).toHaveBeenCalledWith(expect.objectContaining({
      body: expect.stringContaining('I finished my scan and all pre-checks pass!')
    }));

    // 2. Verify Labeling
    expect(github.rest.issues.addLabels).toHaveBeenCalledWith(expect.objectContaining({
      labels: [config.LABEL_PRECHECKS_PASS]
    }));

    // 3. Verify Label Cleanup
    const removedLabels = github.rest.issues.removeLabel.mock.calls.map((call: any) => call[0].name);

    expect(removedLabels).toContain(config.LABEL_NEEDS_CLEANUP);
    expect(removedLabels).toContain(config.LABEL_NEEDS_MAINTAINER);
    expect(removedLabels).toContain(config.LABEL_PRECHECKS_FAIL);

    // 4. Verify no failure was triggered
    expect(core.notice).toHaveBeenCalledWith(expect.stringContaining('all pre-checks pass'));
  });
});

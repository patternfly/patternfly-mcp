import fs from 'node:fs';

/**
 * Confirm specific authors/contributors from an available CODEOWNERS file.
 *
 * @note This check will pull authors/contributors regardless of CODEOWNERS' rights.
 *
 * @param params - Passed author parameters for review.
 * @param params.author
 * @param params.authorType
 * @param params.authorRole
 * @param options - Optional settings
 * @param options.allowBots - Allow known bots to skip preCheck
 * @param options.allowMaintainers - Allow general members
 * @returns {boolean} A `boolean` indicating whether an author/contributor is allowed to skip pre-checks.
 */
const coreContributors = ({ author, authorType, authorRole } = {}, { allowBots = true, allowMaintainers = true } = {}) => {
  const bots = ['Bot', 'dependabot[bot]'];
  const contributors = ['OWNER'];
  const codeOwnersPaths = ['.github/CODEOWNERS', 'CODEOWNERS'];

  const isBot = allowBots && (bots.includes(authorType) || bots.includes(author));
  const isMaintainer = allowMaintainers && contributors.includes(authorRole);
  let isCodeOwner = false;

  for (const filePath of codeOwnersPaths) {
    if (!fs.existsSync(filePath)) {
      continue;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const isAvailable = content
      .split(/[\s,()]+/)
      .filter(Boolean)
      .includes(`@${author}`);

    if (isAvailable) {
      isCodeOwner = true;
      break;
    }
  }

  return isBot || isMaintainer || isCodeOwner;
};

/**
 * Does one list contain another list's values?
 *
 * @param {{ filename: string }[]} listBase - Base array of strings to match.
 * @param {string[]} listCheck - Array of strings to confirm matches in base.
 * @returns {string[]} An array of value matches.
 */
const doesListContainAnotherListValues = (listBase, listCheck) =>
  ((Array.isArray(listBase) && listBase) || [])
    .filter(file => {
      const updatedFileName = file?.filename?.trim()?.toLowerCase() || undefined;
      const updatedListCheck = ((Array.isArray(listCheck) && listCheck) || []).map(item => item?.toLowerCase());

      if (!updatedFileName) {
        return false;
      }

      return updatedListCheck.includes(updatedFileName) ||
        updatedListCheck.some(
          item => (item && (updatedFileName.startsWith(item) || updatedFileName.endsWith(item) || updatedFileName.includes(item) || item.includes(updatedFileName)))
        );
    }).map(file => file?.filename);

/**
 * Scan PR for signatures using basic logic.
 *
 * @param params - Passed code parameters for review.
 * @param params.description
 * @param params.files
 * @param params.fileCount
 * @returns {{errors: string[], isMaxFilesUpdated: boolean, isPrTemplateModified: boolean, isAgentModified: boolean,
 *     isCoreModified: boolean, isExtraModified: boolean, isGenModified: boolean, isSecModified: boolean,
 *     hasFailed: boolean, hasTell: boolean}} An `object` containing code scan results.
 */
const signatureScan = ({ description, files, fileCount } = {}) => {
  // Make sure this is within the PR template, or we'll get false positives.
  const prTemplateStr = '<!-- GH_PR_METADATA_V1_789 -->';

  // Max file updates outside of core contributors before alerting.
  const fileChangeLimit = 15;

  // Signature checks. This can be a list of existing or non-existent files, directories, and/or extensions.
  const coreList = [
    'src/cli',
    'src/declarations',
    'src/index',
    'src/mcpSdk',
    'src/options.default',
    'src/patternFly.getResources',
    'src/resource.',
    'src/server.ts',
    'src/tool.',
    'tests/audit',
    'tests/e2e'
  ];

  // generated check. This can be a list of existing or non-existent files, directories, and/or extensions.
  const genList = [
    'tests/e2e/utils/stdioTransportClient.ts',
    'tests/e2e/__snapshots__/stdioTransport.test.ts.snap'
  ];

  // double check. This can be a list of existing or non-existent files, directories, and/or extensions.
  const secList = [
    '.github',
    '.gitignore',
    '.npmrc',
    '.sh',
    'package-lock.json',
    'src/index',
    'scripts/workflow'
  ];

  // more than needed. This can be a list of existing or non-existent files, directories, and/or extensions.
  const extrasList = [
    '__fixtures__',
    '__mocks__',
    'src/fixtures',
    'src/mocks'
  ];

  // agent exceptions. This can be a list of existing or non-existent files, directories, and/or extensions.
  const agentList = [
    '.aiignore',
    '.agents',
    '.claude',
    '.cursor',
    '.junie',
    'guidelines/'
  ];

  try {
    const isMaxFilesUpdated = typeof fileCount === 'number' ? fileCount > fileChangeLimit : undefined;
    const isPrTemplateModified = typeof description === 'string' ? description.includes(prTemplateStr) === false : undefined;

    const coreModified = doesListContainAnotherListValues(files, coreList);
    const isCoreModified = coreModified.length > 0;

    const genModified = doesListContainAnotherListValues(files, genList);
    const isGenModified = genModified.length > 0;

    const secModified = doesListContainAnotherListValues(files, secList);
    const isSecModified = secModified.length > 0;

    const extraModified = doesListContainAnotherListValues(files, extrasList);
    const isExtraModified = extraModified.length > 0;

    const agentModified = doesListContainAnotherListValues(files, agentList);
    const isAgentModified = agentModified.length > 0;

    // Aggregate errors
    const errors = [];

    if (isMaxFilesUpdated === true) {
      errors.push(`⚠️ Large number of file updates detected (${fileCount} files exceeds the ${fileChangeLimit} file limit). **Resolution:** Smaller PRs are easier to review and can lead to faster merges. Please split these changes into focused PRs, each addressing a single concern.`);
    }

    if (isCoreModified) {
      errors.push(`⚠️ Core file modifications detected (${coreModified.join(', ')}). **Resolution:** Please link a related GitHub, or Jira, issue in your PR description. If no issue exists, please create an issue first so we can discuss alignment with our roadmap.`);
    }

    if (isExtraModified) {
      errors.push(`⚠️ New workflow file updates detected. These updates may be tailored to a specific workflow (${extraModified.join(', ')}). **Resolution:** Please align with the project's existing code and testing style, and remove these changes to maintain consistency.`);
    }

    if (isAgentModified) {
      errors.push(`⚠️ Agent guideline updates detected (${agentModified.join(', ')}). **Resolution:** Please link a related GitHub, or Jira, issue in your PR description. Changes to shared guidelines require maintainer review for security and quality. `);
    }

    if (isSecModified) {
      errors.push(`⚠️ Updates to security-sensitive files detected (${secModified.join(', ')}). **Resolution:** These changes require a core contributor's security review. You can remove these changes or provide a clear explanation for these updates in your PR description.`);
    }

    return {
      errors,
      isMaxFilesUpdated: isMaxFilesUpdated === true,
      isPrTemplateModified: isPrTemplateModified === true,
      isAgentModified,
      isCoreModified,
      isExtraModified,
      isGenModified,
      isSecModified,
      hasFailed: false,
      hasTell: isMaxFilesUpdated === true && isPrTemplateModified === true && isCoreModified && isGenModified
    };
  } catch (e) {
    console.error(`Workflow PreCheck signatureScan failed`, e?.message || e);
  }

  return {
    errors: [
      `📡 System error detected. An unexpected issue encountered while processing this PR. A maintainer has been notified.`
    ],
    isMaxFilesUpdated: false,
    isPrTemplateModified: false,
    isAgentModified: false,
    isCoreModified: false,
    isExtraModified: false,
    isGenModified: false,
    isSecModified: false,
    hasFailed: true,
    hasTell: false
  };
};

/**
 * Set labels
 *
 * @param config
 * @param config.github
 * @param config.context
 * @returns {{add: function(*): Promise<void>, remove: function(*): Promise<void>}}
 */
const setLabels = ({ github, context } = {}) => {
  const { owner, repo } = context?.repo || {};
  const issueNumber = context?.issue?.number;
  const addLabels = github?.rest?.issues?.addLabels;
  const removeLabel = github?.rest?.issues?.removeLabel;

  return {
    add: async labels => {
      if (Array.isArray(labels)) {
        await addLabels({ owner, repo, issue_number: issueNumber, labels }).catch(err => {
          console.error(`Workflow add labels (${labels.join(', ')}) failed.`, err?.message || err);
        });
      }
    },
    remove: async labels => {
      if (Array.isArray(labels)) {
        for (const label of labels) {
          await removeLabel({ owner, repo, issue_number: issueNumber, name: label }).catch(err => {
            console.error(`Workflow remove label ${label} failed.`, err?.message || err);
          });
        }
      }
    }
  };
};

/**
 * Get a comment ID from an issue number using a signature.
 *
 * @param signature
 * @param config
 * @param config.github
 * @param config.context
 * @returns {Promise<*>}
 */
const getCommentId = async (signature, { github, context } = {}) => {
  const { owner, repo } = context?.repo || {};
  const issueNumber = context?.issue?.number;

  const listComments = github?.rest?.issues?.listComments;
  let commentId;

  if (listComments && issueNumber) {
    const { data: comments } = await listComments({ owner, repo, issue_number: issueNumber }) || {};

    const foundComment = comments.find(comment => comment?.body?.includes(signature));

    commentId = foundComment?.id;
  }

  return commentId;
};

/**
 * Set comments
 *
 * @param config
 * @param config.signature
 * @param config.github
 * @param config.context
 * @returns {Promise<{add: function(*): Promise<*>, remove: function(): Promise<*>, existingCommentId: *, isComment: boolean}>}
 */
const setComment = async ({ signature, github, context } = {}) => {
  const { owner, repo } = context?.repo || {};
  const issueNumber = context?.issue?.number;
  const createComment = github?.rest?.issues?.createComment;
  const deleteComment = github?.rest?.issues?.deleteComment;
  const updateComment = github?.rest?.issues?.updateComment;

  const getBody = bod => String(bod ?? '') + signature;
  const commentId = await getCommentId(signature, { github, context });

  return {
    add: async body => {
      if (commentId) {
        return updateComment({ owner, repo, comment_id: commentId, body: getBody(body) }).catch(err => {
          console.error('Workflow update comment failed.', err?.message || err);
        });
      }

      return createComment({ owner, repo, issue_number: issueNumber, body: getBody(body) }).catch(err => {
        console.error('Workflow create comment failed.', err?.message || err);
      });
    },
    remove: async () => deleteComment({ owner, repo, comment_id: commentId }).catch(err => {
      console.error('Workflow remove comment failed.', err?.message || err);
    }),
    existingCommentId: commentId,
    isComment: commentId !== undefined
  };
};

/**
 * Get a pull request context.
 *
 * @param config
 * @param config.github
 * @param config.context
 * @returns {Promise<{}|{author: *, authorType: *, authorRole: *, description: string, fileCount: *, files: *, comments: *}>}
 */
const getPullRequest = async ({ github, context } = {}) => {
  try {
    const { login: author, type: authorType } = context.payload.pull_request.user;
    const authorRole = context.payload.pull_request.author_association;

    const description = context.payload.pull_request.body || '';
    const fileCount = context.payload.pull_request.changed_files;
    const { data: files } = await github.rest.pulls.listFiles({
      owner: context.repo.owner,
      repo: context.repo.repo,
      pull_number: context.issue.number,
      per_page: 50
    });
    const { data: comments } = await github.rest.issues.listComments({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: context.issue.number
    });

    return {
      author, authorType, authorRole, description, fileCount, files, comments
    };
  } catch (err) {
    console.error('Failed to get pull request context', err?.message || err);
  }

  return {};
};

/**
 * Start the pre-check process.
 *
 * @param config - Configuration params
 * @param config.LABEL_NEEDS_CLEANUP - Label string
 * @param config.LABEL_NEEDS_MAINTAINER - Label string
 * @param config.LABEL_PRECHECKS_PASS - Label string
 * @param config.LABEL_PRECHECKS_FAIL - Label string
 * @param env - Environment params
 * @param env.github
 * @param env.context
 * @param env.core
 * @returns {Promise<void>}
 */
const start = async ({
  LABEL_NEEDS_CLEANUP,
  LABEL_NEEDS_MAINTAINER,
  LABEL_PRECHECKS_PASS,
  LABEL_PRECHECKS_FAIL
} = {}, { github, context, core } = {}) => {
  const { author, authorType, authorRole, description: prDescription, fileCount: prFileCount, files: prFiles } = await getPullRequest({ github, context });
  const { add: addLabels, remove: removeLabels } = await setLabels({ github, context });

  core.notice('🤖 Gatekeeper policy checks are active! Thank you for contributing! Please refer to the workflow logs and summaries for guidance. Proceeding with this work implies acceptance of the contribution agreement.');

  // Core contributors get a pass
  if (coreContributors({ author, authorType, authorRole })) {
    await addLabels([LABEL_PRECHECKS_PASS]);
    const botComment = `### 🤖 PR Quality Guidance\n` +
      `Contributor found, skipping pre-checks: ${author}`;

    core.notice(botComment + '\n\n');

    return;
  }

  // Signature checks found feature-like work, notify the user they may not be following guidance
  const codeSignature = signatureScan({ description: prDescription, files: prFiles, fileCount: prFileCount });
  const botCommentSignature = '<!-- precheck-bot-comment-V1 -->';
  const { add: addBotComment } = await setComment({ signature: botCommentSignature, github, context });

  if (codeSignature.hasTell) {
    const botComment = `### 🤖 PR Quality Guidance\n` +
      `I've flagged this PR for a **Policy Hold** to ensure alignment with our quality, security, and architectural standards.\n\n` +
      `**To resolve this hold and move forward**:\n` +
      `- Ensure your updates are associated with a GitHub issue (Step 1 of the [Contributor's Journey](https://github.com/patternfly/patternfly-mcp/blob/main/CONTRIBUTING.md#step-1-start-a-conversation)).\n` +
      `- Align with the codebase style and remove any excessive scope.\n` +
      `- Consider splitting your changes into smaller, focused PR contributions.\n\n` +
      `Starting with a conversation helps ensure your contribution is integrated smoothly. Once you've focused your changes, I'll take another look.\n\n` +
      `**Labels**: \`${LABEL_NEEDS_CLEANUP}\`, \`${LABEL_PRECHECKS_FAIL}\` \n\n` +
      `_Read our [contribution guidelines](https://github.com/patternfly/patternfly-mcp/blob/main/CONTRIBUTING.md). This comment updates automatically._`;

    await addBotComment(botComment);
    await addLabels([LABEL_NEEDS_CLEANUP, LABEL_PRECHECKS_FAIL]);
    core.setFailed(botComment);

    return;
  }

  // Sec check
  if (codeSignature.isSecModified) {
    await addLabels([LABEL_NEEDS_MAINTAINER]);

    core.warning(
      '### 🤖 PR Quality Guidance\n' +
      'Security-sensitive changes detected. A maintainer has been notified.\n\n' +
      `**Labels**: \`${LABEL_NEEDS_MAINTAINER}\`\n\n`
    );
  }

  // Signature checks found something, alert the contributor in good faith
  if (codeSignature.errors.length > 0) {
    const botComment = `### 🤖 PR Quality Guidance\n` +
      `I found some issues with your work. Once the following updates are addressed, you'll be queued for review:\n\n` +
      `${codeSignature.errors.map(err => `- ${err}`).join('\n')}\n\n` +
      `**Labels**: \`${LABEL_NEEDS_CLEANUP}\` \n\n` +
      `_Read our [contribution guidelines](https://github.com/patternfly/patternfly-mcp/blob/main/CONTRIBUTING.md). This comment updates automatically._`;

    await addBotComment(botComment);
    await addLabels([LABEL_NEEDS_CLEANUP]);
    core.setFailed(botComment);

    return;
  }

  // Fallback if signature checks fail, alert the maintainers, non-blocking
  if (codeSignature.hasFailed) {
    const errorComment = `### 🤖 PR Quality Guidance\n` +
      `${codeSignature.errors.map(err => `- ${err}`).join('\n')}\n\n` +
      `**Labels**: \`${LABEL_NEEDS_MAINTAINER}\` \n\n` +
      `_This comment updates automatically._`;

    await addBotComment(errorComment);
    await addLabels([LABEL_NEEDS_MAINTAINER]);
    core.warning(errorComment + '\n\n');
  } else {
    // Or confirm the work has passed pre-check
    const successComment = `### 🤖 PR Quality Guidance\n` +
      `I finished my scan and all pre-checks pass!\n\n` +
      `**Labels**: \`${LABEL_PRECHECKS_PASS}\`${codeSignature?.isSecModified ? `\`,${LABEL_NEEDS_MAINTAINER}\`` : ''} \n\n` +
      `_Read our [contribution guidelines](https://github.com/patternfly/patternfly-mcp/blob/main/CONTRIBUTING.md). This comment updates automatically._`;

    await addBotComment(successComment);
    await addLabels([LABEL_PRECHECKS_PASS]);

    const labelsToRemove = [LABEL_NEEDS_CLEANUP, LABEL_PRECHECKS_FAIL];

    if (!codeSignature.isSecModified) {
      labelsToRemove.push(LABEL_NEEDS_MAINTAINER);
    }

    await removeLabels(labelsToRemove);
    core.notice(successComment + '\n\n');
  }
};

export {
  coreContributors,
  doesListContainAnotherListValues,
  getCommentId,
  getPullRequest,
  setComment,
  setLabels,
  signatureScan,
  start
};

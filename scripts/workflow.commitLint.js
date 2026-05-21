/**
 * Available message scope types.
 *
 * @type {Array<string>}
 */
const MESSAGE_TYPES = [
  'feat',
  'fix',
  'docs',
  'style',
  'refactor',
  'perf',
  'test',
  'build',
  'ci',
  'chore',
  'revert'
];

/**
 * Parse a commit message
 *
 * @param {object} params
 * @param {string} params.hash - Commit hash
 * @param {string} params.message - Original commit message, typically the first line.
 * @param {object} settings - Function settings
 * @param {Array<string>} settings.messageTypes - List of available conventional commit types.
 * @param {boolean} settings.allowIssuesAnywhere - Allow issue numbers to appear anywhere. Setting to `false`
 *     limits the issue number placement to the beginning of the description.
 * @returns {{scope: string, description: string, type: string, prNumber: string, hash: string,
 *     typeScope: string, isBreaking: boolean, original: string, message: string, messageLength: number,
 *     issueNumber: string}}
 */
const parseCommitMessage = ({ hash, message }, { messageTypes = MESSAGE_TYPES, allowIssuesAnywhere = true } = {}) => {
  let output;

  const trimmedMessage = message.trim();
  const firstColonIndex = trimmedMessage.indexOf(':');
  const baseTypeScope = firstColonIndex > -1 ? trimmedMessage.substring(0, firstColonIndex) : '';
  const descriptionEtAll = firstColonIndex > -1 ? trimmedMessage.substring(firstColonIndex + 1).trim() : trimmedMessage;
  const prMatch = descriptionEtAll.match(/\s\(#(\d+)\)$/);

  let prNumber = undefined;
  let description = descriptionEtAll;

  if (prMatch) {
    prNumber = prMatch[1];
    description = descriptionEtAll.replace(/\s\(#(\d+)\)$/, '').trim();
  }

  const issueNumberMatch = allowIssuesAnywhere ? description.match(/([a-zA-Z]+[/-]+[0-9]+)/) : description.match(/(^[a-zA-Z]+[/-]+[0-9]+)/);
  let issueNumber = undefined;

  if (issueNumberMatch) {
    issueNumber = issueNumberMatch[0];
  }

  const typeScope = baseTypeScope.replace(/!$/, '').trim();
  let type = typeScope;
  let scope = undefined;

  if (typeScope.includes('(')) {
    const [splitType, splitScope] = typeScope.split('(');

    type = splitType?.trim();
    scope = splitScope?.split(')')?.[0]?.trim();
  }

  const isType = messageTypes.includes(type) && type;

  output = {
    hash,
    typeScope: isType ? typeScope : undefined,
    type: isType ? type : undefined,
    scope: isType ? scope : undefined,
    description: isType ? description : trimmedMessage,
    issueNumber,
    prNumber,
    isBreaking: isType ? /!$/.test(baseTypeScope) : undefined
  };

  const updatedMessage = [
    `${output.typeScope || ''}${(output.isBreaking && '!') || ''}${(output.typeScope && ':') || ''}`,
    output.description
  ]
    .filter(value => Boolean(value))
    .join(' ')
    .trim();

  return {
    ...output,
    messageLength: updatedMessage?.length || 0,
    message: updatedMessage,
    original: message
  };
};

/**
 * Apply valid/invalid checks.
 *
 * @param {Array} parsedMessages
 * @param {object} options - Default options, update accordingly
 * @param {boolean} options.allowIssuesAnywhere - Updates related messaging. See `parseCommitMessage` for parsing behavior.
 * @param {Array|string|undefined} options.issueNumberExceptions - An "undefined" or "false" or "falsy" value
 *     will ignore issue numbers. A string of "*" will allow every type. An array of issue types can be used
 *     to identify which commit message type scopes to ignore, i.e. ['chore', 'fix', 'build', 'perf'].
 *     See NPM conventional-commit-types for full listing options, https://bit.ly/2L0yr6I
 * @param {number} options.maxMessageLength - Max length of the main message string. Messages considered "body"
 *     do not count against this limit.
 * @param {Array<string>|string|undefined} options.typeScopeExceptions - see `options.issueNumberExceptions`
 * @returns {Array}
 */
const messagesList = (
  parsedMessages,
  {
    allowIssuesAnywhere = true,
    issueNumberExceptions = [],
    maxMessageLength = 65,
    typeScopeExceptions = '*'
  } = {}
) =>
  parsedMessages.map(
    ({ messageLength = 0, type = null, scope = null, description = null, message = null, hash = null, issueNumber = null, prNumber = null }) => {
      const typeValid =
        (type && 'valid') || 'INVALID: type (expected known types and format "<type>:" or "<type>(<scope>):")';

      let scopeException = !typeScopeExceptions || typeScopeExceptions === '*';

      if (!scopeException && Array.isArray(typeScopeExceptions) && typeScopeExceptions.length > 0) {
        scopeException = typeScopeExceptions.includes(type);
      }

      const scopeValid = (scopeException && 'valid') || (scope && 'valid') || 'INVALID: scope';

      let issueNumberException = !issueNumberExceptions || issueNumberExceptions === '*';

      if (!issueNumberException && Array.isArray(issueNumberExceptions) && issueNumberExceptions.length > 0) {
        issueNumberException = issueNumberExceptions.includes(type);
      }

      const issueNumberValid =
        (issueNumberException && 'valid') ||
        (issueNumber && 'valid') ||
        (allowIssuesAnywhere && 'INVALID: issue number (expected format "<desc>/<number>" or "<desc>-<number>")') ||
        'INVALID: issue number (expected format "<desc>/<number>" or "<desc>-<number>" at beginning of description)';

      const descriptionValid = (description && 'valid') || 'INVALID: description (missing description)';

      const adjustedMaxMessageLength = issueNumber ? issueNumber.length + 1 + maxMessageLength : maxMessageLength;
      const lengthValid =
        (messageLength <= adjustedMaxMessageLength && 'valid') ||
        `INVALID: message length (${messageLength} > ${maxMessageLength}).${
          prNumber ? ' PRs do not count towards message length.' : ''}${
          issueNumber ? ' Issue numbers do not count towards message length.' : ''}`;

      return {
        hash,
        commit: message,
        type: typeValid,
        scope: scopeValid,
        description: descriptionValid,
        issueNumber: issueNumberValid,
        length: lengthValid
      };
    }
  );

/**
 * If commits exist, lint them.
 *
 * @param {Array<object>} commits
 * @param {object} options - Configuration
 * @param {boolean} options.allowIssuesAnywhere - See `parseCommitMessage` for behavior.
 * @param {Array<string>} options.issueNumberExceptions - See `messagesList` for behavior.
 * @param {number} options.maxMessageLength - See `messagesList` for behavior.
 * @param {Array<string>|string|undefined} options.typeScopeExceptions - See `messagesList` for behavior.
 * @returns {{resultsArray: Array<object>, resultsString: string}} Return linting results
 *    - `resultsArray`: An array of objects representing the "error validated" parts of the message.
 *    - `resultsString`: A `JSON.stringify` version of the `resultsArray` for display.
 */
const start = (commits, { allowIssuesAnywhere, issueNumberExceptions, maxMessageLength, typeScopeExceptions } = {}) => {
  const lintResults = { resultsArray: [], resultsString: '' };

  if (commits) {
    const updatedCommits = commits
      .map(({ sha, commit } = {}) => parseCommitMessage({
        hash: sha.substring(0, 7),
        message: (commit.message || 'empty').split('\n')[0]
      }, { allowIssuesAnywhere }));

    let filteredResults = messagesList(updatedCommits, {
      allowIssuesAnywhere,
      issueNumberExceptions,
      maxMessageLength,
      typeScopeExceptions
    });

    // Mutate and filter valid commits out
    filteredResults.forEach(obj => {
      const updatedObj = obj;

      Object.entries(updatedObj).forEach(([key, value]) => {
        if (value === 'valid') {
          delete updatedObj[key];
        }
      });
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    filteredResults = filteredResults.filter(({ hash, commit, ...rest }) => Object.keys(rest).length > 0);
    lintResults.resultsArray = filteredResults;
    lintResults.resultsString = JSON.stringify(filteredResults, null, 2);
  }

  return lintResults;
};

export { messagesList, parseCommitMessage, start, MESSAGE_TYPES };

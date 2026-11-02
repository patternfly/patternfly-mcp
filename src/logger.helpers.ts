import { isBase64Like, isShaHexLike, parseUrl } from './server.helpers';

/**
 * Secret search string replacement.
 */
const REDACTED = '[REDACTED]';

/**
 * Match potential secret-like param names.
 */
const SECRET_PARAM_REGEXP = /(access[_-]?token|private[_-]?token|token|auth|authorization|api[_-]?key|apikey|key)/i;

/**
 * Match "Bearer" authorization header facets.
 */
const BEARER_HEADER_REGEXP = /(authorization\s*:\s*)(bearer\s+)([^\s"'}]+)(\s*)/gi;

const matchesSecretParam = (value: string, secretParamRegExp: RegExp) => {
  const matcher = secretParamRegExp;

  matcher.lastIndex = 0;

  return matcher.test(value);
};

/**
 * Sanitize header-like content and key-value assignments.
 *
 * @note **Security Scope**:
 * We evaluate sanitization across three tiers of complexity:
 * 1. None: Raw logs with no redaction.
 * 2. Pragmatic / Best-Effort: Simple, deterministic heuristics designed to prevent accidental leaks.
 * 3. Deep / In-Depth: Exhaustive AST or micro-tokenized grammatical parsing.
 *
 * This server deliberately operates at the **Pragmatic / Best-Effort** tier because that satisfies
 * all current server logging and error-reporting requirements. Once a recognized secret header
 * (such as `Authorization:` or `Private-Token:`) is encountered, the remainder of the value is
 * aggressively redacted in its entirety (`[REDACTED]`).
 *
 * @param input - String to sanitize.
 * @param [options] - Configurable options.
 * @param [options.redacted] - Redact default value.
 * @param [options.bearerHeaderRegExp] - Bearer header regex.
 * @param [options.secretParamRegExp] - Secret param regex.
 */
const sanitizeHeaderContent = (input?: unknown, {
  redacted = REDACTED,
  bearerHeaderRegExp = BEARER_HEADER_REGEXP,
  secretParamRegExp = SECRET_PARAM_REGEXP
}: { redacted?: string; bearerHeaderRegExp?: RegExp; secretParamRegExp?: RegExp } = {}) => {
  if (typeof input !== 'string') {
    return undefined;
  }

  const withBearerRedaction = input.replace(
    bearerHeaderRegExp,
    (_m, g1, g2, _g3, suffix) => `${g1}${g2}${redacted}${suffix}`
  );

  const tokens = withBearerRedaction.split(/(\s+|&)/);

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];

    if (!token) {
      continue;
    }

    const eqIdx = token.indexOf('=');

    if (eqIdx > 0) {
      const key = token.substring(0, eqIdx);
      const val = token.substring(eqIdx + 1);

      if (matchesSecretParam(key, secretParamRegExp) && val.length > 0 && val !== redacted) {
        tokens[i] = `${key}=${redacted}`;
      }

      continue;
    }

    const colonIdx = token.indexOf(':');

    if (colonIdx > 0) {
      const key = token.substring(0, colonIdx);

      if (
        /^[a-zA-Z0-9_-]+$/.test(key) &&
        key.toLowerCase() !== 'unauthorized' &&
        matchesSecretParam(key, secretParamRegExp)
      ) {
        const spacing = tokens[i + 1]?.trim() === '' ? tokens[i + 1] : '';

        return `${tokens.slice(0, i).join('')}${token.substring(0, colonIdx + 1)}${spacing}${redacted}`;
      }
    }

    if (
      tokens[i + 1]?.trim() === '' &&
      tokens[i + 2] === ':' &&
      /^[a-zA-Z0-9_-]+$/.test(token) &&
      token.toLowerCase() !== 'unauthorized' &&
      matchesSecretParam(token, secretParamRegExp)
    ) {
      const spacing = tokens[i + 3]?.trim() === '' ? tokens[i + 3] : '';

      return `${tokens.slice(0, i + 3).join('')}${spacing}${redacted}`;
    }
  }

  return tokens.join('');
};

/**
 * Sanitize a URL string.
 *
 * @note **IMPORTANT! Keep matched URL candidates intact.** Do not filter, trim, or strip trailing
 *   delimiter characters (such as `)`, `]`, or `>`) based on surrounding prose. It is ambiguous
 *   and unreliable to determine whether trailing punctuation belongs to the URL or surrounding
 *   text in arbitrary prose; attempting to filter them introduces fragile heuristics and false
 *   positives. Candidates are kept intact and delegated directly to `parseUrl`.
 *
 * @note URL query and basic-auth redaction applies only to candidates accepted by `parseUrl`. Malformed URL-like
 *   text is returned unchanged; this helper is not a general-purpose `key=value` secret scanner.
 *
 * @param input - String to sanitize.
 * @param [options] - Configurable options.
 * @param [options.redacted] - Redact default value.
 * @param [options.secretParamRegExp] - Secret param regex.
 */
const sanitizeUrlContent = (
  input?: unknown,
  { redacted = REDACTED, secretParamRegExp = SECRET_PARAM_REGEXP }: { redacted?: string; secretParamRegExp?: RegExp } = {}
) => {
  if (typeof input !== 'string') {
    return undefined;
  }

  const sanitize = (content: string) => {
    const parsed = parseUrl(content, { asUrlObject: true }) as URL;

    if (!parsed) {
      return content;
    }

    if (parsed.username) {
      parsed.username = redacted;
    }
    if (parsed.password) {
      parsed.password = redacted;
    }

    for (const [paramName] of parsed.searchParams) {
      const isSecretParam = matchesSecretParam(paramName, secretParamRegExp);

      if (isSecretParam) {
        parsed.searchParams.set(paramName, redacted);
      }
    }

    return parsed.toString();
  };

  // IMPORTANT: Keep matched URL candidates intact. Do not filter or strip trailing delimiters (e.g., ')', ']', '>')
  // based on surrounding prose. Delimiter classification in unstructured text is unreliable.
  return input.replace(/https?:\/\/[^\s]+/gi, (urlCandidate: string) =>
    sanitize(urlCandidate) || urlCandidate);
};

/**
 * Scrub long token-like substrings (hex/base64-like) using helpers.
 * This is a conservative pass that avoids changing normal text.
 *
 * @param input - String to sanitize.
 * @param [options] - Configurable options.
 * @param [options.minLength] - Min length of token-like substrings to redact.
 * @param [options.redacted] - Redact default value.
 */
const sanitizeTokenContent = (
  input: unknown,
  { minLength = 8, redacted = REDACTED }: { minLength?: number; redacted?: string } = {}
) => {
  if (typeof input !== 'string') {
    return undefined;
  }

  const placeholder = '__REDACTED_PLACEHOLDER__';
  const maskedInput = input.replaceAll(redacted, placeholder);
  const parts = maskedInput.split(/([\s"'`()<>{}[\],;:]+)/g);

  for (let index = 0; index < parts.length; index += 1) {
    const segment = parts[index];

    if (!segment || segment.includes(placeholder) || segment.includes(redacted)) {
      continue;
    }

    if (isShaHexLike(segment, { minLength }) || isBase64Like(segment, { minLength, requireSignalChars: true })) {
      parts[index] = redacted;
    }
  }

  return parts.join('').replaceAll(placeholder, redacted);
};

/**
 * Best-effort sanitization of log text by redacting:
 * - Authorization header patterns and secret key/token assignments
 * - Secrets in parseable URL candidates (query params, basic auth) via sanitizeUrlContent
 * - Long token-like substrings (hex/base64-like)
 *
 * @note This helper does not guarantee redaction of malformed URL-like text or unrecognized
 * short key/value patterns, it is a best-effort attempt. See {@link sanitizeHeaderContent}
 *
 * @param input
 */
const sanitizeMessage = (
  input: unknown
): string => {
  let content: string;

  if (typeof input === 'string') {
    content = input;
  } else if (input instanceof Error) {
    if (input.stack) {
      content = input.stack;
    } else if (input.message) {
      content = input.message;
    } else {
      content = String(input);
    }
  } else {
    try {
      content = JSON.stringify(input);
    } catch {
      content = String(input);
    }
  }
  // Sweep common header styles
  content = sanitizeHeaderContent(content) || content;

  // Sweep inside URLs
  content = sanitizeUrlContent(content) || content;

  // Sweep for token-like strings.
  return sanitizeTokenContent(content) || content;
};

export {
  sanitizeHeaderContent,
  sanitizeMessage,
  sanitizeUrlContent,
  sanitizeTokenContent
};

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

/**
 * Sanitize header-like content and key-value assignments.
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

      if (secretParamRegExp.test(key) && val.length > 0 && val !== redacted) {
        tokens[i] = `${key}=${redacted}`;
      }

      continue;
    }

    const colonIdx = token.indexOf(':');

    if (colonIdx > 0) {
      const key = token.substring(0, colonIdx);
      const rest = token.substring(colonIdx + 1);

      if (/^[a-zA-Z0-9_-]+$/.test(key) && key.toLowerCase() !== 'unauthorized' && secretParamRegExp.test(key)) {
        if (rest.length > 0 && rest !== redacted && rest.toLowerCase() !== 'bearer') {
          tokens[i] = `${key}:${redacted}`;
        } else if (rest.length === 0 && i + 2 < tokens.length) {
          const nextVal = tokens[i + 2];

          if (nextVal && nextVal !== redacted && nextVal.toLowerCase() !== 'bearer') {
            tokens[i + 2] = redacted;
          }
        }
      }
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
      const isSecretParam = secretParamRegExp.test(paramName);

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
 * short key/value patterns, it is a best-effort attempt.
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

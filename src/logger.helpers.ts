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
 * Match for private token assignments.
 */
const PRIVATE_TOKEN_REGEXP = /(private[_-]?token\s*[:=]\s*)([^\s&]+)/gi;

/**
 * Sanitize header-like content.
 *
 * @param input - String to sanitize.
 * @param [options] - Configurable options.
 * @param [options.redacted] - Redact default value.
 * @param [options.bearerHeaderRegExp] - Bearer header regex.
 * @param [options.privateTokenRegExp] - Private token regex.
 */
const sanitizeHeaderContent = (input?: unknown, {
  redacted = REDACTED,
  bearerHeaderRegExp = BEARER_HEADER_REGEXP,
  privateTokenRegExp = PRIVATE_TOKEN_REGEXP
}: { redacted?: string; bearerHeaderRegExp?: RegExp; privateTokenRegExp?: RegExp } = {}) => {
  if (typeof input !== 'string') {
    return undefined;
  }

  const withBearerRedaction = input.replace(
    bearerHeaderRegExp,
    (_m, g1, g2, _g3, suffix) => `${g1}${g2}${redacted}${suffix}`
  );

  return withBearerRedaction.replace(privateTokenRegExp, (_m, g1) => `${g1}${redacted}`);
};

/**
 * Sanitize a URL string.
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

  return input.replace(/https?:\/\/[^\s)]+/gi, (urlCandidate: string) =>
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
 * Sanitize arbitrary text for logs by redacting:
 * - Authorization/Private-Token header patterns
 * - Secrets embedded in URLs (query params, basic auth) via sanitizeUrl
 * - Long token-like substrings (hex/base64-like)
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

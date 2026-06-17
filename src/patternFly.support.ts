import { isUrl } from './server.helpers';

/**
 * Check if a value is a valid PatternFly URI.
 *
 * @param uri - URI to check
 * @returns `true` if the string is a valid PatternFly URI.
 */
const isPatternFlyUri = (uri: unknown): uri is string => isUrl(uri, { allowedProtocols: ['patternfly'] });

export {
  isPatternFlyUri
};

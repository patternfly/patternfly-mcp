import { z } from 'zod';
import { mcpAssert } from './server.assertions';

/**
 * Validates that each URL in the provided list uses one of the allowed schemes.
 *
 * @param urls - The list of URLs to be validated.
 * @param protocols - Allowed scheme names (e.g. `['http', 'https']`). Each URL’s scheme is compared
 *   after normalizing to include a trailing colon (e.g. `http` matches `http:`).
 *
 * @throws {Error} Throws an error if any URL does not use one of the specified protocols.
 */
const assertProtocol = (urls: string[], protocols: string[]) => {
  const validate = z.array(
    z.string().url().refine(
      url => {
        try {
          const urlScheme = new URL(url).protocol;

          return protocols.some(protocol => {
            const expected = protocol.endsWith(':') ? protocol : `${protocol}:`;

            return urlScheme === expected.toLowerCase();
          });
        } catch {
          return false;
        }
      },
      {
        message: `Protocol entries must use allowed protocols: ${protocols.join(', ')}`
      }
    )
  );

  const result = validate.safeParse(urls);

  mcpAssert(
    result.success,
    () => `Invalid URL protocol configuration: ${result.error?.message || urls.map(url => url.slice(0, 50)).join(', ')}`
  );
};

export { assertProtocol };

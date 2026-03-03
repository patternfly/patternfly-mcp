import { z } from 'zod';
import { mcpAssert } from './server.assertions';

/**
 * Validates that each URL in the provided list adheres to at least one of the specified protocols.
 *
 * @param urls - The list of URLs to be validated.
 * @param protocols - The list of allowed protocols that each URL must start with (e.g., ['http://', 'https://']).
 *
 * @throws {Error} Throws an error if any URL does not start with one of the specified protocols.
 */
const assertProtocol = (urls: string[], protocols: string[]) => {
  const validate = z.array(
    z.string().url().refine(
      url => protocols.some(protocol => url.startsWith(protocol)),
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

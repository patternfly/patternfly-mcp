import { z } from 'zod';
import { mcpAssert, type AssertCodeOrError } from './server.assertions';

/**
 * Validates that each URL in the provided list uses one of the allowed schemes.
 *
 * @param urls - The list of URLs to be validated.
 * @param protocols - Allowed scheme names (e.g. `['http', 'https']`). Each URL’s scheme is compared
 *   after normalizing to include a trailing colon (e.g. `http` matches `http:`).
 * @param [options] - Validation options
 * @param [options.codeOrError] - Thrown error code when validation fails OR a function that returns an
 *     error. Defaults to `ErrorCode.InvalidParams`.
 *
 * @throws {Error} Throws an error if any URL does not use one of the specified protocols.
 * @throws Error When `codeOrError` is provided an error factory.
 */
const assertProtocol = (
  urls: string[],
  protocols: string[],
  { codeOrError }: { codeOrError?: AssertCodeOrError } = {}
) => {
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
    () => `Invalid URL protocol configuration: ${result.error?.message || urls.map(url => url.slice(0, 50)).join(', ')}`,
    codeOrError
  );
};

export { assertProtocol };

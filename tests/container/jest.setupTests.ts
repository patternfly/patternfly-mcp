// Shared helpers for audit Jest tests

declare global {
  var describeSkip: (check: unknown) => typeof describe | typeof describe.skip;
}

/**
 * Conditionally skip "describe" blocks.
 *
 * @example
 *   describeSkip(true)('should do a thing...', () => { ... });
 *
 * @param {*|boolean} check - Any `truthy`/`falsy` value
 * @returns On `truthy` returns `describe`, on `falsy` returns `describe.skip`.
 */
export const describeSkip = (check: unknown): typeof describe | typeof describe.skip => (check ? describe : describe.skip);

global.describeSkip = describeSkip;


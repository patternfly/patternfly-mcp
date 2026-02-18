// Shared helpers for e2e Jest tests
import { jest } from '@jest/globals';

declare global {
  var envNodeVersion: number;
  var itSkip: (check: unknown) => typeof it | typeof it.skip;
}

/**
 * Get the Node.js major version of the current process.
 *
 * @param fallback - Fallback value if the major version cannot be determined. Defaults to `0`.
 */
export const getNodeVersion = (fallback: number = 0) => {
  const major = Number.parseInt(process?.versions?.node?.split?.('.')?.[0] || String(fallback), 10);

  if (Number.isFinite(major)) {
    return major;
  }

  return fallback;
};

/**
 * The Node.js major version of the current process.
 */
export const envNodeVersion = getNodeVersion(22);

global.envNodeVersion = envNodeVersion;

/**
 * Conditionally skip "it" test statements.
 *
 * @example
 *   itSkip(true)('should do a thing...', () => { ... });
 *
 * @param {*|boolean} check - Any `truthy`/`falsy` value
 * @returns On `truthy` returns `it`, on `falsy` returns `it.skip`.
 */
export const itSkip = (check: unknown): typeof it | typeof it.skip => (check ? it : it.skip);

global.itSkip = itSkip;

/**
 * Store the original fetch implementation
 * Tests can access this to get the real fetch when needed
 */
export const originalFetch = global.fetch;

/**
 * Set up global.fetch spy for e2e tests
 *
 * This creates a spy on global.fetch that can be overridden by individual tests.
 * Tests can use jest.spyOn(global, 'fetch').mockImplementation() to customize behavior.
 *
 * The spy is automatically restored after each test suite via jest.restoreAllMocks().
 * Individual tests should restore their mocks in afterAll/afterEach if needed.
 */
beforeAll(() => {
  jest.spyOn(global, 'fetch');
});

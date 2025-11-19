// Shared helpers for e2e Jest tests
import { jest } from '@jest/globals';

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

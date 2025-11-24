/**
 * Mock implementation of utils.moduleResolver for Jest tests
 * This avoids import.meta.resolve compatibility issues in test environment
 */

export const resolveModule = jest.fn((modulePath: string): string =>
  // Default mock behavior - can be overridden in individual tests
  `file://${modulePath}`);

/**
 * Fixture Loading Utilities for E2E Tests
 *
 * Provides helpers for loading fixture files from the test fixtures directory.
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * Load a fixture file from the __fixtures__ directory.
 *
 * @param relPath - Relative path to the fixture file.
 * @returns File content.
 * @throws {Error} File cannot be found or read.
 */
export const loadFixture = (relPath: string): string =>
  fs.readFileSync(path.join(process.cwd(), 'tests', '__fixtures__', 'http', relPath), 'utf-8');


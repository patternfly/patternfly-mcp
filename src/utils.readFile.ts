/**
 * the bundler is stripping some parameters form dynamic imports which makes it impossible to import json files correctly
 * WHen using const a = await import('path/to/file.json', { with: { type: 'json' } });
 * the resulted JS bundle is stripped to
 * const a = await import('path/to/file.json');
 *
 * This file is to workaround that issue by reading the file content directly
 *  */

import { promisify } from 'node:util';
import { readFile } from 'node:fs';

export const readFileAsync = promisify(readFile);

export const readJsonFile = async <T>(filePath: string): Promise<T> => {
  const data = await readFileAsync(filePath, 'utf-8');

  return JSON.parse(data) as T;
};

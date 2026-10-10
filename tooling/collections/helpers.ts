import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Options for writeJsonCollection.
 */
interface WriteJsonCollectionOptions {
  isPrettyPrint?: boolean;
  startTime?: number;
  stats?: Array<{ label: string; value: string | number }>;
}

/**
 * Serialize data to JSON, write to target path, and log file size and elapsed time.
 *
 * @param targetPath - Absolute or relative file path for JSON output
 * @param data - Data payload to serialize
 * @param [options={}] - Output and logging options
 * @returns Serialized JSON content and formatted metrics
 */
const writeJsonCollection = async <T>(
  targetPath: string,
  data: T,
  options: WriteJsonCollectionOptions = {}
): Promise<{ jsonContent: string; sizeKb: string; durationSec: string }> => {
  const isPretty = options.isPrettyPrint !== false;
  const jsonContent = isPretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);

  await writeFile(targetPath, jsonContent + '\n', 'utf-8');

  const durationSec = options.startTime ? ((Date.now() - options.startTime) / 1000).toFixed(1) : '0.0';
  const sizeKb = (Buffer.byteLength(jsonContent, 'utf-8') / 1024).toFixed(1);

  console.log(`✅ Updated ${targetPath}:`);
  if (options.stats) {
    for (const { label, value } of options.stats) {
      console.log(`   - ${label}: ${value}`);
    }
  }
  console.log(`   - File Size: ${sizeKb} KB`);
  if (options.startTime) {
    console.log(`   - Time Elapsed: ${durationSec}s`);
  }

  return { jsonContent, sizeKb, durationSec };
};

/**
 * Resolve the default absolute path for a JSON collection file in the src directory.
 *
 * @param filename - Collection JSON filename
 * @param [path] - Default optional path to prepend to the filename.
 * @returns Fully resolved filesystem path in the src directory
 */
const getSrcPath = (filename: string, path: string = '../../src'): string =>
  resolve(fileURLToPath(new URL(`${path}/${filename}`, import.meta.url)));

/**
 * Resolve the default absolute path for a report file in the reports directory.
 *
 * @param filename - Report filename
 * @param [path] - Default optional path to prepend to the filename.
 * @returns Fully resolved filesystem path in the reports directory
 */
const getReportsPath = (filename: string, path: string = '../../reports'): string =>
  getSrcPath(filename, path);

/**
 * Generic lifecycle runner for collection update tasks invoked via environment variables.
 *
 * @param taskName - Human-readable name of the task for logging
 * @param taskFn - Async task function to execute
 * @param [options={}] - Execution options
 * @param [options.envVar='UPDATE_COLLECTIONS'] - Environment variable trigger name
 */
const runUpdateTask = async (
  taskName: string,
  taskFn: () => Promise<unknown>,
  options: { envVar?: string } = { envVar: 'UPDATE_COLLECTIONS' }
): Promise<void> => {
  if (process.env[options.envVar || 'UPDATE_COLLECTIONS'] === 'true') {
    try {
      await taskFn();
    } catch (error) {
      console.error(`❌ Failed to update ${taskName}:`, error);
      process.exit(1);
    }
  }
};

export {
  getReportsPath,
  getSrcPath,
  runUpdateTask,
  writeJsonCollection,
  type WriteJsonCollectionOptions
};

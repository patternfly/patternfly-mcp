import { writeFile } from 'node:fs/promises';
import {
  getReportsPath,
  getSrcPath,
  runUpdateTask,
  writeJsonCollection
} from '../helpers';

jest.mock('node:fs/promises', () => ({
  ...jest.requireActual('node:fs/promises'),
  writeFile: jest.fn()
}));

const mockWriteFile = writeFile as jest.MockedFunction<typeof writeFile>;

describe('writeJsonCollection', () => {
  let logSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    mockWriteFile.mockResolvedValue(undefined as never);
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should format JSON as pretty-printed by default with trailing newline', async () => {
    const targetPath = '/path/to/collection.json';
    const data = { key: 'value', count: 42 };

    const result = await writeJsonCollection(targetPath, data);

    const expectedJson = JSON.stringify(data, null, 2);

    expect(mockWriteFile).toHaveBeenCalledWith(targetPath, expectedJson + '\n', 'utf-8');
    expect(result.jsonContent).toBe(expectedJson);
    expect(logSpy).toHaveBeenCalledWith(`✅ Updated ${targetPath}:`);
    expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/File Size: \d+\.\d+ KB/));
  });

  it('should format JSON in compact format when isPrettyPrint is false', async () => {
    const targetPath = '/path/to/compact.json';
    const data = { a: 1, b: 2 };

    const result = await writeJsonCollection(targetPath, data, { isPrettyPrint: false });

    const expectedJson = JSON.stringify(data);

    expect(mockWriteFile).toHaveBeenCalledWith(targetPath, expectedJson + '\n', 'utf-8');
    expect(result.jsonContent).toBe(expectedJson);
  });

  it('should calculate elapsed time when startTime is supplied and log custom stats', async () => {
    const targetPath = '/path/to/stats.json';
    const data = { items: [1, 2, 3] };
    const startTime = Date.now() - 1500;

    const result = await writeJsonCollection(targetPath, data, {
      startTime,
      stats: [
        { label: 'Total Items', value: 3 },
        { label: 'Status', value: 'OK' }
      ]
    });

    expect(logSpy).toHaveBeenCalledWith('   - Total Items: 3');
    expect(logSpy).toHaveBeenCalledWith('   - Status: OK');
    expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/Time Elapsed: \d+\.\d+s/));
    expect(typeof result.durationSec).toBe('string');
    expect(typeof result.sizeKb).toBe('string');
  });
});

describe('getSrcPath', () => {
  it('should resolve default path containing the filename within src directory', () => {
    const resolved = getSrcPath('test.json');

    expect(resolved.endsWith('src/test.json')).toBe(true);
  });

  it('should support custom path overrides', () => {
    const resolved = getSrcPath('custom.json', '../../custom');

    expect(resolved.endsWith('custom/custom.json')).toBe(true);
  });
});

describe('getReportsPath', () => {
  it('should be an aliased function', () => {
    expect(typeof getReportsPath).toBe('function');
  });
});

describe('runUpdateTask', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it.each([
    {
      description: 'default env var unset',
      env: {},
      options: undefined,
      shouldInvoke: false
    },
    {
      description: 'default UPDATE_COLLECTIONS set to true',
      env: { UPDATE_COLLECTIONS: 'true' },
      options: undefined,
      shouldInvoke: true
    },
    {
      description: 'custom env variable set to true',
      env: { CUSTOM_TRIGGER: 'true' },
      options: { envVar: 'CUSTOM_TRIGGER' },
      shouldInvoke: true
    }
  ])('should handle execution trigger condition, $description', async ({ env, options, shouldInvoke }) => {
    Object.assign(process.env, env);
    const taskFn = jest.fn().mockResolvedValue(undefined);

    await runUpdateTask('Test Task', taskFn, options);

    expect(taskFn).toHaveBeenCalledTimes(shouldInvoke ? 1 : 0);
  });

  it('should catch task errors, log failure message, and exit with status code 1', async () => {
    process.env.UPDATE_COLLECTIONS = 'true';
    const testError = new Error('Task execution failed');
    const taskFn = jest.fn().mockRejectedValue(testError);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {}) as any);

    await runUpdateTask('Failing Task', taskFn);

    expect(errorSpy).toHaveBeenCalledWith('❌ Failed to update Failing Task:', testError);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

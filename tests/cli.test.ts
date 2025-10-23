/**
 * CLI functionality tests for the PatternFly MCP server.
 * This verifies CLI argument parsing and integration with options management.
 * Focuses on CLI-specific functionality and parsing behavior.
 */

import { start, type ServerInstance } from '../src/index';
import { OPTIONS, parseCliOptions } from '../src/options';

describe('CLI Functionality', () => {
  let originalArgv: string[];
  let serverInstances: ServerInstance[] = [];

  beforeEach(() => {
    // Store original process.argv
    originalArgv = process.argv;
    // Clear server instances array
    serverInstances = [];
  });

  afterEach(async () => {
    // Clean up all server instances
    for (const server of serverInstances) {
      if (server.isRunning()) {
        await server.stop();
      }
    }
    serverInstances = [];

    // Restore original process.argv
    process.argv = originalArgv;
  });

  describe('CLI Usage', () => {
    it('should handle CLI with --docs-host flag', async () => {
      process.argv = ['node', 'script.js', '--docs-host'];

      // Test parseCliOptions
      const cliOptions = parseCliOptions();

      expect(cliOptions.docsHost).toBe(true);

      // Test start() with CLI options
      const server = await start(cliOptions);

      serverInstances.push(server);
      expect(OPTIONS.docsHost).toBe(true);
      expect(server.isRunning()).toBe(true);
    });

    it('should handle CLI without --docs-host flag', async () => {
      process.argv = ['node', 'script.js'];

      // Test parseCliOptions
      const cliOptions = parseCliOptions();

      expect(cliOptions.docsHost).toBe(false);

      // Test start() with CLI options
      const server = await start(cliOptions);

      serverInstances.push(server);
      expect(OPTIONS.docsHost).toBe(false);
      expect(server.isRunning()).toBe(true);
    });

    it('should handle CLI with other arguments', async () => {
      process.argv = ['node', 'script.js', '--other-flag', 'value'];

      // Test parseCliOptions
      const cliOptions = parseCliOptions();

      expect(cliOptions.docsHost).toBe(false);

      // Test start() with CLI options
      const server = await start(cliOptions);

      serverInstances.push(server);
      expect(OPTIONS.docsHost).toBe(false);
      expect(server.isRunning()).toBe(true);
    });

    it('should handle multiple CLI calls', async () => {
      // First CLI call with --docs-host
      process.argv = ['node', 'script.js', '--docs-host'];
      const cliOptions1 = parseCliOptions();

      const server1 = await start(cliOptions1);

      serverInstances.push(server1);

      expect(cliOptions1.docsHost).toBe(true);
      expect(OPTIONS.docsHost).toBe(true);
      expect(server1.isRunning()).toBe(true);

      // Second CLI call without --docs-host
      process.argv = ['node', 'script.js'];
      const cliOptions2 = parseCliOptions();

      const server2 = await start(cliOptions2);

      serverInstances.push(server2);

      expect(cliOptions2.docsHost).toBe(false);
      expect(OPTIONS.docsHost).toBe(false);
      expect(server2.isRunning()).toBe(true);
    });
  });
});

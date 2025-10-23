/**
 * Programmatic API tests for the PatternFly MCP server.
 * This verifies the programmatic usage of start() function and OPTIONS management.
 * Focuses on sessionId verification and programmatic API behavior.
 * Tests actual server instances with proper cleanup.
 */

import { start, type CliOptions, type ServerInstance } from '../src/index';
import { OPTIONS } from '../src/options';

describe('Programmatic API Usage', () => {
  it('should handle multiple start() calls with different options and unique sessionIds', async () => {
    // First start() call
    const firstOptions: Partial<CliOptions> = { docsHost: true };
    const server1 = await start(firstOptions);

    expect(OPTIONS.docsHost).toBe(true);
    expect(OPTIONS.sessionId).toBeDefined();
    const firstSessionId = OPTIONS.sessionId;

    expect(server1.isRunning()).toBe(true);

    // Second start() call with different options
    const secondOptions: Partial<CliOptions> = { docsHost: false };
    const server2 = await start(secondOptions);

    expect(OPTIONS.docsHost).toBe(false);
    expect(OPTIONS.sessionId).toBeDefined();
    expect(OPTIONS.sessionId).not.toBe(firstSessionId);
    expect(server2.isRunning()).toBe(true);

    // Third start() call with no options
    const thirdOptions: Partial<CliOptions> = {};
    const server3 = await start(thirdOptions);

    expect(OPTIONS.docsHost).toBe(false);
    expect(OPTIONS.sessionId).toBeDefined();
    expect(OPTIONS.sessionId).not.toBe(firstSessionId);
    expect(server3.isRunning()).toBe(true);

    await server1.stop({ exitProcess: false });
    await server2.stop({ exitProcess: false });
    await server3.stop({ exitProcess: false });
  });
});

/*
describe('Programmatic API Usage', () => {
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

  describe('Programmatic start() calls', () => {
    it('should handle multiple start() calls with different options and unique sessionIds', async () => {
      // First start() call
      const firstOptions: Partial<CliOptions> = { docsHost: true };

      const server1 = await start(firstOptions);

      serverInstances.push(server1);

      expect(OPTIONS.docsHost).toBe(true);
      expect(OPTIONS.sessionId).toBeDefined();
      const firstSessionId = OPTIONS.sessionId;

      expect(server1.isRunning()).toBe(true);

      // Second start() call with different options
      const secondOptions: Partial<CliOptions> = { docsHost: false };

      const server2 = await start(secondOptions);

      serverInstances.push(server2);

      expect(OPTIONS.docsHost).toBe(false);
      expect(OPTIONS.sessionId).toBeDefined();
      expect(OPTIONS.sessionId).not.toBe(firstSessionId);
      expect(server2.isRunning()).toBe(true);

      // Third start() call with no options
      const server3 = await start({});

      serverInstances.push(server3);

      expect(OPTIONS.docsHost).toBe(false);
      expect(OPTIONS.sessionId).toBeDefined();
      expect(OPTIONS.sessionId).not.toBe(firstSessionId);
      expect(server3.isRunning()).toBe(true);
    });

    it('should handle multiple start() calls with same options but unique sessionIds', async () => {
      const options: Partial<CliOptions> = { docsHost: true };

      // Multiple calls with same options
      const server1 = await start(options);

      serverInstances.push(server1);
      expect(OPTIONS.docsHost).toBe(true);
      expect(OPTIONS.sessionId).toBeDefined();
      const firstSessionId = OPTIONS.sessionId;

      expect(server1.isRunning()).toBe(true);

      const server2 = await start(options);

      serverInstances.push(server2);
      expect(OPTIONS.docsHost).toBe(true);
      expect(OPTIONS.sessionId).toBeDefined();
      expect(OPTIONS.sessionId).not.toBe(firstSessionId);
      expect(server2.isRunning()).toBe(true);

      const server3 = await start(options);

      serverInstances.push(server3);
      expect(OPTIONS.docsHost).toBe(true);
      expect(OPTIONS.sessionId).toBeDefined();
      expect(OPTIONS.sessionId).not.toBe(firstSessionId);
      expect(server3.isRunning()).toBe(true);
    });

    it('should handle start() calls with empty options and unique sessionIds', async () => {
      // Start with some value
      const initialOptions: Partial<CliOptions> = { docsHost: true };

      const server1 = await start(initialOptions);

      serverInstances.push(server1);
      expect(OPTIONS.docsHost).toBe(true);
      expect(OPTIONS.sessionId).toBeDefined();
      const firstSessionId = OPTIONS.sessionId;

      expect(server1.isRunning()).toBe(true);

      // Call with empty options - this will reset to default value
      const server2 = await start({});

      serverInstances.push(server2);
      expect(OPTIONS.docsHost).toBe(false); // Will reset to default
      expect(OPTIONS.sessionId).toBeDefined();
      expect(OPTIONS.sessionId).not.toBe(firstSessionId);
      expect(server2.isRunning()).toBe(true);

      // Call with undefined options - this will also reset to default value
      const server3 = await start(undefined as any);

      serverInstances.push(server3);
      expect(OPTIONS.docsHost).toBe(false); // Will reset to default
      expect(OPTIONS.sessionId).toBeDefined();
      expect(OPTIONS.sessionId).not.toBe(firstSessionId);
      expect(server3.isRunning()).toBe(true);
    });

    it('should create fresh instances for each start() call with unique sessionIds', async () => {
      const options: Partial<CliOptions> = { docsHost: true };

      // First call
      const server1 = await start(options);

      serverInstances.push(server1);
      const firstDocsHost = OPTIONS.docsHost;
      const firstSessionId = OPTIONS.sessionId;

      expect(server1.isRunning()).toBe(true);

      // Second call with different options
      const secondOptions: Partial<CliOptions> = { docsHost: false };

      const server2 = await start(secondOptions);

      serverInstances.push(server2);
      const secondDocsHost = OPTIONS.docsHost;
      const secondSessionId = OPTIONS.sessionId;

      expect(server2.isRunning()).toBe(true);

      // Third call with original options
      const server3 = await start(options);

      serverInstances.push(server3);
      const thirdDocsHost = OPTIONS.docsHost;
      const thirdSessionId = OPTIONS.sessionId;

      expect(server3.isRunning()).toBe(true);

      // Verify values changed as expected
      expect(firstDocsHost).toBe(true);
      expect(secondDocsHost).toBe(false);
      expect(thirdDocsHost).toBe(true);

      // Verify all sessionIds are different
      expect(firstSessionId).not.toBe(secondSessionId);
      expect(secondSessionId).not.toBe(thirdSessionId);
      expect(firstSessionId).not.toBe(thirdSessionId);
    });

    it('should handle concurrent start() calls with unique sessionIds', async () => {
      const options1: Partial<CliOptions> = { docsHost: true };
      const options2: Partial<CliOptions> = { docsHost: false };

      // Start multiple calls concurrently
      const server1 = await start(options1);

      serverInstances.push(server1);
      const firstSessionId = OPTIONS.sessionId;

      expect(server1.isRunning()).toBe(true);

      const server2 = await start(options2);

      serverInstances.push(server2);
      const secondSessionId = OPTIONS.sessionId;

      expect(server2.isRunning()).toBe(true);

      const server3 = await start({});

      serverInstances.push(server3);
      const thirdSessionId = OPTIONS.sessionId;

      expect(server3.isRunning()).toBe(true);

      // OPTIONS should reflect the last call
      expect(OPTIONS.docsHost).toBe(false);

      // Verify all sessionIds are different
      expect(firstSessionId).not.toBe(secondSessionId);
      expect(secondSessionId).not.toBe(thirdSessionId);
      expect(firstSessionId).not.toBe(thirdSessionId);
    });
  });

  describe('OPTIONS State Management', () => {
    it('should maintain OPTIONS state across multiple calls', async () => {
      // First call
      const firstOptions: Partial<CliOptions> = { docsHost: true };

      const server1 = await start(firstOptions);

      serverInstances.push(server1);
      expect(OPTIONS.docsHost).toBe(true);
      expect(server1.isRunning()).toBe(true);

      // Second call
      const secondOptions: Partial<CliOptions> = { docsHost: false };

      const server2 = await start(secondOptions);

      serverInstances.push(server2);
      expect(OPTIONS.docsHost).toBe(false);
      expect(server2.isRunning()).toBe(true);

      // Third call with no options
      const server3 = await start({});

      serverInstances.push(server3);
      expect(OPTIONS.docsHost).toBe(false);
      expect(server3.isRunning()).toBe(true);
    });

    it('should handle OPTIONS updates correctly', async () => {
      const options: Partial<CliOptions> = { docsHost: true };

      // First call
      const server1 = await start(options);

      serverInstances.push(server1);
      expect(OPTIONS.docsHost).toBe(true);
      expect(server1.isRunning()).toBe(true);

      // Modify the options object
      options.docsHost = false;

      // Second call with modified options
      const server2 = await start(options);

      serverInstances.push(server2);
      expect(OPTIONS.docsHost).toBe(false);
      expect(server2.isRunning()).toBe(true);
    });

    it('should handle concurrent OPTIONS updates', async () => {
      const options1: Partial<CliOptions> = { docsHost: true };
      const options2: Partial<CliOptions> = { docsHost: false };

      // Start multiple calls concurrently
      const server1 = await start(options1);

      serverInstances.push(server1);
      expect(server1.isRunning()).toBe(true);

      const server2 = await start(options2);

      serverInstances.push(server2);
      expect(server2.isRunning()).toBe(true);

      const server3 = await start({});

      serverInstances.push(server3);
      expect(server3.isRunning()).toBe(true);

      // OPTIONS should reflect the last call
      expect(OPTIONS.docsHost).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid options gracefully', async () => {
      // Test with invalid options
      const invalidOptions = { invalidProperty: 'value' } as any;

      const server = await start(invalidOptions);

      serverInstances.push(server);

      // Should not throw and server should be running
      expect(server.isRunning()).toBe(true);
    });

    it('should handle null/undefined options', async () => {
      // Test with null options
      const server1 = await start(null as any);

      serverInstances.push(server1);
      expect(server1.isRunning()).toBe(true);

      // Test with undefined options
      const server2 = await start(undefined as any);

      serverInstances.push(server2);
      expect(server2.isRunning()).toBe(true);
    });

    it('should handle empty options object', async () => {
      const emptyOptions = {};

      const server = await start(emptyOptions);

      serverInstances.push(server);

      // Should not throw and server should be running
      expect(server.isRunning()).toBe(true);
    });
  });
});
*/

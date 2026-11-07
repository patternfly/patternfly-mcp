/**
 * Requires: npm run build prior to running Jest.
 * - If typings are needed, use public types from dist to avoid type identity mismatches between src and dist
 */
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';

// @ts-ignore - dist/ isn't necessarily built yet; run npm run build before e2e tests
import { start } from '../../dist/index.js';

const execFileAsync = promisify(execFile);
const cliPath = resolve(process.cwd(), 'dist/cli.js');

describe('CLI environment checks and arguments', () => {
  it('should exit with error when --experimental-client is invoked without an interactive TTY', async () => {
    let exitError: any;

    try {
      await execFileAsync(
        process.execPath,
        [cliPath, '--experimental-client'],
        { cwd: process.cwd(), env: process.env }
      );
    } catch (error) {
      exitError = error;
    }

    expect(exitError).toBeDefined();
    expect(exitError?.code).toBe(1);
    expect(exitError?.stderr).toContain('The MCP client option requires an interactive terminal (TTY).');
  });

  it('should ignore unprefixed --client flag as an unrecognized flag', async () => {
    let exitError: any;

    try {
      await execFileAsync(
        process.execPath,
        [cliPath, '--mode', 'test', '--client'],
        { cwd: process.cwd(), env: process.env, timeout: 1000 }
      );
    } catch (error) {
      exitError = error;
    }

    expect(exitError?.stderr).not.toContain('The MCP client option requires an interactive terminal (TTY).');
  });

  it('should sanitize client option when started programmatically', async () => {
    const server = await start({
      mode: 'programmatic',
      experimentalClient: true
    });

    expect(server.isRunning()).toBe(true);
    await server.stop();
    expect(server.isRunning()).toBe(false);
  });
});

describe('Interactive MCP client', () => {
  it('should start interactive terminal client and respond to search query', async () => {
    const child = spawn('node', [
      '--input-type=module',
      '-e',
      `
      Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
      Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
      process.argv = ['node', '${cliPath}', '--experimental-client'];
      import('${cliPath}');
    `
    ]);

    let output = '';

    const searchCompleted = new Promise<void>((resolve, reject) => {
      let querySubmitted = false;

      child.stdout.on('data', data => {
        const str = data.toString();

        output += str;

        if (!querySubmitted && (output.includes('Search:') || output.includes('Enter search term'))) {
          querySubmitted = true;
          child.stdin.write('button\n');
        }

        if (output.includes('[Collection] button')) {
          child.kill('SIGINT');
        }
      });

      child.on('close', () => resolve());
      child.on('error', reject);
    });

    await searchCompleted;

    expect(output).toContain('PatternFly Search: "button"');
    expect(output).toContain('[Collection] button');
  });
});

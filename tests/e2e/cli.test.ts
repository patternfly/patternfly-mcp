/**
 *  Requires: npm run build prior to running Jest.
 * - If typings are needed, use public types from dist to avoid type identity mismatches between src and dist
 * - We're unable to mock fetch for stdio since it runs in a separate process, so we run a server and use that path for mocking external URLs.
 */
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { startServer } from './utils/stdioTransportClient';

describe('CLI', () => {
  const cliPath = resolve(process.cwd(), 'dist/cli.js');

  it('should start and respond successfully', async () => {
    const client = await startServer({
      serverPath: cliPath,
      args: ['--mode', 'test']
    });

    const response = await client.send({
      method: 'tools/list',
      params: {}
    });

    expect(response?.result?.tools).toBeDefined();
    expect(Array.isArray(response.result.tools)).toBe(true);

    await client.close();
  });

  it('should exit when node version check fails', async () => {
    const child = spawn('node', [
      '--input-type=module',
      '-e',
      "Object.defineProperty(process.versions, 'node', {value: '14.0.0'}); import('./dist/cli.js')"
    ]);

    let stderr = '';

    child.stderr.on('data', data => {
      stderr += data.toString();
    });

    const exitCode = await new Promise(resolve => {
      child.on('close', resolve);
    });

    expect(exitCode).toBe(1);
    expect(stderr).toContain('Engine requirements not met');
    expect(stderr).toContain('Node.js version 14 found');
  });

  it('should show troubleshooting links on runtime error', async () => {
    const child = spawn('node', [cliPath, '--mode', 'test', '--http', '--port', '1']);

    let stderr = '';

    child.stderr.on('data', data => {
      stderr += data.toString();
    });

    const exitCode = await new Promise(resolve => {
      child.on('close', resolve);
    });

    expect(exitCode).toBe(1);
    expect(stderr).toContain('Troubleshooting Guide');
    expect(stderr).toContain('To report bugs');
  });
});

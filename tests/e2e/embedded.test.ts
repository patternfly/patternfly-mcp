/**
 * Requires: npm run build prior to running Jest.
 * E2E tests validating the behavior of the MCP server when embedded/wrapped in a host application.
 */
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { setupSimpleFetchMock, type FetchMockResult } from './utils/fetchMock';

describe('Embedded Server', () => {
  const distIndexPath = resolve(process.cwd(), 'dist/index.js');
  let fetchMock: FetchMockResult | undefined;

  beforeAll(async () => {
    fetchMock = await setupSimpleFetchMock(JSON.stringify({ docs: {} }));
  });

  afterAll(async () => {
    if (fetchMock) {
      await fetchMock.cleanup();
    }
  });

  it('should allow the host application to continue execution after server.stop()', async () => {
    // Simulate an external app with an embedded MCP and attempt a post-stop operation
    const hostAppScript = `
      import { start } from '${distIndexPath}';
      async function runHostApp() {
        const server = await start(
          {
            mode: 'test',
            modeOptions: { test: { baseUrl: '${fetchMock?.fixture.baseUrl}' } },
            isHttp: true,
            http: { port: 8091 }
          },
        );
        console.log('HOST_APP:SERVER_RUNNING');
        await server.stop();
        console.log('HOST_APP:POST_STOP_COMPLETED');
      }
      runHostApp().catch((err) => {
        console.error('HOST_APP:ERROR', err);
        process.exit(1);
      });
    `;
    const child = spawn('node', ['--input-type=module', '-e', hostAppScript]);
    const stdout: any = [];
    const stderr: any = [];

    child.stdout.on('data', data => {
      stdout.push(data.toString());
    });
    child.stderr.on('data', data => {
      stderr.push(data.toString());
    });
    const exitCode = await new Promise<number | null>(res => {
      child.on('close', res);
    });

    expect(exitCode).toBe(0);
    expect(stdout.join('').includes('HOST_APP:SERVER_RUNNING')).toBe(true);
    expect(stdout.join('').includes('HOST_APP:POST_STOP_COMPLETED')).toBe(true);
  });

  it('should allow the host application to continue execution after server.stop() when allowProcessExit is false', async () => {
    // Simulates an external application explicitly configuring allowProcessExit: false
    const hostAppScript = `
      import { start } from '${distIndexPath}';
      async function runHostApp() {
        const server = await start(
          {
            mode: 'test',
            modeOptions: { test: { baseUrl: '${fetchMock?.fixture.baseUrl}' } },
            isHttp: true,
            http: { port: 8092 }
          },
          { allowProcessExit: false }
        );
        console.log('HOST_APP:SERVER_RUNNING');
        await server.stop();
        console.log('HOST_APP:POST_STOP_COMPLETED');
      }
      runHostApp().catch((err) => {
        console.error('HOST_APP:ERROR', err);
        process.exit(1);
      });
    `;

    const child = spawn('node', ['--input-type=module', '-e', hostAppScript]);
    const stdout: any = [];
    const stderr: any = [];

    child.stdout.on('data', data => {
      stdout.push(data.toString());
    });
    child.stderr.on('data', data => {
      stderr.push(data.toString());
    });
    const exitCode = await new Promise<number | null>(res => {
      child.on('close', res);
    });

    expect(exitCode).toBe(0);
    expect(stdout.join('').includes('HOST_APP:SERVER_RUNNING')).toBe(true);
    expect(stdout.join('').includes('HOST_APP:POST_STOP_COMPLETED')).toBe(true);
  });
});

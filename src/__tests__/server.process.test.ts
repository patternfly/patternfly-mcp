import { spawn } from 'node:child_process';
import {
  buildIsolationArgs,
  shutdownChildProcess,
  resolveEntry,
  spawnChildProcess,
  activeChildrenBySession
} from '../server.process';
import { log } from '../logger';

jest.mock('node:child_process', () => ({
  spawn: jest.fn()
}));

jest.mock('node:fs', () => ({
  realpathSync: (path: string) => path
}));

jest.mock('../logger', () => ({
  log: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn()
  },
  formatUnknownError: jest.fn((error: unknown) => String(error))
}));

describe('resolveEntry', () => {
  const MockLog = jest.mocked(log);

  it('should return a pre-resolved entry as-is', () => {
    const out = resolveEntry({ importSpecifier: '#host', entry: '/lorem/ipsum.js' });

    expect(out).toBe('/lorem/ipsum.js');
  });

  it('should throw when the specifier cannot be resolved', () => {
    resolveEntry({ label: 'Test Host' } as any);

    expect(MockLog.debug).toHaveBeenCalledWith(expect.stringContaining('Failed to import.meta.resolve Test Host'));
  });

  it('should fall back to the mock path under NODE_ENV=local', () => {
    const previous = process.env.NODE_ENV;

    process.env.NODE_ENV = 'local';

    try {
      expect(resolveEntry({ importSpecifier: '#nope', label: 'Local Host' })).toBe('/mock/path/to/host.js');
    } finally {
      process.env.NODE_ENV = previous;
    }
  });
});

describe('buildIsolationArgs', () => {
  it.each([
    { description: 'non-strict yields no args', isolation: { mode: 'none' as const }, expectFlag: undefined },
    { description: 'node 22 uses experimental flag', isolation: { mode: 'strict' as const, nodeVersion: 22 }, expectFlag: '--experimental-permission' },
    { description: 'node 24 uses permission flag', isolation: { mode: 'strict' as const, nodeVersion: 24 }, expectFlag: '--permission' }
  ])('$description', ({ isolation, expectFlag }) => {
    const args = buildIsolationArgs('/abs/dir/host.js', isolation);

    if (expectFlag === undefined) {
      expect(args).toEqual([]);
    } else {
      expect(args[0]).toBe(expectFlag);
      expect(args).toContain('--allow-fs-read=/abs/dir');
    }
  });

  it('should include the injected fsReadAllowlist', () => {
    const args = buildIsolationArgs('/abs/dir/host.js', {
      mode: 'strict', nodeVersion: 24, fsReadAllowlist: ['/project']
    });

    expect(args).toContain('--allow-fs-read=/project');
  });
});

describe('shutdownChildProcess', () => {
  const makeChild = () => {
    const listeners: Record<string, Array<(...a: any[]) => void>> = {};

    return {
      killed: false,
      kill: jest.fn(),
      send: jest.fn().mockReturnValue(true),
      once: jest.fn((event: string, handle: any) => (listeners[event] ??= []).push(handle)),
      off: jest.fn(),
      _emit: (event: string) => (listeners[event] || []).forEach(handle => handle())
    } as any;
  };

  it('should resolve immediately when no handle is provided', async () => {
    await expect(shutdownChildProcess(undefined)).resolves.toBeUndefined();
  });

  it('should send shutdown, resolve on exit, and close stderr', async () => {
    const child = makeChild();
    const closeStderr = jest.fn();
    const handle = { child, closeStderr, request: jest.fn() } as any;
    const promise = shutdownChildProcess(handle, { gracePeriodMs: 0 });

    child._emit('exit');

    await promise;

    expect(child.send).toHaveBeenCalledWith(expect.objectContaining({ t: 'shutdown' }));
    expect(closeStderr).toHaveBeenCalledTimes(1);
  });

  it('should force-kill via the primary fallback timer', async () => {
    jest.useFakeTimers();
    const child = makeChild();
    const handle = { child, closeStderr: jest.fn(), request: jest.fn() } as any;
    const promise = shutdownChildProcess(handle, { gracePeriodMs: 0 });

    jest.advanceTimersByTime(1);
    await promise;

    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    jest.useRealTimers();
  });

  it('should remove the handle from the session registry on exit', async () => {
    const child = makeChild();
    const handle = { child, closeStderr: jest.fn(), request: jest.fn() } as any;

    activeChildrenBySession.set('session-1', handle);

    const promise = shutdownChildProcess(handle, { gracePeriodMs: 0, sessionId: 'session-1' });

    child._emit('exit');
    await promise;

    expect(activeChildrenBySession.has('session-1')).toBe(false);
  });
});

describe('spawnChildProcess stdio', () => {
  it('should spawn with the IPC-capable stdio shape', async () => {
    (spawn as jest.Mock).mockReturnValue({ stderr: { on: jest.fn(), off: jest.fn() } });
    const { spawnChildProcess } = await import('../server.process');

    spawnChildProcess({ importSpecifier: '#host', entry: '/abs/host.js' });

    expect(spawn).toHaveBeenCalledWith(
      process.execPath,
      ['/abs/host.js'],
      { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] }
    );
  });
});

describe('spawnChildProcess request', () => {
  const makeIpcChild = () => {
    const messageHandlers: Array<(m: any) => void> = [];
    const child: any = {
      send: jest.fn(),
      on: jest.fn((event: string, handler: any) => {
        if (event === 'message') {
          messageHandlers.push(handler);
        }

        return child;
      }),
      off: jest.fn(() => child),
      stderr: { on: jest.fn(), off: jest.fn() }
    };

    return { child, messageHandlers };
  };

  it('should correlate the response by the generated id', async () => {
    const { child, messageHandlers } = makeIpcChild();

    (spawn as jest.Mock).mockReturnValue(child);

    const { request } = spawnChildProcess({ importSpecifier: '#host', entry: '/abs/host.js' });
    const pending = request({ t: 'hello' }, 'hello:ack', 1000);
    const sentId = child.send.mock.calls[0][0].id;

    await Promise.resolve();
    messageHandlers.forEach(handler => handler({ t: 'hello:ack', id: sentId }));

    await expect(pending).resolves.toEqual({ t: 'hello:ack', id: sentId });
    expect(typeof sentId).toBe('string');
  });

  it('should match any id when correlate is false', async () => {
    const { child, messageHandlers } = makeIpcChild();

    (spawn as jest.Mock).mockReturnValue(child);

    const { request } = spawnChildProcess({ importSpecifier: '#host', entry: '/abs/host.js' });
    const pending = request({ t: 'ping' }, 'pong', 1000, false);

    await Promise.resolve();
    messageHandlers.forEach(handler => handler({ t: 'pong', id: 'unrelated' }));

    await expect(pending).resolves.toEqual({ t: 'pong', id: 'unrelated' });
  });

  it('should reject on a correlated <type>:error envelope', async () => {
    const { child, messageHandlers } = makeIpcChild();

    (spawn as jest.Mock).mockReturnValue(child);

    const { request } = spawnChildProcess({ importSpecifier: '#host', entry: '/abs/host.js' });
    const pending = request({ t: 'load' }, 'load:ack', 1000);
    const sentId = child.send.mock.calls[0][0].id;

    await Promise.resolve();
    messageHandlers.forEach(handler => handler({
      t: 'load:error',
      id: sentId,
      ok: false,
      error: { message: 'handler boom', code: 'E_BOOM' }
    }));

    await expect(pending).rejects.toThrow('handler boom');
  });
});

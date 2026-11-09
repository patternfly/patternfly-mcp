import childProcess from 'node:child_process';
import fs from 'node:fs';
import {
  clearTerminal,
  copyTextOsc52,
  copyTextToClipboard,
  enterAlternateScreen,
  isClipboardAvailable,
  leaveAlternateScreen,
  prepareReaderDisplay
} from '../client.helpers';

describe('prepareReaderDisplay', () => {
  it('uses the first markdown heading for the title and strips provenance', () => {
    const raw = [
      '<!-- mcp:provenance id="af066c0c" groupId="40b815b1" -->',
      '',
      '# Documentation for Component Groups Close Button - Examples (v6)',
      '',
      'Body paragraph.'
    ].join('\n');

    const { titleLine, body } = prepareReaderDisplay({ fullText: raw, uri: 'patternfly://docs/x' });

    expect(titleLine).toBe('Documentation for Component Groups Close Button - Examples (v6)');
    expect(body).not.toContain('mcp:provenance');
    expect(body).not.toContain('# Documentation for Component Groups');
    expect(body).toContain('Body paragraph.');
  });

  it('falls back to the first non-empty line when no markdown heading exists', () => {
    const raw = ['Line one without heading', 'Line two'].join('\n');
    const { titleLine, body } = prepareReaderDisplay({ fullText: raw, uri: 'patternfly://records/raw' });

    expect(titleLine).toBe('Line one without heading');
    expect(body).toBe(raw);
  });

  it('falls back to uri when document is completely empty', () => {
    const raw = '';
    const { titleLine, body } = prepareReaderDisplay({ fullText: raw, uri: 'patternfly://records/empty' });

    expect(titleLine).toBe('patternfly://records/empty');
    expect(body).toBe('');
  });
});

describe('isClipboardAvailable', () => {
  const env = process.env;

  afterEach(() => {
    process.env = { ...env };
  });

  it('returns false when PF_CLIENT_CLIPBOARD=0', () => {
    process.env.PF_CLIENT_CLIPBOARD = '0';
    delete process.env.CI;

    expect(isClipboardAvailable()).toBe(false);
  });

  it('returns true when PF_CLIENT_CLIPBOARD=1 even in CI', () => {
    process.env.PF_CLIENT_CLIPBOARD = '1';
    process.env.CI = 'true';

    expect(isClipboardAvailable()).toBe(true);
  });

  it('returns false in CI without override', () => {
    delete process.env.PF_CLIENT_CLIPBOARD;
    process.env.CI = 'true';

    expect(isClipboardAvailable()).toBe(false);
  });

  it('returns false on headless Linux', () => {
    delete process.env.PF_CLIENT_CLIPBOARD;
    delete process.env.CI;
    delete process.env.DISPLAY;
    delete process.env.WAYLAND_DISPLAY;

    const platform = Object.getOwnPropertyDescriptor(process, 'platform');

    Object.defineProperty(process, 'platform', { value: 'linux' });

    expect(isClipboardAvailable()).toBe(false);

    if (platform) {
      Object.defineProperty(process, 'platform', platform);
    }
  });

  it('returns true on macOS when not in CI or container', () => {
    delete process.env.PF_CLIENT_CLIPBOARD;
    delete process.env.CI;

    const platform = Object.getOwnPropertyDescriptor(process, 'platform');

    Object.defineProperty(process, 'platform', { value: 'darwin' });

    expect(isClipboardAvailable()).toBe(true);

    if (platform) {
      Object.defineProperty(process, 'platform', platform);
    }
  });

  it('returns false when running inside container', () => {
    delete process.env.PF_CLIENT_CLIPBOARD;
    delete process.env.CI;

    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    expect(isClipboardAvailable()).toBe(false);
    jest.restoreAllMocks();
  });
});

describe('terminal buffer and clear sequences', () => {
  let outputData = '';
  const originalWrite = process.stdout.write;

  beforeEach(() => {
    outputData = '';
    process.stdout.write = ((chunk: string) => {
      outputData += chunk;

      return true;
    }) as typeof process.stdout.write;
  });

  afterEach(() => {
    process.stdout.write = originalWrite;
  });

  it('clearTerminal writes cursor home and clear down escape codes', () => {
    clearTerminal();
    expect(outputData).toBe('\x1b[H\x1b[J');
  });

  it('enterAlternateScreen writes alternate buffer code', () => {
    enterAlternateScreen();
    expect(outputData).toBe('\x1b[?1049h');
  });

  it('leaveAlternateScreen writes exit alternate buffer code', () => {
    leaveAlternateScreen();
    expect(outputData).toBe('\x1b[?1049l');
  });

  it('copyTextOsc52 writes base64-encoded OSC-52 sequence', () => {
    copyTextOsc52('hello');
    expect(outputData).toBe('\x1b]52;c;aGVsbG8=\x07');
  });
});

describe('copyTextToClipboard', () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  const originalEnv = { ...process.env };
  let stdoutOutput = '';
  const originalWrite = process.stdout.write;

  beforeEach(() => {
    stdoutOutput = '';
    process.stdout.write = ((chunk: string) => {
      stdoutOutput += chunk;

      return true;
    }) as typeof process.stdout.write;
  });

  afterEach(() => {
    process.stdout.write = originalWrite;
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform);
    }
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  it('copies via pbcopy on macOS', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    const spawnSyncSpy = jest.spyOn(childProcess, 'spawnSync').mockReturnValue({
      status: 0,
      error: undefined
    } as any);

    const result = copyTextToClipboard('test snippet');

    expect(spawnSyncSpy).toHaveBeenCalledWith('pbcopy', { input: 'test snippet', encoding: 'utf-8' });
    expect(result).toEqual({ ok: true, message: 'Copied full document to clipboard' });
  });

  it('copies via wl-copy on Linux under Wayland', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    process.env.WAYLAND_DISPLAY = 'wayland-0';

    const spawnSyncSpy = jest.spyOn(childProcess, 'spawnSync').mockReturnValue({
      status: 0,
      error: undefined
    } as any);

    const result = copyTextToClipboard('test snippet');

    expect(spawnSyncSpy).toHaveBeenCalledWith('wl-copy', { input: 'test snippet', encoding: 'utf-8' });
    expect(result).toEqual({ ok: true, message: 'Copied full document to clipboard' });
  });

  it('copies via xclip on Linux under X11', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    delete process.env.WAYLAND_DISPLAY;

    const spawnSyncSpy = jest.spyOn(childProcess, 'spawnSync').mockReturnValue({
      status: 0,
      error: undefined
    } as any);

    const result = copyTextToClipboard('test snippet');

    expect(spawnSyncSpy).toHaveBeenCalledWith('xclip', ['-selection', 'clipboard'], { input: 'test snippet', encoding: 'utf-8' });
    expect(result).toEqual({ ok: true, message: 'Copied full document to clipboard' });
  });

  it('falls back to OSC-52 when system commands are unavailable or fail', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    jest.spyOn(childProcess, 'spawnSync').mockReturnValue({
      status: 1,
      error: new Error('command failed')
    } as any);

    const result = copyTextToClipboard('hello');

    expect(stdoutOutput).toContain('\x1b]52;c;aGVsbG8=\x07');
    expect(result.ok).toBe(true);
    expect(result.message).toContain('Sent to terminal clipboard (OSC-52)');
  });

  it('returns failure result when both native copy and OSC-52 throw', () => {
    Object.defineProperty(process, 'platform', { value: 'other' });
    process.stdout.write = (() => {
      throw new Error('write error');
    }) as any;

    const result = copyTextToClipboard('hello');

    expect(result).toEqual({ ok: false, message: 'Copy failed. Use [r] to save a .md file in this directory.' });
  });
});

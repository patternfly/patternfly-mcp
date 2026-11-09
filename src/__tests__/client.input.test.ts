import * as readlinePromises from 'node:readline/promises';
import { stdin as input } from 'node:process';
import { createKeyReader, promptLine, resolveKeyToken } from '../client.input';

jest.mock('node:readline/promises', () => ({
  createInterface: jest.fn()
}));

describe('resolveKeyToken', () => {
  it.each([
    {
      description: 'single letter, copy',
      input: '',
      metadata: { name: 'c' }
    },
    {
      description: 'single letter, quit',
      input: '',
      metadata: { name: 'q' }
    },
    {
      description: 'no space input, space',
      input: '',
      metadata: { name: 'space' }
    },
    {
      description: 'empty space input, space',
      input: ' ',
      metadata: { name: 'space' }
    },
    {
      description: 'right',
      input: '',
      metadata: { name: 'right' }
    },
    {
      description: 'left',
      input: '',
      metadata: { name: 'left' }
    },
    {
      description: 'tab',
      input: '',
      metadata: { name: 'tab' }
    },
    {
      description: 'up',
      input: '',
      metadata: { name: 'up' }
    },
    {
      description: 'down',
      input: '',
      metadata: { name: 'down' }
    }
  ])('should return key tokens, $description', ({ input: str, metadata }) => {
    expect(resolveKeyToken({ str, key: metadata })).toBe(metadata?.name);
  });

  it('handles ctrl-c token', () => {
    expect(resolveKeyToken({ str: '\x03', key: { ctrl: true, name: 'c' } as any })).toBe('ctrl-c');
  });

  it('handles return as enter', () => {
    expect(resolveKeyToken({ str: '\r', key: { name: 'return' } as any })).toBe('enter');
  });

  it('handles escape as esc', () => {
    expect(resolveKeyToken({ str: '\x1b', key: { name: 'escape' } as any })).toBe('esc');
  });

  it('handles alphanumeric key names as fallback', () => {
    expect(resolveKeyToken({ str: '', key: { name: 'x' } as any })).toBe('x');
    expect(resolveKeyToken({ str: '', key: { name: '1' } as any })).toBe('1');
  });

  it('returns "other" when key cannot be resolved', () => {
    expect(resolveKeyToken({ str: 'multi-char', key: { name: 'unknown-symbol' } as any })).toBe('other');
  });
});

describe('createKeyReader', () => {
  let originalIsTTY: boolean | undefined;
  let originalSetRawMode: typeof input.setRawMode;
  let originalResume: typeof input.resume;
  let originalPause: typeof input.pause;

  beforeEach(() => {
    originalIsTTY = input.isTTY;
    originalSetRawMode = input.setRawMode;
    originalResume = input.resume;
    originalPause = input.pause;
  });

  afterEach(() => {
    Object.defineProperty(input, 'isTTY', { value: originalIsTTY, configurable: true });
    input.setRawMode = originalSetRawMode;
    input.resume = originalResume;
    input.pause = originalPause;
  });

  it('handles lifecycle: enable, readKey, disable, and dispose', async () => {
    const rawModeCalls: boolean[] = [];
    let resumed = false;
    let paused = false;

    Object.defineProperty(input, 'isTTY', { value: true, configurable: true });
    input.setRawMode = ((mode: boolean) => {
      rawModeCalls.push(mode);

      return input;
    }) as typeof input.setRawMode;
    input.resume = (() => {
      resumed = true;

      return input;
    }) as typeof input.resume;
    input.pause = (() => {
      paused = true;

      return input;
    }) as typeof input.pause;

    const reader = createKeyReader();

    reader.enable();
    expect(rawModeCalls).toEqual([true]);
    expect(resumed).toBe(true);

    const pendingKey = reader.readKey();

    input.emit('keypress', 'q', { name: 'q' });
    const resolvedKey = await pendingKey;

    expect(resolvedKey).toBe('q');

    reader.disable();
    expect(rawModeCalls).toEqual([true, false]);

    reader.dispose();
    expect(paused).toBe(true);
  });

  it('ignores enable when input is not a TTY', () => {
    const setRawModeMock = jest.fn();

    Object.defineProperty(input, 'isTTY', { value: false, configurable: true });
    input.setRawMode = setRawModeMock as typeof input.setRawMode;

    const reader = createKeyReader();

    reader.enable();

    expect(setRawModeMock).not.toHaveBeenCalled();
    reader.dispose();
  });

  it('ignores keypress events when not listening or without pending reader', () => {
    const reader = createKeyReader();

    expect(() => {
      // Not enabled (listening is false)
      input.emit('keypress', 'q', { name: 'q' });

      // Enabled but no pending readKey()
      reader.enable();
      input.emit('keypress', 'q', { name: 'q' });

      reader.dispose();
    }).not.toThrow();
  });
});

describe('promptLine', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns answered text when entered by user', async () => {
    const mockQuestion = jest.fn().mockResolvedValue('user query');
    const mockClose = jest.fn();

    jest.spyOn(readlinePromises, 'createInterface').mockReturnValue({
      question: mockQuestion,
      close: mockClose
    } as any);

    const result = await promptLine({ label: 'Search', current: 'initial' });

    expect(result).toBe('user query');
    expect(mockClose).toHaveBeenCalled();
  });

  it('falls back to default text when user inputs empty string', async () => {
    jest.spyOn(readlinePromises, 'createInterface').mockReturnValue({
      question: jest.fn().mockResolvedValue('   '),
      close: jest.fn()
    } as any);

    const result = await promptLine({ label: 'Search', current: 'default-query' });

    expect(result).toBe('default-query');
  });

  it('handles Ctrl+C AbortError cleanly by returning empty string', async () => {
    const abortError = new Error('Aborted with Ctrl+C');

    abortError.name = 'AbortError';
    (abortError as any).code = 'ABORT_ERR';

    jest.spyOn(readlinePromises, 'createInterface').mockReturnValue({
      question: jest.fn().mockRejectedValue(abortError),
      close: jest.fn()
    } as any);

    const result = await promptLine({ label: 'Search', current: 'existing' });

    expect(result).toBe('');
  });
});

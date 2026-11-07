import readline from 'node:readline';
import { createInterface as createPromiseInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

/**
 * Key reader utility interface for capturing TTY keypress events.
 */
interface KeyReader {
  enable: () => void;
  disable: () => void;
  dispose: () => void;
  readKey: () => Promise<string>;
}

/**
 * Return a token for a keypress.
 *
 * @param params - Parameters
 * @param params.str - String input for a key pressed.
 * @param params.key - Metadata object for the key press event, containing
 *     details like the name of the key and modifier flags.
 * @returns A string token representing the key press. Common tokens include:
 * - `'ctrl-c'`: When the `Ctrl` key and `c` are pressed.
 * - Specific key names such as `'up'`, `'down'`, `'space'`, `'enter'`, `'esc'`.
 * - Single character strings for alphanumeric keys (e.g., `'a'`, `'1'`).
 * - `'other'`: When the key does not match any of the predefined rules.
 */
const resolveKeyToken = ({ str, key }: { str: string; key: readline.Key }): string => {
  if (key.ctrl && key.name === 'c') {
    return 'ctrl-c';
  }

  switch (key.name) {
    case 'up':
    case 'down':
    case 'right':
    case 'left':
    case 'tab':
    case 'pageup':
    case 'pagedown':
    case 'backspace':
      return key.name;
  }

  if (key.name === 'space' || str === ' ') {
    return 'space';
  }

  if (key.name === 'return') {
    return 'enter';
  }

  if (key.name === 'escape') {
    return 'esc';
  }

  if (str.length === 1) {
    return str;
  }

  if (key.name && /^[a-z0-9]$/i.test(key.name)) {
    return key.name;
  }

  return 'other';
};

/**
 * Create a TTY key reader utility for keypress events.
 *
 * @returns {Object} An object with the following methods:
 * - `enable`: Activates the key reader, enabling keypress events to be captured.
 * - `disable`: Deactivates raw mode and pauses capturing keypress events.
 * - `dispose`: Cleans up and removes the event listener for keypress handling.
 * - `readKey`: Waits for the next keypress event and resolves with the captured key string.
 */
const createKeyReader = (): KeyReader => {
  readline.emitKeypressEvents(input);

  let listening = false;
  let pending: ((key: string) => void) | null = null;

  /**
   * A function triggered on keypress events.
   *
   * @param str - String input from the keypress event.
   * @param key - Key metadata associated with the keypress event.
   */
  const onKeypress = (str: string, key: readline.Key) => {
    if (!listening || !pending) {
      return;
    }

    const resolve = pending;

    pending = null;
    resolve(resolveKeyToken({ str, key }));
  };

  input.on('keypress', onKeypress);

  /**
   * Enable the key reader.
   *
   * Sets stdin to raw mode, resumes stream flow, and enables event dispatch.
   */
  const enable = (): void => {
    if (!input.isTTY) {
      return;
    }

    input.setRawMode?.(true);
    input.resume();
    listening = true;
  };

  /**
   * Disable the key reader.
   *
   * Resets listening state and restores terminal raw mode to false.
   */
  const disable = (): void => {
    listening = false;
    pending = null;
    input.setRawMode?.(false);
  };

  /**
   * Dispose of the key reader.
   *
   * Cleans up listeners and pauses stdin.
   */
  const dispose = (): void => {
    disable();
    input.off('keypress', onKeypress);
    input.pause();
  };

  /**
   * Prompt for a keypress.
   *
   * @returns Promise resolving to the next recognized key token string.
   */
  const readKey = (): Promise<string> =>
    new Promise(resolve => {
      pending = resolve;
    });

  return { readKey, enable, disable, dispose };
};

/**
 * Prompt for a search query on the primary screen (line-based input).
 *
 * @param params - Parameters
 * @param params.label - Prompt label shown to the user.
 * @param params.current - Optional default query text.
 * @returns User-submitted query string or current default if submitted empty.
 */
const promptLine = async ({ label, current = '' }: { label: string; current?: string | undefined }): Promise<string> => {
  const rl = createPromiseInterface({ input, output, terminal: true });
  const suffix = current ? ` [${current}]` : '';

  try {
    const answer = await rl.question(`${label}${suffix}: `);

    return answer.trim() || current;
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      (error.name === 'AbortError' || ('code' in error && error.code === 'ABORT_ERR'))
    ) {
      return '';
    }
    throw error;
  } finally {
    rl.close();
  }
};

export { createKeyReader, promptLine, resolveKeyToken, type KeyReader };

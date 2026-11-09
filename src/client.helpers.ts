import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

interface ClipboardCopyResult {
  ok: boolean;
  message: string;
}

/**
 * Best-effort detection of OCI/container runtimes (Docker, Podman, etc.).
 *
 * @returns True if running inside a container environment.
 */
const isRunningInContainer = (): boolean => {
  if (existsSync('/.dockerenv')) {
    return true;
  }

  try {
    const cgroup = readFileSync('/proc/1/cgroup', 'utf8');

    return /docker|podman|containerd|kubepods|libpod/i.test(cgroup);
  } catch {
    return false;
  }
};

/**
 * Whether the interactive reader should offer clipboard copy (`c`).
 *
 * Uses lightweight OS/environment checks at startup (no clipboard probe write).
 * Override with `PF_CLIENT_CLIPBOARD=0` or `PF_CLIENT_CLIPBOARD=1`.
 *
 * @returns True if system clipboard can be used.
 */
const isClipboardAvailable = (): boolean => {
  const override = process.env.PF_CLIENT_CLIPBOARD?.trim().toLowerCase();

  if (override === '0' || override === 'false' || override === 'no') {
    return false;
  }

  if (override === '1' || override === 'true' || override === 'yes') {
    return true;
  }

  if (process.env.CI) {
    return false;
  }

  if (isRunningInContainer()) {
    return false;
  }

  if (process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    return false;
  }

  if (process.platform === 'darwin' || process.platform === 'win32') {
    return true;
  }

  if (process.platform === 'linux') {
    return true;
  }

  return false;
};

/**
 * Clear the terminal viewport without resetting terminal emulator state.
 */
const clearTerminal = (): void => {
  process.stdout.write('\x1b[H\x1b[J');
};

/**
 * Switch to the terminal alternate screen buffer (restores on leave).
 */
const enterAlternateScreen = (): void => {
  process.stdout.write('\x1b[?1049h');
};

/**
 * Restore the primary screen buffer after alternate-screen use.
 */
const leaveAlternateScreen = (): void => {
  process.stdout.write('\x1b[?1049l');
};

/**
 * Copy via OSC-52 (terminal clipboard integration).
 *
 * @param text - UTF-8 string to place on the clipboard.
 */
const copyTextOsc52 = (text: string): void => {
  const encoded = Buffer.from(text, 'utf8').toString('base64');

  process.stdout.write(`\x1b]52;c;${encoded}\x07`);
};

/**
 * Copy plain text to the system clipboard (pbcopy / wl-copy / xclip, then OSC-52).
 *
 * @param text - UTF-8 content to copy.
 * @returns Result object with status flag and user feedback message.
 */
const copyTextToClipboard = (text: string): ClipboardCopyResult => {
  if (process.platform === 'darwin') {
    const result = spawnSync('pbcopy', { input: text, encoding: 'utf-8' });

    if (result.status === 0 && !result.error) {
      return { ok: true, message: 'Copied full document to clipboard' };
    }
  }

  if (process.platform === 'linux') {
    if (process.env.WAYLAND_DISPLAY) {
      const result = spawnSync('wl-copy', { input: text, encoding: 'utf-8' });

      if (result.status === 0 && !result.error) {
        return { ok: true, message: 'Copied full document to clipboard' };
      }
    }

    const xclip = spawnSync('xclip', ['-selection', 'clipboard'], { input: text, encoding: 'utf-8' });

    if (xclip.status === 0 && !xclip.error) {
      return { ok: true, message: 'Copied full document to clipboard' };
    }
  }

  try {
    copyTextOsc52(text);

    return {
      ok: true,
      message: 'Sent to terminal clipboard (OSC-52). If nothing pasted, enable OSC-52 or use [r] to save a file.'
    };
  } catch {
    return {
      ok: false,
      message: 'Copy failed. Use [r] to save a .md file in this directory.'
    };
  }
};

/**
 * Split MCP resource markdown into a title bar label and scrollable body.
 *
 * Strips `mcp:provenance` HTML comments and avoids repeating the first `#` heading in the body.
 *
 * @param params - Parameters for preparing reader display.
 * @param params.fullText - Raw Markdown from `readResource`.
 * @param params.uri - Resource URI fallback title.
 * @param [settings] - Optional configuration.
 * @param [settings.headerFilterRegEx] - Regular expression to filter out headers.
 * @returns Object containing title line and body.
 */
const prepareReaderDisplay = (
  { fullText, uri }: { fullText: string; uri: string },
  { headerFilterRegEx = /^\s*<!--\s*mcp:provenance[\s\S]*?-->\s*$/i } = {}
): { titleLine: string; body: string } => {
  const lines = fullText.split('\n');
  const filteredHeader = lines.filter(line => !headerFilterRegEx.test(line));
  const headingIndex = filteredHeader.findIndex(line => /^#\s+/.test(line.trim()));

  if (headingIndex >= 0) {
    const heading = filteredHeader[headingIndex] ?? '';
    const titleLine = heading.replace(/^#\s+/, '').trim();
    const bodyLines = [
      ...filteredHeader.slice(0, headingIndex),
      ...filteredHeader.slice(headingIndex + 1)
    ];

    return {
      titleLine,
      body: bodyLines.join('\n').replace(/^\n+/, '').trimEnd()
    };
  }

  const firstLine = filteredHeader.find(line => line.trim().length)?.trim();

  return {
    titleLine: firstLine ?? uri,
    body: filteredHeader.join('\n').replace(/^\n+/, '').trimEnd()
  };
};

export {
  clearTerminal,
  copyTextOsc52,
  copyTextToClipboard,
  enterAlternateScreen,
  isClipboardAvailable,
  leaveAlternateScreen,
  prepareReaderDisplay,
  type ClipboardCopyResult
};

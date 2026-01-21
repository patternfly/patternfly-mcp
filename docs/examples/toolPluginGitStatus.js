/**
 * Example of authoring a custom tool outside PatternFly that executes Git status commands.
 *
 * To load this tool into the PatternFly MCP server:
 * 1. Save this file (e.g., `toolPluginGitStatus.js`)
 * 2. Run the server with: `npx @patternfly/patternfly-mcp --tool <path-to-the-file>/toolPluginGitStatus.js --plugin-isolation "none"`
 *
 * Note:
 * - External tool file loading requires Node.js >= 22.
 * - JS support only. TypeScript is only supported for embedding the server.
 * - Requires ESM default export.
 */
import { spawn } from 'node:child_process';
import { createMcpTool } from '@patternfly/patternfly-mcp';

/**
 * Helper, execute a command using spawn with argument handling.
 *
 * @param command - Command to execute
 * @param args - Command arguments
 * @param options - Spawn options
 */
const spawnAsync = (command, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';

  child.stdout?.on('data', data => {
    stdout += data.toString();
  });

  child.stderr?.on('data', data => {
    stderr += data.toString();
  });

  child.on('close', code => {
    const result = { stdout, stderr, code };

    if (code === 0) {
      resolve(result);
    } else {
      reject(Object.assign(new Error(stderr || stdout || `Exit code ${code}`), result));
    }
  });

  child.on('error', reject);
});

export default createMcpTool({
  name: 'getGitStatus',
  description: 'Get Git repository status. Returns information about working directory, staged files, and recent commits.',
  inputSchema: {
    type: 'object',
    properties: {
      cwd: {
        type: 'string',
        description: 'Optional: Current working directory. Defaults to process.cwd().'
      },
      short: {
        type: 'boolean',
        description: 'Optional: Use short format output (git status --short). Defaults to false.',
        default: false
      }
    }
  },
  async handler({ cwd, short = false }) {
    try {
      const args = short ? ['status', '--short'] : ['status'];
      const { stdout, stderr } = await spawnAsync('git', args, {
        cwd: cwd || process.cwd()
      });

      return {
        content: [
          {
            type: 'text',
            text: stdout || stderr || 'No changes.'
          }
        ]
      };
    } catch (error) {
      const output = error.stdout || error.stderr || error.message;

      return {
        content: [
          {
            type: 'text',
            text: output
          }
        ],
        isError: true
      };
    }
  }
});

import { type GlobalOptions } from './options';

/**
 * Options for tools.
 *
 * @property serverName - Name of the server instance.
 * @property serverVersion - Version of the server instance.
 * @property nodeMajor - Major version of the Node.js runtime.
 * @property repoName - Name of the repository containing the server instance.
 */
type ToolOptions = {
  serverName: string;
  serverVersion: string;
  nodeMajor: number;
  repoName: string;
};

/**
 * Return a refined set of options from global options for tools.
 *
 * @param {GlobalOptions} options - Minimal set of options required for tools.
 * @returns {ToolOptions}
 */
const setToolOptions = (options: GlobalOptions): ToolOptions => ({
  serverName: options.name,
  serverVersion: options.version,
  nodeMajor: options.nodeVersion,
  repoName: options.repoName as string
});

export { setToolOptions, type ToolOptions };

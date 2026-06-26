import { execSync } from 'node:child_process';
import { startServer, type StdioTransportClient } from '../../e2e/utils/stdioTransportClient';

interface StartOptions {
  engine?: 'podman' | 'docker';
  args?: string[];
  image?: string;
}

/**
 * Resolves which container engine to use.
 *
 * Probes `podman` first, then `docker` on the system's PATH.
 *
 * @returns The resolved container engine name or `undefined` if none is found.
 */
const resolveContainerEngine = (): string | undefined => {
  for (const engine of ['podman', 'docker']) {
    try {
      execSync(`command -v ${engine}`, { stdio: 'ignore' });

      return engine;
    } catch {}
  }

  return undefined;
};

/**
 * Build the container image if it doesn't exist.
 *
 * @param engine - Container engine to use (e.g., 'podman', 'docker').
 * @param image - Image name to build.
 */
const buildImage = async (engine: 'podman' | 'docker', image: string) => {
  try {
    execSync(`${engine} image inspect ${image}`, { stdio: 'ignore' });
  } catch {
    console.warn(`Image ${image} not found. Building...`);
    execSync('npm run container:build', { stdio: 'inherit' });
  }
};

/**
 * Start the container and return a client for interacting with it.
 *
 * @param options - Server configuration options
 * @param options.engine - Container engine to use (e.g., 'podman', 'docker').
 * @param options.args - Additional args to pass to the container.
 * @param options.image - Image to use for the container. Defaults to 'localhost/patternfly-mcp:latest'.
 * @returns Client for interacting with a container.
 */
const startContainer = async ({
  engine,
  args = [],
  image = 'localhost/patternfly-mcp:latest'
}: StartOptions = {}): Promise<StdioTransportClient> => {
  if (!engine) {
    throw new Error('Container engine not found');
  }

  const updatedArgs = [
    'run',
    '--rm',
    '-i',
    '--userns=keep-id',
    '--security-opt=no-new-privileges',
    '--cap-drop=ALL',
    image,
    '--mode',
    'test',
    '--log-stderr',
    ...args
  ];

  try {
    await buildImage(engine, image);
  } catch (error) {
    throw new Error(`Failed to build image: ${error}`);
  }

  return startServer({
    command: engine,
    serverPath: '',
    args: updatedArgs
  });
};

export {
  buildImage,
  resolveContainerEngine,
  startContainer,
  type StdioTransportClient
};

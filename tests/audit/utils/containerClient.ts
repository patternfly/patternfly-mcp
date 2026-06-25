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
 * 1. If the `CONTAINER_ENGINE` environment variable is set, its value is returned.
 * 2. If the `CONTAINER_ENGINE` environment variable is not set, it searches for common
 *    container engines like `podman` and `docker`. If one of these engines is available
 *    (found in the system's PATH), its name is returned.
 * 3. If no container engine is detected or available, the function returns `undefined`.
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

const buildImage = async (engine: string, image: string) => {
  try {
    execSync(`${engine} image inspect ${image}`, { stdio: 'ignore' });
  } catch {
    console.warn(`Image ${image} not found. Building...`);
    execSync('npm run container:build', { stdio: 'inherit' });
  }
};

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

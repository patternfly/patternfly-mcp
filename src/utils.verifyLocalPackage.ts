import path from 'node:path';
import { readJsonFile } from './utils.readFile';
import { resolveModule } from './utils.moduleResolver';

type VerifyLocalPackageStatus = {
  exists: boolean;
  version: string;
  packageRoot: string;
  error?: Error;
};

/**
 * Verifies if a local package exists and retrieves its version and root path.
 *
 * @param packageName string - The name of the local package to verify.
 * @returns {Promise<VerifyLocalPackageStatus>} Verification status including existence, version, and root path.
 */
export const verifyLocalPackage = async (packageName: string) : Promise<VerifyLocalPackageStatus> => {
  const errorStatus : VerifyLocalPackageStatus = {
    exists: false,
    version: '',
    packageRoot: ''
  };

  if (!packageName || typeof packageName !== 'string') {
    return { ...errorStatus, error: new Error(`Invalid package name: ${packageName}`) };
  }

  // current working dir of agent
  const projectRoot = process.cwd();

  try {
    // TODO: consider monorepo setup in the future
    const pkgPath = resolveModule(`${projectRoot}/node_modules/${packageName}/package.json`);
    const packageDir = path.dirname(pkgPath).replace(/^file:\/\//, '');
    const data = await readJsonFile<{ version: string }>(pkgPath.replace(/^file:\/\//, ''));

    return {
      exists: true,
      version: data.version || '',
      packageRoot: packageDir
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    return { ...errorStatus, error: new Error(`Error resolving package "${packageName}": ${message}`) };
  }
};

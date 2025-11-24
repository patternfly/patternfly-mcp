import { readJsonFile } from './utils.readFile';
import { verifyLocalPackage } from './utils.verifyLocalPackage';

export const getLocalModulesMap = async (packageName: string): Promise<Record<string, string>> => {
  let modulesMap: Record<string, string> = {};

  const status = await verifyLocalPackage(packageName);

  if (!status.exists) {
    throw new Error(`Package "${packageName}" not found locally. ${status.error ? status.error.message : ''}`);
  }

  // exported map of module names to their paths
  try {
    modulesMap = await readJsonFile<Record<string, string>>(`${status.packageRoot}/dist/dynamic-modules.json`);
  } catch (error) {
    throw new Error(`Failed to import modules map from package "${packageName}": ${error}. Does the modules map exist?`);
  }

  return modulesMap;
};

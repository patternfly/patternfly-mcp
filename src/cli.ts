#!/usr/bin/env node

import packageJson from '../package.json';
import { getNodeMajorVersion } from './options.helpers';

/**
 * CLI entry point with early error catching for environment and load-time issues.
 */
const run = async (): Promise<void> => {
  const appBugs = packageJson.bugs?.url;
  const appName = packageJson.name;
  const appTroubleshoot = packageJson.support?.url;
  const appMinNodeMajorVersion = getNodeMajorVersion(packageJson.engines?.node);
  const envNodeMajorVersion = getNodeMajorVersion(process.versions?.node || process.version);

  // Quick Node.js confirmation
  if (envNodeMajorVersion < appMinNodeMajorVersion) {
    const error = new Error(
      `Node.js version ${envNodeMajorVersion} found but ${appMinNodeMajorVersion} or higher is required. Update Node.js and try again.`
    );

    console.error(`${appName} failed to start. Engine requirements not met.`, error.message);
    process.exit(1);
  }

  // Exit the process on error.
  const processExit = (message: string, error: unknown): never => {
    console.error(message, error instanceof Error ? error.message : error);

    if (appTroubleshoot) {
      console.error(`\nFor help, visit the Troubleshooting Guide:\n${appTroubleshoot}`);
    }

    if (appBugs) {
      console.error(`\nTo report bugs:\n${appBugs}`);
    }
    console.error('');
    process.exit(1);
  };

  let main: typeof import('./index').main;

  try {
    const module = await import('./index');

    main = module.main;
  } catch (error) {
    processExit(`Failed to load ${appName}`, error);

    return;
  }

  try {
    await main({ mode: 'cli' });
  } catch (error) {
    processExit(`${appName} encountered a runtime error`, error);
  }
};

run();

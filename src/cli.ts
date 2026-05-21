#!/usr/bin/env node

import packageJson from '../package.json';
import { getNodeMajorVersion } from './options.helpers';

/**
 * CLI entry point with early error catching for environment and load-time issues.
 */
const run = async (): Promise<void> => {
  const appBugs = packageJson.bugs?.url;
  const appName = packageJson.name;
  const appSupport = packageJson.support?.url;
  const appMinNodeMajorVersion = getNodeMajorVersion(packageJson.engines?.node);
  const envNodeMajorVersion = getNodeMajorVersion(process.versions?.node || process.version);

  // Exit the process on error.
  const processExit = (message: string, error: unknown): never => {
    const errorMsg = error instanceof Error ? error.message : error;
    const msg = [message];

    if (errorMsg) {
      msg.push(String(errorMsg));
    }

    if (appSupport) {
      msg.push(`For help, visit the Troubleshooting Guide:\n${appSupport}`);
    }

    if (appBugs) {
      msg.push(`To report bugs:\n${appBugs}`);
    }

    const finalMsg = msg.filter(Boolean).join('\n\n').trim();

    if (finalMsg) {
      console.error(`\n${finalMsg}\n`);
    }

    process.exit(1);
  };

  // Node.js confirmations
  if (!envNodeMajorVersion || !appMinNodeMajorVersion || envNodeMajorVersion < appMinNodeMajorVersion) {
    let error;

    if (!envNodeMajorVersion) {
      // Environment not broadcasting version. Missing or falsy
      error = new Error('Unable to determine environment Node.js version. Update Node.js and try again.');
    } else if (!appMinNodeMajorVersion) {
      // Options or package.json engine been modified. Missing or falsy
      error = new Error('Unable to determine server engine Node.js version requirements. Confirm engine available.');
    } else {
      // Everything else
      error = new Error(
        `Node.js version ${envNodeMajorVersion} found but ${appMinNodeMajorVersion} or higher is required. Update Node.js or pin to an earlier PatternFly MCP version for compatibility and try again.`
      );
    }

    processExit(`${appName} failed to start. Engine requirements not met.`, error);

    // Unreachable, processExit exits. Kept for readability.
    return;
  }

  let main: typeof import('./index').main;

  try {
    const module = await import('./index');

    main = module.main;
  } catch (error) {
    processExit(`Failed to load ${appName}`, error);

    // Unreachable, processExit exits. Kept for type satisfaction.
    return;
  }

  try {
    await main({ mode: 'cli' });
  } catch (error) {
    processExit(`${appName} encountered a runtime error`, error);
  }
};

run();

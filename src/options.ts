import { type DefaultOptions } from './options.defaults';

/**
 * CLI options that users can set via command line arguments
 */
interface CliOptions {
  docsHost?: boolean;
  http?: boolean;
  port?: number;
  host?: string;
  allowedOrigins?: string[];
  allowedHosts?: string[];
  cacheLimit?: number;
}

/**
 * Combined options object
 */
interface GlobalOptions extends CliOptions, DefaultOptions {
  // Combined DefaultOptions and CliOptions
}

/**

/**
 * Get argument value from process.argv
 *
 * @param flag - CLI flag to search for
 * @param defaultValue - Default arg value
 */
const getArgValue = (flag: string, defaultValue?: unknown) => {
  const index = process.argv.indexOf(flag);

  if (index === -1) {
    return defaultValue;
  }

  const value = process.argv[index + 1];

  if (!value || value.startsWith('--')) {
    return defaultValue;
  }

  if (typeof defaultValue === 'number') {
    const num = parseInt(value, 10);

    if (isNaN(num)) {
      return defaultValue;
    }

    return num;
  }

  return value;
};

/**
 * Validate CLI options
 *
 * @param options - Parsed CLI options
 */
const validateCliOptions = (options: CliOptions) => {
  const isValidPort = (typeof options.port === 'number') && (options.port > 0 && options.port <= 65536);

  if (!isValidPort) {
    throw new Error(`Invalid port: ${options.port}. Must be between 1 and 65535.`);
  }

  const isValidCacheLimit = (typeof options.cacheLimit === 'number') && (options.cacheLimit >= 1);

  if (options.cacheLimit !== undefined && !isValidCacheLimit) {
    throw new Error(`Invalid cache limit: ${options.cacheLimit}. Must be at least 1.`);
  }
};

/**
 * Parses and return command-line options for the CLI.
 *
 * @returns An object containing the processed and validated CLI options:
 * - `docsHost`: Indicates if the `--docs-host` option is enabled.
 * - `http`: Indicates if the `--http` option is enabled.
 * - `port`: The port number specified via `--port`, or defaults to `3000` if not provided.
 * - `host`: The host name specified via `--host`, or defaults to `'127.0.0.1'` if not provided.
 * - `allowedOrigins`: List of allowed origins derived from the `--allowed-origins` parameter, split by commas, or undefined if not provided.
 * - `allowedHosts`: List of allowed hosts derived from the `--allowed-hosts` parameter, split by commas, or undefined if not provided.
 * - `cacheLimit`: Number of server instances to cache before automatically closing older instances, specified via `--cache-limit`, or defaults to `3` if not provided.
 *
 * @throws {Error} If the provided CLI options fail validation.
 */
const parseCliOptions = () => {
  const options: CliOptions = {
    docsHost: process.argv.includes('--docs-host'),
    http: process.argv.includes('--http'),
    port: getArgValue('--port', 3000) as number,
    host: getArgValue('--host', '127.0.0.1') as string,
    allowedOrigins: (getArgValue('--allowed-origins') as string)?.split(',')?.filter((origin: string) => origin.trim()),
    allowedHosts: (getArgValue('--allowed-hosts') as string)?.split(',')?.filter((host: string) => host.trim()),
    cacheLimit: getArgValue('--cache-limit', 3) as number
  };

  validateCliOptions(options);

  return options;
};

export {
  parseCliOptions,
  getArgValue,
  validateCliOptions,
  type CliOptions,
  type DefaultOptions,
  type GlobalOptions
};

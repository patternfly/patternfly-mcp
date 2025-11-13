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
 * @param defaultValue - Default value if flag not found
 */
const getArgValue = (flag: string, defaultValue?: any): any => {
  const index = process.argv.indexOf(flag);

  if (index === -1) return defaultValue;

  const value = process.argv[index + 1];

  if (!value || value.startsWith('--')) return defaultValue;

  // Type conversion based on defaultValue
  if (defaultValue !== undefined) {
    if (typeof defaultValue === 'number') {
      const num = parseInt(value, 10);

      return isNaN(num) ? defaultValue : num;
    }
  }

  return value;
};

/**
 * Validate CLI options
 *
 * @param options - Parsed CLI options
 */
const validateCliOptions = (options: CliOptions): void => {
  if (options.port !== undefined) {
    if (options.port < 1 || options.port > 65535) {
      throw new Error(`Invalid port: ${options.port}. Must be between 1 and 65535.`);
    }
  }

  if (options.allowedOrigins) {
    const filteredOrigins = options.allowedOrigins.filter(origin => origin.trim());

    // eslint-disable-next-line no-param-reassign
    options.allowedOrigins = filteredOrigins;
  }

  if (options.allowedHosts) {
    const filteredHosts = options.allowedHosts.filter(host => host.trim());

    // eslint-disable-next-line no-param-reassign
    options.allowedHosts = filteredHosts;
  }
};

/**
 * Parse CLI arguments and return CLI options
 */
const parseCliOptions = (): CliOptions => {
  const options: CliOptions = {
    docsHost: process.argv.includes('--docs-host'),
    http: process.argv.includes('--http'),
    port: getArgValue('--port', 3000),
    host: getArgValue('--host', 'localhost'),
    allowedOrigins: getArgValue('--allowed-origins')?.split(','),
    allowedHosts: getArgValue('--allowed-hosts')?.split(',')
  };

  // Validate options
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

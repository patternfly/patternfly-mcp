import { type DefaultOptions } from './options.defaults';

/**
 * CLI options that users can set via command line arguments
 */
interface CliOptions {
  docsHost?: boolean;
  // Future CLI options can be added here
}

/**
 * Combined options object
 */
interface GlobalOptions extends CliOptions, DefaultOptions {
  // Combined DefaultOptions and CliOptions
}

/**
 * Parse CLI arguments and return CLI options
 */
const parseCliOptions = (): CliOptions => ({
  docsHost: process.argv.includes('--docs-host')
  // Future CLI options can be added here
});

export {
  parseCliOptions,
  type CliOptions,
  type DefaultOptions,
  type GlobalOptions
};

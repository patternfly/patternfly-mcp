import { join } from 'node:path';
import packageJson from '../package.json';
import { generateHash } from './server.helpers';

/**
 * CLI options that users can set via command line arguments
 */
interface CliOptions {
  docsHost?: boolean;
  // Future CLI options can be added here
}

/**
 * Application defaults (not user-configurable)
 */
interface AppDefaults {
  resourceMemoOptions: typeof RESOURCE_MEMO_OPTIONS;
  toolMemoOptions: typeof TOOL_MEMO_OPTIONS;
  pfExternal: string;
  pfExternalCharts: string;
  pfExternalChartsComponents: string;
  pfExternalChartsDesign: string;
  pfExternalDesign: string;
  pfExternalDesignComponents: string;
  pfExternalDesignLayouts: string;
  pfExternalAccessibility: string;
  separator: string;
  urlRegex: RegExp;
  name: string;
  version: string;
  repoName: string | undefined;
  contextPath: string;
  docsPath: string;
  llmsFilesPath: string;
  sessionId?: string;
}

/**
 * Frozen options object (immutable configuration)
 */
interface GlobalOptions extends CliOptions, AppDefaults {
  // This will be frozen and immutable
}

/**
 * Default separator for joining multiple document contents
 */
const DEFAULT_SEPARATOR = '\n\n---\n\n';

/**
 * Resource-level memoization options
 */
const RESOURCE_MEMO_OPTIONS = {
  fetchUrl: {
    cacheLimit: 100,
    expire: 3 * 60 * 1000, // 3 minute sliding cache
    cacheErrors: false
  },
  readFile: {
    cacheLimit: 50,
    expire: 2 * 60 * 1000, // 2 minute sliding cache
    cacheErrors: false
  }
};

/**
 * Tool-specific memoization options
 */
const TOOL_MEMO_OPTIONS = {
  usePatternFlyDocs: {
    cacheLimit: 10,
    expire: 1 * 60 * 1000, // 1 minute sliding cache
    cacheErrors: false
  },
  fetchDocs: {
    cacheLimit: 15,
    expire: 1 * 60 * 1000, // 1 minute sliding cache
    cacheErrors: false
  }
};

/**
 * URL regex pattern for detecting external URLs
 */
const URL_REGEX = /^(https?:)\/\//i;

/**
 * PatternFly docs root URL
 */
const PF_EXTERNAL = 'https://raw.githubusercontent.com/patternfly/patternfly-org/refs/heads/main/packages/documentation-site/patternfly-docs/content';

/**
 * PatternFly design guidelines URL
 */
const PF_EXTERNAL_DESIGN = `${PF_EXTERNAL}/design-guidelines`;

/**
 * PatternFly design guidelines' components' URL
 */
const PF_EXTERNAL_DESIGN_COMPONENTS = `${PF_EXTERNAL_DESIGN}/components`;

/**
 * PatternFly design guidelines' layouts' URL
 */
const PF_EXTERNAL_DESIGN_LAYOUTS = `${PF_EXTERNAL_DESIGN}/layouts`;

/**
 * PatternFly accessibility URL
 */
const PF_EXTERNAL_ACCESSIBILITY = `${PF_EXTERNAL}/accessibility`;

/**
 * PatternFly charts root URL
 */
const PF_EXTERNAL_CHARTS = 'https://raw.githubusercontent.com/patternfly/patternfly-react/refs/heads/main/packages/react-charts/src';

/**
 * PatternFly charts' components' URL
 */
const PF_EXTERNAL_CHARTS_COMPONENTS = `${PF_EXTERNAL_CHARTS}/victory/components`;

/**
 * PatternFly charts' design guidelines URL
 */
const PF_EXTERNAL_CHARTS_DESIGN = `${PF_EXTERNAL_CHARTS}/charts`;

/**
 * Global configuration options object.
 *
 * @type {GlobalOptions}
 * @property {CliOptions.docsHost} [docsHost] - Flag indicating whether to use the docs-host.
 * @property {string} pfExternal - PatternFly external docs URL.
 * @property {string} pfExternalCharts - PatternFly external charts URL.
 * @property {string} pfExternalChartsComponents - PatternFly external charts components URL.
 * @property {string} pfExternalChartsDesign - PatternFly external charts design guidelines URL.
 * @property {string} pfExternalDesign - PatternFly external design guidelines URL.
 * @property {string} pfExternalDesignComponents - PatternFly external design guidelines components URL.
 * @property {string} pfExternalDesignLayouts - PatternFly external design guidelines layouts URL.
 * @property {string} pfExternalAccessibility - PatternFly external accessibility URL.
 * @property {typeof RESOURCE_MEMO_OPTIONS} resourceMemoOptions - Resource-level memoization options.
 * @property {typeof TOOL_MEMO_OPTIONS} toolMemoOptions - Tool-specific memoization options.
 * @property {string} separator - Default string delimiter.
 * @property {RegExp} urlRegex - Regular expression pattern for URL matching.
 * @property {string} name - Name of the package.
 * @property {string} version - Version of the package.
 * @property {string} repoName - Name of the repository.
 * @property {string} contextPath - Current working directory.
 * @property {string} docsPath - Path to the documentation directory.
 * @property {string} llmsFilesPath - Path to the LLMs files directory.
 * @property {string} [sessionId] - Unique session identifier.
 */
const OPTIONS: GlobalOptions = {
  pfExternal: PF_EXTERNAL,
  pfExternalCharts: PF_EXTERNAL_CHARTS,
  pfExternalChartsComponents: PF_EXTERNAL_CHARTS_COMPONENTS,
  pfExternalChartsDesign: PF_EXTERNAL_CHARTS_DESIGN,
  pfExternalDesign: PF_EXTERNAL_DESIGN,
  pfExternalDesignComponents: PF_EXTERNAL_DESIGN_COMPONENTS,
  pfExternalDesignLayouts: PF_EXTERNAL_DESIGN_LAYOUTS,
  pfExternalAccessibility: PF_EXTERNAL_ACCESSIBILITY,
  resourceMemoOptions: RESOURCE_MEMO_OPTIONS,
  toolMemoOptions: TOOL_MEMO_OPTIONS,
  separator: DEFAULT_SEPARATOR,
  urlRegex: URL_REGEX,
  name: packageJson.name,
  version: (process.env.NODE_ENV === 'local' && '0.0.0') || packageJson.version,
  repoName: process.cwd()?.split?.('/')?.pop?.()?.trim?.(),
  contextPath: (process.env.NODE_ENV === 'local' && '/') || process.cwd(),
  docsPath: (process.env.NODE_ENV === 'local' && '/documentation') || join(process.cwd(), 'documentation'),
  llmsFilesPath: (process.env.NODE_ENV === 'local' && '/llms-files') || join(process.cwd(), 'llms-files')
};

/**
 * Parse CLI arguments and return CLI options
 */
const parseCliOptions = (): CliOptions => ({
  docsHost: process.argv.includes('--docs-host')
  // Future CLI options can be added here
});

/**
 * Generate a unique session ID
 */
const generateSessionId = (): string => {
  const timestamp = Date.now();
  const randomNumber = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
  const data = `session_${timestamp}_${randomNumber}`;

  return generateHash(data);
};

/**
 * Make global options immutable after combining CLI options with app defaults.
 *
 * @param cliOptions
 */
const setOptions = (cliOptions: CliOptions) => {
  // Create fresh instance using spread syntax for cleaner code
  const freshOptions = { ...structuredClone(OPTIONS), ...cliOptions };

  // Generate a new session ID for this fresh instance
  freshOptions.sessionId = generateSessionId();

  // Update the global OPTIONS reference
  Object.assign(OPTIONS, freshOptions);

  return freshOptions;
};

export {
  generateSessionId,
  parseCliOptions,
  setOptions,
  OPTIONS,
  PF_EXTERNAL,
  PF_EXTERNAL_CHARTS,
  PF_EXTERNAL_CHARTS_COMPONENTS,
  PF_EXTERNAL_CHARTS_DESIGN,
  PF_EXTERNAL_DESIGN,
  PF_EXTERNAL_DESIGN_COMPONENTS,
  PF_EXTERNAL_DESIGN_LAYOUTS,
  PF_EXTERNAL_ACCESSIBILITY,
  RESOURCE_MEMO_OPTIONS,
  TOOL_MEMO_OPTIONS,
  DEFAULT_SEPARATOR,
  URL_REGEX,
  type CliOptions,
  type AppDefaults,
  type GlobalOptions
};

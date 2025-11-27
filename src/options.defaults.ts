import { basename, join } from 'node:path';
import packageJson from '../package.json';

/**
 * Application defaults, not user-configurable
 *
 * @interface DefaultOptions
 *
 * @template TLogOptions The logging options type, defaulting to LoggingOptions.
 * @property contextPath - Current working directory.
 * @property docsHost - Flag indicating whether to use the docs-host.
 * @property docsPath - Path to the documentation directory.
 * @property llmsFilesPath - Path to the LLMs files directory.
 * @property {LoggingOptions} logging - Logging options.
 * @property name - Name of the package.
 * @property repoName - Name of the repository.
 * @property pfExternal - PatternFly external docs URL.
 * @property pfExternalDesignComponents - PatternFly design guidelines' components' URL.
 * @property pfExternalExamplesComponents - PatternFly examples' core components' URL.
 * @property pfExternalExamplesLayouts - PatternFly examples' core layouts' URL.
 * @property pfExternalExamplesCharts - PatternFly examples' charts' components' URL.'
 * @property pfExternalExamplesTable - PatternFly examples' table components' URL.
 * @property pfExternalChartsDesign - PatternFly charts' design guidelines URL.
 * @property pfExternalDesignLayouts - PatternFly design guidelines' layouts' URL.
 * @property pfExternalAccessibility - PatternFly accessibility URL.
 * @property {typeof RESOURCE_MEMO_OPTIONS} resourceMemoOptions - Resource-level memoization options.
 * @property {typeof TOOL_MEMO_OPTIONS} toolMemoOptions - Tool-specific memoization options.
 * @property separator - Default string delimiter.
 * @property urlRegex - Regular expression pattern for URL matching.
 * @property version - Version of the package.
 */
interface DefaultOptions<TLogOptions = LoggingOptions> {
  contextPath: string;
  docsHost: boolean;
  docsPath: string;
  llmsFilesPath: string;
  logging: TLogOptions;
  name: string;
  pfExternal: string;
  pfExternalDesignComponents: string;
  pfExternalExamplesComponents: string;
  pfExternalExamplesLayouts: string;
  pfExternalExamplesCharts: string;
  pfExternalExamplesTable: string;
  pfExternalChartsDesign: string;
  pfExternalDesignLayouts: string;
  pfExternalAccessibility: string;
  repoName: string | undefined;
  resourceMemoOptions: Partial<typeof RESOURCE_MEMO_OPTIONS>;
  separator: string;
  toolMemoOptions: Partial<typeof TOOL_MEMO_OPTIONS>;
  urlRegex: RegExp;
  version: string;
}

/**
 * Session defaults, not user-configurable
 */
/**
 * Represents the default session configuration with an associated session ID,
 * inheriting properties from the DefaultOptions interface.
 *
 * @extends DefaultOptions<LoggingSession>
 * @property sessionId The unique identifier for the session.
 */
interface DefaultSession extends DefaultOptions<LoggingSession> {
  readonly sessionId: string;
}

/**
 * Logging options.
 *
 * @interface LoggingOptions
 * @default { level: 'info', stderr: false, protocol: false, baseName: `${packageJson.name}:log`, transport: 'stdio' }
 *
 * @property level - Logging level.
 * @property stderr - Flag indicating whether to log to stderr.
 * @property protocol - Flag indicating whether to log protocol details.
 * @property baseName - Name of the logging channel.
 * @property transport - Transport mechanism for logging.
 */
interface LoggingOptions {
  level: 'debug' | 'info' | 'warn' | 'error';
  stderr: boolean;
  protocol: boolean;
  baseName: string;
  transport: 'stdio' | 'mcp';
}

/**
 * Logging session options, non-configurable by the user.
 *
 * @interface LoggingSession
 * @extends LoggingOptions
 * @property channelName - Unique identifier for the logging channel.
 */
interface LoggingSession extends LoggingOptions {
  readonly channelName: string;
}

/**
 * Base logging options.
 */
const LOGGING_OPTIONS: LoggingOptions = {
  level: 'info',
  stderr: false,
  protocol: false,
  baseName: `${packageJson.name}:log`,
  transport: 'stdio'
};

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

const PF_EXTERNAL_EXAMPLES_VERSION = 'v6.4.0';

/**
 * PatternFly examples URL
 */
const PF_EXTERNAL_EXAMPLES = `https://raw.githubusercontent.com/patternfly/patternfly-react/refs/tags/${PF_EXTERNAL_EXAMPLES_VERSION}/packages`;

/**
 * PatternFly examples' core components' URL.
 */
const PF_EXTERNAL_EXAMPLES_REACT_CORE = `${PF_EXTERNAL_EXAMPLES}/react-core/src/components`;

/**
 * PatternFly examples' core layouts' URL.
 */
const PF_EXTERNAL_EXAMPLES_LAYOUTS = `${PF_EXTERNAL_EXAMPLES}/react-core/src/layouts`;

/**
 * PatternFly examples' table components' URL.
 */
const PF_EXTERNAL_EXAMPLES_TABLE = `${PF_EXTERNAL_EXAMPLES}/react-table/src/components`;

/**
 * PatternFly charts' components' URL
 */
const PF_EXTERNAL_EXAMPLES_CHARTS = `${PF_EXTERNAL_EXAMPLES}/react-charts/src/victory/components`;

/**
 * PatternFly docs version to use, commit hash. Tags don't exist, but branches for older versions do.
 *
 * @see @patternfly/documentation-framework@6.30.0
 */
const PF_EXTERNAL_VERSION = 'fb05713aba75998b5ecf5299ee3c1a259119bd74';

/**
 * PatternFly docs root URL
 */
const PF_EXTERNAL = `https://raw.githubusercontent.com/patternfly/patternfly-org/${PF_EXTERNAL_VERSION}/packages/documentation-site/patternfly-docs/content`;

/**
 * PatternFly design guidelines' components' URL
 * Updated 2025-11-24: Moved from design-guidelines/components to components
 */
const PF_EXTERNAL_DESIGN_COMPONENTS = `${PF_EXTERNAL}/design-guidelines/components`;

/**
 * PatternFly design guidelines' layouts' URL
 * Updated 2025-11-24: Moved from design-guidelines/layouts to foundations-and-styles/layouts
 */
const PF_EXTERNAL_DESIGN_LAYOUTS = `${PF_EXTERNAL}/design-guidelines/layouts`;

/**
 * PatternFly accessibility URL
 * Updated 2025-11-24: Moved from accessibility to components/accessibility
 */
const PF_EXTERNAL_ACCESSIBILITY = `${PF_EXTERNAL}/accessibility`;

/**
 * PatternFly charts' design guidelines URL
 */
const PF_EXTERNAL_CHARTS_DESIGN = `${PF_EXTERNAL}/design-guidelines/charts`;

/**
 * Global default options. Base defaults before CLI/programmatic overrides.
 *
 * @type {DefaultOptions} Default options object.
 */
const DEFAULT_OPTIONS: DefaultOptions = {
  docsHost: false,
  contextPath: (process.env.NODE_ENV === 'local' && '/') || process.cwd(),
  docsPath: (process.env.NODE_ENV === 'local' && '/documentation') || join(process.cwd(), 'documentation'),
  llmsFilesPath: (process.env.NODE_ENV === 'local' && '/llms-files') || join(process.cwd(), 'llms-files'),
  logging: LOGGING_OPTIONS,
  name: packageJson.name,
  pfExternal: PF_EXTERNAL,
  pfExternalDesignComponents: PF_EXTERNAL_DESIGN_COMPONENTS,
  pfExternalExamplesComponents: PF_EXTERNAL_EXAMPLES_REACT_CORE,
  pfExternalExamplesLayouts: PF_EXTERNAL_EXAMPLES_LAYOUTS,
  pfExternalExamplesCharts: PF_EXTERNAL_EXAMPLES_CHARTS,
  pfExternalExamplesTable: PF_EXTERNAL_EXAMPLES_TABLE,
  pfExternalChartsDesign: PF_EXTERNAL_CHARTS_DESIGN,
  pfExternalDesignLayouts: PF_EXTERNAL_DESIGN_LAYOUTS,
  pfExternalAccessibility: PF_EXTERNAL_ACCESSIBILITY,
  resourceMemoOptions: RESOURCE_MEMO_OPTIONS,
  repoName: basename(process.cwd() || '').trim(),
  toolMemoOptions: TOOL_MEMO_OPTIONS,
  separator: DEFAULT_SEPARATOR,
  urlRegex: URL_REGEX,
  version: (process.env.NODE_ENV === 'local' && '0.0.0') || packageJson.version
};

export {
  PF_EXTERNAL,
  PF_EXTERNAL_VERSION,
  PF_EXTERNAL_EXAMPLES,
  PF_EXTERNAL_EXAMPLES_CHARTS,
  PF_EXTERNAL_EXAMPLES_REACT_CORE,
  PF_EXTERNAL_EXAMPLES_LAYOUTS,
  PF_EXTERNAL_EXAMPLES_TABLE,
  PF_EXTERNAL_EXAMPLES_VERSION,
  PF_EXTERNAL_CHARTS_DESIGN,
  PF_EXTERNAL_DESIGN_COMPONENTS,
  PF_EXTERNAL_DESIGN_LAYOUTS,
  PF_EXTERNAL_ACCESSIBILITY,
  RESOURCE_MEMO_OPTIONS,
  TOOL_MEMO_OPTIONS,
  DEFAULT_OPTIONS,
  DEFAULT_SEPARATOR,
  URL_REGEX,
  type DefaultOptions,
  type DefaultSession,
  type LoggingOptions,
  type LoggingSession
};

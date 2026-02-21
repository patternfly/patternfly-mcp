import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import packageJson from '../package.json';
import { type ToolModule } from './server.toolsUser';

/**
 * Application defaults, not all fields are user-configurable
 *
 * @interface DefaultOptions
 *
 * @template TLogOptions The logging options type, defaulting to LoggingOptions.
 * @property contextPath - Current working directory.
 * @property contextUrl - Current working directory URL.
 * @property docsPath - Path to the documentation directory.
 * @property docsPathSlug - Local docs slug. Used for resolving local stored documentation.
 * @property isHttp - Flag indicating whether the server is running in HTTP mode.
 * @property {HttpOptions} http - HTTP server options.
 * @property {LoggingOptions} logging - Logging options.
 * @property maxDocsToLoad - Maximum number of docs to load.
 * @property maxSearchLength - Maximum length for search strings.
 * @property recommendedMaxDocsToLoad - Recommended maximum number of docs to load.
 * @property {typeof MODE_LEVELS} mode - Specifies the mode of operation.
 *    - `cli`: Command-line interface mode.
 *    - `programmatic`: Programmatic interaction mode where the application is used as a library or API.
 *    - `test`: Testing or debugging mode.
 * @property {ModeOptions} modeOptions - Mode-specific options.
 * @property name - Name of the package.
 * @property nodeVersion - Node.js major version.
 * @property {PatternFlyOptions} patternflyOptions - PatternFly-specific options.
 * @property pfExternal - PatternFly external docs URL.
 * @property pfExternalDesignComponents - PatternFly design guidelines' components' URL.
 * @property pfExternalExamplesComponents - PatternFly examples' core components' URL.
 * @property pfExternalExamplesLayouts - PatternFly examples' core layouts' URL.
 * @property pfExternalExamplesCharts - PatternFly examples' charts' components' URL.
 * @property pfExternalExamplesTable - PatternFly examples' table components' URL.
 * @property pfExternalChartsDesign - PatternFly charts' design guidelines URL.
 * @property pfExternalDesignLayouts - PatternFly design guidelines' layouts' URL.
 * @property pfExternalAccessibility - PatternFly accessibility URL.
 * @property pluginIsolation - Isolation preset for external plugins.
 * @property {PluginHostOptions} pluginHost - Plugin host options.
 * @property repoName - Name of the repository.
 * @property {typeof RESOURCE_MEMO_OPTIONS} resourceMemoOptions - Resource-level memoization options.
 * @property separator - Default string delimiter.
 * @property {StatsOptions} stats - Stats options.
 * @property {typeof TOOL_MEMO_OPTIONS} toolMemoOptions - Tool-specific memoization options.
 * @property {ToolModule|ToolModule[]} toolModules - Array of external tool modules (ESM specs or paths) to be loaded and
 *     registered with the server.
 * @property urlRegex - Regular expression pattern for URL matching.
 * @property version - Version of the package.
 * @property xhrFetch - XHR and Fetch options.
 */
interface DefaultOptions<TLogOptions = LoggingOptions> {
  contextPath: string;
  contextUrl: string;
  docsPath: string;
  docsPathSlug: string;
  http: HttpOptions;
  isHttp: boolean;
  logging: TLogOptions;
  maxDocsToLoad: number;
  maxSearchLength: number;
  recommendedMaxDocsToLoad: number;
  mode: 'cli' | 'programmatic' | 'test';
  modeOptions: ModeOptions;
  name: string;
  nodeVersion: number;
  patternflyOptions: PatternFlyOptions;
  pluginIsolation: 'none' | 'strict';
  pluginHost: PluginHostOptions;
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
  resourceModules: unknown | unknown[];
  separator: string;
  stats: StatsOptions;
  toolMemoOptions: Partial<typeof TOOL_MEMO_OPTIONS>;
  toolModules: ToolModule | ToolModule[];
  urlRegex: RegExp;
  version: string;
  xhrFetch: XhrFetchOptions;
}

/**
 * Overrides for default options. Exposed to the consumer/user.
 */
type DefaultOptionsOverrides = Partial<
  Omit<DefaultOptions, 'mode' | 'modeOptions' | 'http' | 'logging' | 'pluginIsolation' | 'toolModules'>
> & {
  mode?: DefaultOptions['mode'] | undefined;
  modeOptions?: Partial<ModeOptions> | undefined;
  http?: Partial<HttpOptions>;
  logging?: Partial<LoggingOptions>;
  pluginIsolation?: 'none' | 'strict' | undefined;
  toolModules?: ToolModule | ToolModule[] | undefined;
};

/**
 * HTTP server options.
 *
 * See `HTTP_OPTIONS` for defaults.
 *
 * @interface HttpOptions
 *
 * @property port Port number.
 * @property host Host name.
 * @property allowedOrigins List of allowed origins.
 * @property allowedHosts List of allowed hosts.
 */
interface HttpOptions {
  port: number;
  host: string;
  allowedOrigins: string[];
  allowedHosts: string[];
}

/**
 * Logging options.
 *
 * See `LOGGING_OPTIONS` for defaults.
 *
 * @interface LoggingOptions
 *
 * @property level Logging level.
 * @property logger Logger name. Human-readable/configurable logger name used in MCP protocol messages. Isolated
 *     to make passing logging options between modules easier. This does not change the session unique
 *     diagnostics-channel name and is intended to label messages forwarded over the MCP protocol.
 * @property stderr Flag indicating whether to log to stderr.
 * @property protocol Flag indicating whether to log protocol details.
 * @property transport Transport mechanism for logging.
 */
interface LoggingOptions {
  level: 'debug' | 'info' | 'warn' | 'error';
  logger: string;
  stderr: boolean;
  protocol: boolean;
  transport: 'stdio' | 'mcp';
}

/**
 * Mode-specific options.
 *
 * @interface ModeOptions
 * @property test Test-specific options.
 * @property test.baseUrl Base URL for testing.
 */
interface ModeOptions {
  cli?: object | undefined;
  programmatic?: object | undefined;
  test?: {
    baseUrl?: string | undefined;
  } | undefined;
}

/**
 * PatternFly-specific options.
 *
 * @property availableResourceVersions List of available PatternFly resource versions to the MCP server.
 * @property availableSearchVersions List of available PatternFly search versions to the MCP server.
 * @property availableSchemasVersions List of available PatternFly schema versions to the MCP server.
 * @property default Default specific options.
 * @property default.latestSemVer Default PatternFly `SemVer` major version (e.g., '6.0.0').
 * @property default.latestVersion Default PatternFly `tag` major version, used for display and file paths (e.g., 'v6').
 * @property default.latestSchemasVersion Default PatternFly `tag` major version, used for schemas.
 * @property default.versionWhitelist List of mostly reliable dependencies to scan for when detecting the PatternFly version.
 * @property default.versionStrategy Strategy to use when multiple PatternFly versions are detected.
 *    - 'highest': Use the highest major version found.
 *    - 'lowest': Use the lowest major version found.
 */
interface PatternFlyOptions {
  availableResourceVersions: ('6.0.0')[];
  availableSearchVersions: ('current' | 'detected' | 'latest' | 'v6')[];
  availableSchemasVersions: ('v6')[];
  default: {
    latestSemVer: '6.0.0';
    latestVersion: 'v6';
    latestSchemasVersion: 'v6';
    versionWhitelist: string[];
    versionStrategy: 'highest' | 'lowest';
  }
}

/**
 * Tools Host options (pure data). Centralized defaults live here.
 *
 * @property loadTimeoutMs Timeout for child spawn + hello/load/manifest (ms).
 * @property invokeTimeoutMs Timeout per external tool invocation (ms).
 * @property gracePeriodMs Grace period for external tool invocations (ms).
 */
interface PluginHostOptions {
  loadTimeoutMs: number;
  invokeTimeoutMs: number;
  gracePeriodMs: number;
}

/**
 * Logging session options, non-configurable by the user.
 *
 * @interface LoggingSession
 * @extends LoggingOptions
 * @property channelName Unique identifier for the logging channel.
 */
interface LoggingSession extends LoggingOptions {
  readonly channelName: string;
}

/**
 * Base stats options.
 */
type StatsOptions = {
  reportIntervalMs: {
    health: number;
    transport: number;
  }
};

/**
 * Stats channel names.
 */
type StatsChannels = {
  readonly health: string;
  readonly session: string;
  readonly transport: string;
  readonly traffic: string;
};

/**
 * Stats session options, non-configurable by the user.
 *
 * @interface StatsSession
 * @property publicSessionId Unique identifier for the stats session.
 * @property channels Channel names for stats.
 */
interface StatsSession extends StatsOptions {
  readonly publicSessionId: string;
  channels: StatsChannels
}

/**
 * XHR and Fetch options.
 *
 * @interface XhrFetchOptions
 *
 * @property timeoutMs Timeout for XHR and Fetch requests (ms).
 */
interface XhrFetchOptions {
  timeoutMs: number;
}

/**
 * Base logging options.
 */
const LOGGING_OPTIONS: LoggingOptions = {
  level: 'info',
  logger: packageJson.name,
  stderr: false,
  protocol: false,
  transport: 'stdio'
};

/**
 * Base HTTP options.
 */
const HTTP_OPTIONS: HttpOptions = {
  port: 8080,
  host: '127.0.0.1',
  allowedOrigins: [],
  allowedHosts: []
};

/**
 * Mode-specific options.
 */
const MODE_OPTIONS: ModeOptions = {
  cli: {},
  programmatic: {},
  test: {}
};

/**
 * Default plugin host options.
 */
const PLUGIN_HOST_OPTIONS: PluginHostOptions = {
  loadTimeoutMs: 5000,
  invokeTimeoutMs: 10_000,
  gracePeriodMs: 2000
};

/**
 * Default separator for joining multiple document contents
 */
const DEFAULT_SEPARATOR = '\n\n---\n\n';

/**
 * Resource-level memoization options
 */
const RESOURCE_MEMO_OPTIONS = {
  default: {
    cacheLimit: 3
  },
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
  searchPatternFlyDocs: {
    cacheLimit: 10,
    expire: 10 * 60 * 1000, // 10 minute sliding cache
    cacheErrors: false
  }
};

/**
 * Default stats options.
 */
const STATS_OPTIONS: StatsOptions = {
  reportIntervalMs: {
    health: 30_000,
    transport: 10_000
  }
};

/**
 * Default XHR and Fetch options.
 */
const XHR_FETCH_OPTIONS: XhrFetchOptions = {
  timeoutMs: 15_000
};

/**
 * Base logging channel name. Fixed to avoid user override.
 */
const LOG_BASENAME = 'pf-mcp:log';

/**
 * Default PatternFly-specific options.
 */
const PATTERNFLY_OPTIONS: PatternFlyOptions = {
  availableResourceVersions: ['6.0.0'],
  availableSearchVersions: ['current', 'latest', 'v6'],
  availableSchemasVersions: ['v6'],
  default: {
    latestSemVer: '6.0.0',
    latestVersion: 'v6',
    latestSchemasVersion: 'v6',
    versionWhitelist: [
      '@patternfly/react-core',
      '@patternfly/patternfly'
    ],
    versionStrategy: 'highest'
  }
};

/**
 * URL regex pattern for detecting external URLs
 */
const URL_REGEX = /^(https?:)\/\//i;

/**
 * Available operational modes for the MCP server.
 */
const MODE_LEVELS: DefaultOptions['mode'][] = ['cli', 'programmatic', 'test'];

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
 * Get the current Node.js major version.
 *
 * @param nodeVersion
 * @returns Node.js major version.
 */
const getNodeMajorVersion = (nodeVersion = process.versions.node) => {
  const updatedNodeVersion = nodeVersion || '0.0.0';
  const major = Number.parseInt(updatedNodeVersion?.split?.('.')?.[0] || '0', 10);

  if (Number.isFinite(major)) {
    return major;
  }

  return 0;
};

/**
 * Global default options. Base defaults before CLI/programmatic overrides.
 *
 * @note `maxDocsToLoad` and `recommendedMaxDocsToLoad` should be generated from the length
 * of doc-link resources once we migrate over to a new docs structure.
 *
 * @type {DefaultOptions} Default options object.
 */
const DEFAULT_OPTIONS: DefaultOptions = {
  contextPath: (process.env.NODE_ENV === 'local' && '/') || resolve(process.cwd()),
  contextUrl: pathToFileURL((process.env.NODE_ENV === 'local' && '/') || resolve(process.cwd())).href,
  docsPath: (process.env.NODE_ENV === 'local' && '/documentation') || join(resolve(process.cwd()), 'documentation'),
  docsPathSlug: 'documentation:',
  isHttp: false,
  http: HTTP_OPTIONS,
  logging: LOGGING_OPTIONS,
  maxDocsToLoad: 500,
  maxSearchLength: 256,
  recommendedMaxDocsToLoad: 15,
  mode: 'programmatic',
  modeOptions: MODE_OPTIONS,
  name: packageJson.name,
  nodeVersion: (process.env.NODE_ENV === 'local' && 22) || getNodeMajorVersion(),
  patternflyOptions: PATTERNFLY_OPTIONS,
  pfExternal: PF_EXTERNAL,
  pfExternalDesignComponents: PF_EXTERNAL_DESIGN_COMPONENTS,
  pfExternalExamplesComponents: PF_EXTERNAL_EXAMPLES_REACT_CORE,
  pfExternalExamplesLayouts: PF_EXTERNAL_EXAMPLES_LAYOUTS,
  pfExternalExamplesCharts: PF_EXTERNAL_EXAMPLES_CHARTS,
  pfExternalExamplesTable: PF_EXTERNAL_EXAMPLES_TABLE,
  pfExternalChartsDesign: PF_EXTERNAL_CHARTS_DESIGN,
  pfExternalDesignLayouts: PF_EXTERNAL_DESIGN_LAYOUTS,
  pfExternalAccessibility: PF_EXTERNAL_ACCESSIBILITY,
  pluginIsolation: 'strict',
  pluginHost: PLUGIN_HOST_OPTIONS,
  resourceMemoOptions: RESOURCE_MEMO_OPTIONS,
  repoName: basename(process.cwd() || '').trim(),
  stats: STATS_OPTIONS,
  resourceModules: [],
  toolMemoOptions: TOOL_MEMO_OPTIONS,
  toolModules: [],
  separator: DEFAULT_SEPARATOR,
  urlRegex: URL_REGEX,
  version: (process.env.NODE_ENV === 'local' && '0.0.0') || packageJson.version,
  xhrFetch: XHR_FETCH_OPTIONS
};

export {
  LOG_BASENAME,
  DEFAULT_OPTIONS,
  MODE_LEVELS,
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
  getNodeMajorVersion,
  type DefaultOptions,
  type DefaultOptionsOverrides,
  type HttpOptions,
  type LoggingOptions,
  type LoggingSession,
  type ModeOptions,
  type PatternFlyOptions,
  type PluginHostOptions,
  type StatsSession,
  type XhrFetchOptions
};

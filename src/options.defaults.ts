import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import packageJson from '../package.json';
import { type ToolModule } from './server.toolsUser';
import { getNodeMajorVersion } from './options.helpers';

/**
 * Application defaults, not all fields are user-configurable
 *
 * @interface DefaultOptions
 *
 * @template TLogOptions The logging options type, defaulting to LoggingOptions.
 * @property contextManagement - Strategy for managing agent context and response sizes, primarily within MCP tools.
 *    - 'false': Default standard text-heavy responses.
 *    - 'true': High-efficiency mode for MCP tools, using McpResource links.
 * @property contextPath - Current working directory.
 * @property contextUrl - Current working directory URL.
 * @property docsPaths - List of allowed local documentation directories handled by `docsPathSlug`
 * @property docsPathSlug - Local docs slug. Used for resolving local stored documentation.
 * @property experimental - Used experimental options list.
 * @property isHttp - Flag indicating whether the server is running in HTTP mode.
 * @property {HttpOptions} http - HTTP server options.
 * @property {LoggingOptions} logging - Logging options.
 * @property {MinMax} minMax - Minimum and maximum ranges for various options.
 * @property {typeof MODE_LEVELS} mode - Specifies the mode of operation.
 *    - `cli`: Command-line interface mode.
 *    - `programmatic`: Programmatic interaction mode where the application is used as a library or API.
 *    - `test`: Testing or debugging mode.
 * @property {ModeOptions} modeOptions - Mode-specific options.
 * @property name - Name of the package.
 * @property nodeEngine - Minimum Node.js version requirement from package.json.
 * @property nodeVersion - Node.js major version.
 * @property nodeVersionPreferred = Preferred Node.js major version. Typically used for testing.
 * @property {PatternFlyOptions} patternflyOptions - PatternFly-specific options.
 * @property pluginIsolation - Isolation preset for external plugins.
 * @property {PluginHostOptions} pluginHost - Plugin host options.
 * @property repoBugs - Bugs URL of the repository.
 * @property repoName - Name of the repository.
 * @property {RepoResources} repoResources - Repository resources.
 * @property repoSupport - Troubleshooting URL of the repository.
 * @property {typeof RESOURCE_MEMO_OPTIONS} resourceMemoOptions - Resource-level memoization options.
 * @property resourceModules - Array for programmatic registration of resource provider modules, similar to `toolModules` but
 *     for MCP resources and currently only internal.
 * @property separator - Default string delimiter.
 * @property serverInstanceOptions - Server-instance options.
 * @property {StatsOptions} stats - Stats options.
 * @property {typeof TOOL_MEMO_OPTIONS} toolMemoOptions - Tool-specific memoization options.
 * @property {ToolModule|ToolModule[]} toolModules - Array of external tool modules (ESM specs or paths) to be loaded and
 *     registered with the server.
 * @property urlRegex - Regular expression pattern for URL matching.
 * @property version - Version of the package.
 * @property whitelist - Central outbound-URL policy options.
 * @property xhrFetch - XHR and Fetch options.
 */
interface DefaultOptions<TLogOptions = LoggingOptions> {
  contextManagement: boolean;
  contextPath: string;
  contextUrl: string;
  docsPaths: string[];
  docsPathSlug: string;
  experimental: string[];
  http: HttpOptions;
  isHttp: boolean;
  logging: TLogOptions;
  minMax: MinMax;
  mode: 'cli' | 'programmatic' | 'test';
  modeOptions: ModeOptions;
  name: string;
  nodeEngine: string | undefined;
  nodeVersion: number;
  nodeVersionPreferred: number;
  patternflyOptions: PatternFlyOptions;
  pluginIsolation: 'none' | 'strict';
  pluginHost: PluginHostOptions;
  repoBugs: string | undefined;
  repoName: string | undefined;
  repoResources: RepoResources;
  repoSupport: string | undefined;
  resourceMemoOptions: Partial<typeof RESOURCE_MEMO_OPTIONS>;
  resourceModules: unknown | unknown[];
  separator: string;
  serverInstanceOptions: ServerInstanceOptions;
  stats: StatsOptions;
  toolMemoOptions: Partial<typeof TOOL_MEMO_OPTIONS>;
  toolModules: ToolModule | ToolModule[];
  urlRegex: RegExp;
  version: string;
  whitelist: WhitelistOptions;
  xhrFetch: XhrFetchOptions;
}

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
 * Minimum and maximum ranges for various options.
 *
 * @interface MinMax
 *
 * @property urlString Minimum and maximum length for URL strings.
 * @property toolSearches Minimum and maximum number of tool results for searches.
 * @property inputStrings Minimum and maximum length for input strings.
 * @property docsToLoad Minimum and maximum number of docs to load.
 */
interface MinMax {
  urlString: {
    min: number;
    max: number;
  }
  toolSearches: {
    min: number;
    max: number;
  }
  inputStrings: {
    min: number;
    max: number;
  }
  docsToLoad: {
    min: number;
    max: number;
  }
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
  availableSearchVersions: ('current' | 'latest' | 'v6')[];
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
 * Repo resources.
 *
 * @property bugs URL for bug reports.
 * @property git URL for the repository.
 * @property homepage URL for the project homepage.
 */
interface RepoResources {
  bugs: string;
  git: string;
  homepage: string;
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
 * MCP Server instance options.
 *
 * @interface ServerInstanceOptions
 * @property instructions Instructions for the MCP server instance.
 */
interface ServerInstanceOptions {
  instructions: string;
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
 * A string that must start with a valid protocol.
 */
type WhitelistUrl = `${'http' | 'https'}://${string}`;

/**
 * Central outbound-URL policy.
 *
 * @note Any code that fetches a remote URL; PatternFly docs,
 * `setFetch`, resource loaders; must validate against this
 * list via `assertInputUrlWhiteListed`.
 *
 * @property urls Allowed URL prefixes (scheme + host [+ path]).
 * @property protocols Allowed URL protocols.
 */
interface WhitelistOptions {
  urls: WhitelistUrl[];
  protocols: ('http' | 'https')[];
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
 * Minimum and maximum ranges for various options.
 */
const MIN_MAX: MinMax = {
  urlString: {
    min: 11,
    max: 1500
  },
  toolSearches: {
    min: 0,
    max: 10
  },
  inputStrings: {
    min: 1,
    max: 256
  },
  docsToLoad: {
    min: 0,
    max: 15
  }
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
 * The application's preferred Node.js major. Typically used for
 * unit testing.
 *
 * @note Currently hardcoded due to potential differences in Node.js
 * versions. Review populating this from the `package.json` engine.
 */
const NODE_VERSION_PREFERRED = 22;

/**
 * Default plugin host options.
 */
const PLUGIN_HOST_OPTIONS: PluginHostOptions = {
  loadTimeoutMs: 5000,
  invokeTimeoutMs: 10_000,
  gracePeriodMs: 2000
};

/**
 * Default repo resources.
 */
const REPO_RESOURCES: RepoResources = {
  bugs: packageJson.bugs?.url || '',
  git: packageJson.repository?.url || '',
  homepage: packageJson.homepage || ''
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
 * Default server instance options.
 */
const SERVER_INSTANCE_OPTIONS: ServerInstanceOptions = {
  instructions:
    'Use the PatternFly MCP when a user asks about: PatternFly, pf, pf docs, design tokens, design guidelines, accessibility, PatternFly components, and frontend development. Use patternfly://context for server environment and troubleshooting links if runtime issues occur.'
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
 * Central outbound-URL policy. Single source of truth on `DefaultOptions.whitelist`.
 */
const WHITELIST_OPTIONS: WhitelistOptions = {
  urls: [
    'https://patternfly.org',
    'https://github.com/patternfly',
    'https://raw.githubusercontent.com/patternfly'
  ],
  protocols: ['http', 'https']
};

/**
 * Default XHR and Fetch options.
 */
const XHR_FETCH_OPTIONS: XhrFetchOptions = {
  timeoutMs: 15_000
};

/**
 * Base diagnostics channel name. Fixed to avoid user override and channel collisions.
 */
const CHANNEL_BASENAME = 'pf-mcp';

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
 *
 * @note Testing doesn't always use the expected mode
 * - Unit tests default to `programmatic` mode
 * - E2E tests generally use `test` mode
 */
const MODE_LEVELS: DefaultOptions['mode'][] = ['cli', 'programmatic', 'test'];

/**
 * Available plugin isolation settings.
 */
const PLUGIN_ISOLATION: DefaultOptions['pluginIsolation'][] = ['none', 'strict'];

/**
 * Global default options. Base defaults before CLI/programmatic overrides.
 *
 * @note `maxDocsToLoad` and `recommendedMaxDocsToLoad` should be generated from the length
 * of doc-link resources once we migrate over to a new docs structure.
 *
 * @type {DefaultOptions} Default options object.
 */
const DEFAULT_OPTIONS: DefaultOptions = {
  contextManagement: false,
  contextPath: (process.env.NODE_ENV === 'local' && '/') || resolve(process.cwd()),
  contextUrl: pathToFileURL((process.env.NODE_ENV === 'local' && '/') || resolve(process.cwd())).href,
  docsPaths: [],
  docsPathSlug: 'documentation:',
  experimental: [],
  isHttp: false,
  http: HTTP_OPTIONS,
  logging: LOGGING_OPTIONS,
  minMax: MIN_MAX,
  mode: 'programmatic',
  modeOptions: MODE_OPTIONS,
  name: packageJson.name,
  nodeEngine: packageJson.engines?.node,
  nodeVersion: (process.env.NODE_ENV === 'local' && NODE_VERSION_PREFERRED) || getNodeMajorVersion(process.versions.node),
  nodeVersionPreferred: NODE_VERSION_PREFERRED,
  patternflyOptions: PATTERNFLY_OPTIONS,
  pluginIsolation: 'strict',
  pluginHost: PLUGIN_HOST_OPTIONS,
  repoBugs: packageJson.bugs?.url,
  repoSupport: packageJson.support?.url,
  repoName: basename(process.cwd() || '').trim(),
  repoResources: REPO_RESOURCES,
  resourceMemoOptions: RESOURCE_MEMO_OPTIONS,
  serverInstanceOptions: SERVER_INSTANCE_OPTIONS,
  stats: STATS_OPTIONS,
  resourceModules: [],
  toolMemoOptions: TOOL_MEMO_OPTIONS,
  toolModules: [],
  separator: DEFAULT_SEPARATOR,
  urlRegex: URL_REGEX,
  version: (process.env.NODE_ENV === 'local' && '0.0.0') || packageJson.version,
  whitelist: WHITELIST_OPTIONS,
  xhrFetch: XHR_FETCH_OPTIONS
};

export {
  DEFAULT_OPTIONS,
  CHANNEL_BASENAME,
  MODE_LEVELS,
  PLUGIN_ISOLATION,
  type DefaultOptions,
  type HttpOptions,
  type LoggingOptions,
  type LoggingSession,
  type MinMax,
  type ModeOptions,
  type PatternFlyOptions,
  type PluginHostOptions,
  type RepoResources,
  type ServerInstanceOptions,
  type StatsSession,
  type ToolModule,
  type WhitelistOptions,
  type WhitelistUrl,
  type XhrFetchOptions
};

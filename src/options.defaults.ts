import { join } from 'node:path';
import packageJson from '../package.json';

/**
 * Application defaults (not user-configurable)
 */
interface DefaultOptions {
  resourceMemoOptions: Partial<typeof RESOURCE_MEMO_OPTIONS>;
  toolMemoOptions: Partial<typeof TOOL_MEMO_OPTIONS>;
  pfExternal: string;
  pfExternalDesignComponents: string;
  pfExternalExamplesComponents: string;
  pfExternalExamplesLayouts: string;
  pfExternalExamplesCharts: string;
  pfExternalExamplesTable: string;
  pfExternalChartsDesign: string;
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
 * @type {GlobalOptions} Default options object.
 * @property {CliOptions.docsHost} [docsHost] - Flag indicating whether to use the docs-host.
 * @property {string} pfExternal - PatternFly external URL.
 * @property {string} pfExternalDesignComponents - PatternFly design guidelines' components' URL.
 * @property {string} pfExternalExamplesComponents - PatternFly examples' core components' URL.
 * @property {string} pfExternalExamplesLayouts - PatternFly examples' core layouts' URL.
 * @property {string} pfExternalExamplesCharts - PatternFly examples' charts' components' URL.'
 * @property {string} pfExternalExamplesTable - PatternFly examples' table components' URL.
 * @property {string} pfExternalChartsDesign - PatternFly charts' design guidelines URL.
 * @property {string} pfExternalDesignLayouts - PatternFly design guidelines' layouts' URL.
 * @property {string} pfExternalAccessibility - PatternFly accessibility URL.
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
 */
const DEFAULT_OPTIONS: DefaultOptions = {
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

const DEFAULTS = {
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
  URL_REGEX
};

export {
  DEFAULTS,
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
  type DefaultOptions
};

import { type McpResource } from './mcpSdk';
import { stringJoin } from './server.helpers';
import { getOptions, runWithOptions } from './options.context';

/**
 * Name of the resource.
 */
const NAME = 'patternfly-context';

/**
 * URI template for the resource.
 */
const URI_TEMPLATE = 'patternfly://context';

/**
 * Resource configuration.
 */
const CONFIG = {
  title: 'PatternFly Design System Context',
  description: 'Information about the PatternFly design system and how to use this MCP server, including environment and troubleshooting information.',
  mimeType: 'text/markdown'
};

/**
 * Resource callback for the documentation index.
 *
 * @note Consider refining the environment snapshot here once contextual MCP tooling is available.
 *   ```
 *   const environmentSnapshot = stringJoin.newline(
 *     `### Environment Snapshot`,
 *     `**PatternFly Version:** ${detectedVersion}`,
 *     `**Detected PatternFly SemVer:** ${detectedSemverVersion}`,
 *     `**Context Path**: ${detectedProjectPath}`
 *   );
 *  ```
 *
 * @param passedUri - URI of the resource.
 * @param options - Options for the resource.
 * @returns The resource contents.
 */
const resourceCallback = async (passedUri: URL, options = getOptions()) => {
  const troubleshooting = stringJoin.newlineFiltered(
    options.repoSupport && `- **Troubleshooting guidance:** ${options.repoSupport}`,
    options.repoBugs && `- **Report bugs:** ${options.repoBugs}`
  );
  const activeExperimentalFeatures = options.experimental.join(', ') || 'None';

  const availableMcpResources = options.contextManagement
    ? '- **MCP resources:** Can be used to list and access available documentation resources.'
    : '- **MCP resources:** Can be used to list, filter, and read available documentation resources.';

  const availableToolFunctions = options.contextManagement ? 'search, list and access' : 'search, fetch and display';
  const context = `PatternFly is an open-source design system for building consistent, accessible user interfaces.

**What is PatternFly?**
PatternFly provides React components, design guidelines, and development tools for creating enterprise applications. It is used by Red Hat and other organizations to build consistent UIs with reusable components and design principles.

**Key Features:**
- React component library with TypeScript support
- Design guidelines and accessibility standards
- JSON Schema validation for component props
- Comprehensive documentation, examples, and AI guidance

**PatternFly MCP Server:**
This MCP server provides tools and resources to access all PatternFly documentation resources ranging from design to development.
- **MCP tools:** Can be used to ${availableToolFunctions} available documentation resources.
${availableMcpResources}

**Environment:**
- **MCP Server Mode:** ${options.mode}
- **MCP Server Version:** ${options.version || 'Unknown'}
- **Node.js Major Version:** ${options.nodeVersion || 'Unknown'}
- **Active Experimental Features:** ${activeExperimentalFeatures}

${(troubleshooting && stringJoin.newline('**Troubleshooting:**', troubleshooting)) || ''}
`;

  return {
    contents: [
      {
        uri: passedUri?.toString(),
        mimeType: 'text/markdown',
        text: stringJoin.basic(context)
      }
    ]
  };
};

/**
 * Resource creator for context.
 *
 * @param options - Global options
 * @returns {McpResource} The resource definition tuple
 */
const patternFlyContextResource = (options = getOptions()): McpResource => {
  const callback: McpResource[3] = async uri =>
    runWithOptions(options, async () => resourceCallback(uri));

  return [
    NAME,
    URI_TEMPLATE,
    CONFIG,
    callback
  ];
};

export {
  patternFlyContextResource,
  resourceCallback,
  NAME,
  URI_TEMPLATE,
  CONFIG
};

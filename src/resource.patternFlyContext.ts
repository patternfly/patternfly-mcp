import { type McpResource } from './server';
import { getPatternFlyMcpResources } from './patternFly.getResources';
import { getOptions } from './options.context';
import { stringJoin } from './server.helpers';

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
  description: 'Information about PatternFly design system and how to use this MCP server',
  mimeType: 'text/markdown'
};

/**
 * Resource creator for context.
 *
 * @param options - Global options
 * @returns {McpResource} The resource definition tuple
 */
const patternFlyContextResource = (options = getOptions()): McpResource => [
  NAME,
  URI_TEMPLATE,
  CONFIG,
  async () => {
    const { envVersion } = await getPatternFlyMcpResources.memo();
    const context = `PatternFly is an open-source design system for building consistent, accessible user interfaces.

**What is PatternFly?**
PatternFly provides React components, design guidelines, and development tools for creating enterprise applications. It is used by Red Hat and other organizations to build consistent UIs with reusable components.

**Key Features:**
- React component library with TypeScript support
- Design guidelines and accessibility standards
- JSON Schema validation for component props
- Comprehensive documentation and examples

**PatternFly MCP Server:**
This MCP server provides tools to access PatternFly documentation, component schemas, and design guidelines. Use the available tools to fetch documentation, search for component information, and retrieve component prop definitions.`;

    const environmentSnapshot = stringJoin.newline(
      `### Environment Snapshot`,
      '',
      `**PatternFly Version:** ${envVersion}`,
      // `**Detected PatternFly SemVer:** ${closestSemVer}`,
      `**Context Path**: ${options.contextPath}`
    );

    return {
      contents: [
        {
          uri: 'patternfly://context',
          mimeType: 'text/markdown',
          text: stringJoin.basic(context, options.separator, environmentSnapshot)
        }
      ]
    };
  }
];

export { patternFlyContextResource, NAME, URI_TEMPLATE, CONFIG };

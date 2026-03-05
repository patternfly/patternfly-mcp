import { type McpResource } from './server';
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
  description: 'Information about the PatternFly design system and how to use this MCP server.',
  mimeType: 'text/markdown'
};

/**
 * Resource creator for context.
 *
 * @note Consider adding an environment snapshot here once contextual MCP tooling is available.
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
 * @returns {McpResource} The resource definition tuple
 */
const patternFlyContextResource = (): McpResource => [
  NAME,
  URI_TEMPLATE,
  CONFIG,
  async (passedUri: URL) => {
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
- **MCP tools:** Can be used to search, fetch and display available documentation resources.
- **MCP resources:** Can be used to list, filter and display available documentation resources.
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
  }
];

export { patternFlyContextResource, NAME, URI_TEMPLATE, CONFIG };

/**
 * Example of authoring a custom tool.
 *
 * To load this tool into the PatternFly MCP server:
 * 1. Save this file (e.g., `toolPluginHelloWorld.js`)
 * 2. Run the server with: `npx @patternfly/patternfly-mcp --tool <path-to-the-file>/toolPluginHelloWorld.js`
 *
 * Note:
 * - External tool file loading requires Node.js >= 22.
 * - JS support only. TypeScript is only supported for embedding the server.
 * - Requires ESM default export.
 */
import { createMcpTool } from '@patternfly/patternfly-mcp';

export default createMcpTool({
  name: 'helloWorld',
  description: 'A simple example tool that greets the user.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'The name of the person to greet.'
      }
    },
    required: ['name']
  },
  async handler({ name }) {
    return {
      content: [
        {
          type: 'text',
          text: `Hello, ${name}! Welcome to the PatternFly MCP ecosystem.`
        }
      ]
    };
  }
});

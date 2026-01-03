// Fixture exports a createMcpTool module directly;
// eslint-disable-next-line import/no-unresolved
import { createMcpTool } from '@patternfly/patternfly-mcp';

export default createMcpTool({
  name: 'echo_createMcp_tool',
  description: 'Echo create MCP tool. Echos back the provided args.',
  inputSchema: { additionalProperties: true },
  handler: async args => ({
    args,
    content: [
      {
        type: 'text',
        text: JSON.stringify(args)
      }
    ]
  })
});

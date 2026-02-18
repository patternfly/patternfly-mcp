// Fixture exports a creator function directly;

const echo_plugin_tool = () => [
  'echo_basicError_tool',
  {
    description: 'Echo basic tool that errors. Echos back the provided args.',
    inputSchema: { additionalProperties: true }
  }
];

echo_plugin_tool.toolName = 'echo_basicError_tool';

export default echo_plugin_tool;

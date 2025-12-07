// Fixture exports a creator function directly;

const echo_plugin_tool = options => [
  'echo_plugin_tool',
  {
    description: 'Echo back the provided args, but with a different description',
    inputSchema: { additionalProperties: true }
  },
  args => ({
    args,
    options: options ? Object.keys(options) : undefined,
    content: [
      {
        type: 'text',
        text: JSON.stringify(args)
      }
    ]
  })
];

echo_plugin_tool.toolName = 'echo_plugin_tool';

export default echo_plugin_tool;

// Fixture exports a creator function directly;

const echo_plugin_tool = options => [
  'echo_basic_tool',
  {
    description: 'Echo basic tool. Echos back the provided args.',
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

echo_plugin_tool.toolName = 'echo_basic_tool';

export default echo_plugin_tool;

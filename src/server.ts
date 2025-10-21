import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { usePatternFlyDocsTool } from './tool.patternFlyDocs';
import { fetchDocsTool } from './tool.fetchDocs';
import { OPTIONS } from './options';

type McpTool = [string, { description: string; inputSchema: any }, (args: any) => Promise<any>];

type McpToolCreator = () => McpTool;

/**
 * Create, register tool and errors, then run the server.
 *
 * @param options
 * @param settings
 * @param settings.tools
 */
const runServer = async (options = OPTIONS, {
  tools = [
    usePatternFlyDocsTool,
    fetchDocsTool
  ]
}: { tools?: McpToolCreator[] } = {}): Promise<void> => {
  try {
    const server = new McpServer(
      {
        name: options.name,
        version: options.version
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    tools.forEach(toolCreator => {
      const [name, schema, callback] = toolCreator();

      console.info(`Registered tool: ${name}`);
      server.registerTool(name, schema, callback);
    });

    process.on('SIGINT', async () => {
      await server?.close();
      process.exit(0);
    });

    const transport = new StdioServerTransport();

    await server.connect(transport);
    console.log('PatternFly MCP server running on stdio');
  } catch (error) {
    console.error('Error creating MCP server:', error);
    throw error;
  }
};

export {
  runServer,
  type McpTool,
  type McpToolCreator
};

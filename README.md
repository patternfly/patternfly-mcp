# PatternFly MCP Server

A Model Context Protocol (MCP) server that provides access to PatternFly React development rules and documentation, built with Node.js and TypeScript.

## What is MCP?

The Model Context Protocol (MCP) is an open standard that enables AI assistants to securely access external data sources and tools. This server provides a standardized way to expose PatternFly documentation and development rules to MCP-compatible clients.

## Prerequisites

- Node.js 20.0.0 or higher
  - **Note**: Loading **Tool Plugins** from an external file or package requires Node.js >= 22 at runtime. On Node < 22, the server starts with built‑in tools only and logs a one‑time warning.
- NPM (or another Node package manager)

## Installation

### Local development

1) Install dependencies:

```bash
npm install
```

2) Build the project:

```bash
npm run build
```

3) Run in watch/dev mode (TypeScript via tsx):

```bash
npm run start:dev
```

### Use via npx (after publishing)

```bash
npx @patternfly/patternfly-mcp
```

Or install locally in a project and run:

```bash
npm install @patternfly/patternfly-mcp
npx @patternfly/patternfly-mcp
```

## Usage

The MCP server can communicate over **stdio** (default) or **HTTP** transport. It provides access to PatternFly documentation through built-in tools.

### Built-in Tools

All tools accept an argument named `urlList` (array of strings) or `componentName` (string).

#### Tool: usePatternFlyDocs
Use this to fetch high-level index content (for example, a local `README.md` that contains relevant links, or `llms.txt` files in docs-host mode). From that content, you can select specific URLs to pass to `fetchDocs`.

- **Parameters**: `urlList`: `string[]` (required)

#### Tool: fetchDocs
Use this to fetch one or more specific documentation pages (e.g., concrete design guidelines or accessibility pages) after you’ve identified them via `usePatternFlyDocs`.

- **Parameters**: `urlList`: `string[]` (required)

#### Tool: componentSchemas
Use this to fetch the JSON Schema for a specific PatternFly component.

- **Parameters**: `componentName`: `string` (required)

### Docs-host mode (local llms.txt mode)

If you run the server with `--docs-host`, local paths you pass in `urlList` are resolved relative to the `llms-files` folder at the repository root. This is useful when you have pre-curated `llms.txt` files locally.

Example:
```bash
npx @patternfly/patternfly-mcp --docs-host
```

Then, passing a local path such as `react-core/6.0.0/llms.txt` in `urlList` will load from `llms-files/react-core/6.0.0/llms.txt`.

### MCP Client Configuration

Most MCP clients use a JSON configuration to specify how to start this server. Below are examples you can adapt to your MCP client.

#### Minimal client config (npx)
```json
{
  "mcpServers": {
    "patternfly-docs": {
      "command": "npx",
      "args": ["-y", "@patternfly/patternfly-mcp@latest"],
      "description": "PatternFly React development rules and documentation"
    }
  }
}
```

#### HTTP transport mode
```json
{
  "mcpServers": {
    "patternfly-docs": {
      "command": "npx",
      "args": ["-y", "@patternfly/patternfly-mcp@latest", "--http", "--port", "8080"],
      "description": "PatternFly docs (HTTP transport)"
    }
  }
}
```

#### Docs-host mode
```json
{
  "mcpServers": {
    "patternfly-docs": {
      "command": "npx",
      "args": ["-y", "@patternfly/patternfly-mcp@latest", "--docs-host"],
      "description": "PatternFly docs (docs-host mode)"
    }
  }
}
```

#### Custom local tool

```json
{
  "mcpServers": {
    "patternfly-docs": {
      "command": "npx",
      "args": [
        "-y",
        "@patternfly/patternfly-mcp@latest",
        "--tool",
        "./mcp-tools/local-custom-tool.js"
      ],
      "description": "PatternFly MCP with a local custom tool"
    }
  }
}
```

## Features

### HTTP Transport

By default, the server uses stdio. Use the `--http` flag to enable HTTP transport.

#### Options
- `--http`: Enable HTTP transport mode.
- `--port <number>`: Port to listen on (default: 8080).
- `--host <string>`: Host to bind to (default: 127.0.0.1).
- `--allowed-origins <origins>`: Comma-separated list of allowed CORS origins.
- `--allowed-hosts <hosts>`: Comma-separated list of allowed host headers.

#### DNS Rebinding Protection
This server enables DNS rebinding protection by default when running in HTTP mode. If you're behind a proxy or load balancer, ensure the client sends a correct `Host` header and configure `--allowed-hosts` accordingly.

### Logging

The server uses a `diagnostics_channel`–based logger that keeps STDIO stdout pure by default. No terminal output occurs unless you enable a sink.

- `--log-stderr`: Enable terminal logging.
- `--log-protocol`: Forward logs to MCP clients (requires advertising `capabilities.logging`).
- `--log-level <level>`: Set log level (`debug`, `info`, `warn`, `error`). Default: `info`.
- `--verbose`: Shortcut for `debug` level.

Example:
```bash
npx @patternfly/patternfly-mcp --log-stderr --log-level debug
```

### MCP Tool Plugins

You can extend the server's capabilities by loading **Tool Plugins** at startup. These plugins run out‑of‑process in an isolated **Tools Host** (Node.js >= 22) to ensure security and stability.

#### CLI Usage
- `--tool <path|package>`: Load one or more plugins. You can provide a path to a local file or the name of an installed NPM package.
  - *Examples*: `--tool @acme/my-plugin`, `--tool ./local-plugins/weather-tool.js`, `--tool ./a.js,./b.js`
- `--plugin-isolation <none|strict>`: Tools Host permission preset.
  - **Default**: `strict`. In strict mode, network and filesystem write access are denied; fs reads are allow‑listed to your project and resolved plugin directories.

#### Behavior and Limitations
- **Node version gate**: Node < 22 skips loading plugins from external sources with a warning; built‑ins still register.
- **Supported inputs**: ESM packages (installed in `node_modules`) and local ESM files with default exports.
- **Not supported**: Raw TypeScript sources (`.ts`) or remote `http(s):` URLs.

#### Troubleshooting
- If tool plugins don't appear, verify the Node version and check logs (enable `--log-stderr`).
- Startup `load:ack` warnings/errors from tool plugins are logged when stderr/protocol logging is enabled.
- If `tools/call` rejects with schema errors, ensure `inputSchema` is valid. See [Authoring Tools](#authoring-tools) for details.
- If the tool is having network access issues, you may need to configure `--plugin-isolation none`. This is generally discouraged for security reasons but may be necessary in some cases.

#### Terminology
- **`Tool`**: The low-level tuple format `[name, schema, handler]`.
- **`Tool Config`**: The authoring object format `{ name, description, inputSchema, handler }`.
- **`Tool Factory`**: A function wrapper `(options) => Tool` (internal).
- **`Tool Module`**: The programmatic result of `createMcpTool`, representing a collection of tools.

#### Authoring Tools

We recommend using the `createMcpTool` helper to define tools. It ensures your tools are properly normalized for the server.

##### Authoring a single Tool Module
```ts
import { createMcpTool } from '@patternfly/patternfly-mcp';

export default createMcpTool({
  name: 'hello',
  description: 'Say hello',
  inputSchema: {
    type: 'object',
    properties: { name: { type: 'string' } },
    required: ['name']
  },
  async handler({ name }) {
    return `Hello, ${name}!`;
  }
});
```

##### Authoring multiple tools in one module
```ts
import { createMcpTool } from '@patternfly/patternfly-mcp';

export default createMcpTool([
  { name: 'hi', description: 'Greets', inputSchema: {}, handler: () => 'hi' },
  { name: 'bye', description: 'Farewell', inputSchema: {}, handler: () => 'bye' }
]);
```

##### Input Schema Format
The `inputSchema` property accepts either **plain JSON Schema objects** or **Zod schemas**. Both formats are automatically converted to the format required by the MCP SDK.

**JSON Schema (recommended):**
```ts
inputSchema: {
  type: 'object',
  properties: {
    name: { type: 'string' },
    age: { type: 'number' }
  },
  required: ['name']
}
```

**Zod Schema:**
```ts
import { z } from 'zod';

inputSchema: {
  name: z.string(),
  age: z.number().optional()
}
```

### Embedding the Server

You can embed the MCP server inside your application using the `start()` function and provide **Tool Modules** directly.

```ts
import { start, createMcpTool, type PfMcpInstance, type ToolModule } from '@patternfly/patternfly-mcp';

const echoTool: ToolModule = createMcpTool({
  name: 'echoAMessage',
  description: 'Echo back the provided user message.',
  inputSchema: {
    type: 'object',
    properties: { message: { type: 'string' } },
    required: ['message']
  },
  handler: async (args: { message: string }) => ({ text: `You said: ${args.message}` })
});

async function main() {
  const server: PfMcpInstance = await start({
    toolModules: [
      echoTool
    ]
  });

  // Optional: observe refined server logs in‑process
  server.onLog((event) => {
    if (event.level !== 'debug') {
      console.warn(`[${event.level}] ${event.msg || ''}`);
    }
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    await server.stop();
    process.exit(0);
  });
}

main();
```

## Development and Maintenance

### Scripts
- `npm run build`: Build the project (cleans dist, type-checks, bundles).
- `npm test`: Run unit tests.
- `npm run test:integration`: Run e2e tests.
- `npm run start:dev`: Run with `tsx` in watch mode.
- `npm run test:lint`: Run ESLint.

### Environment Variables
- `DOC_MCP_FETCH_TIMEOUT_MS`: Milliseconds to wait before aborting an HTTP fetch (default: 15000).

### Inspector-CLI Examples
```bash
npx @modelcontextprotocol/inspector-cli \
  --config ./mcp-config.json \
  --server patternfly-docs \
  --cli \
  --method tools/call \
  --tool-name usePatternFlyDocs \
  --tool-arg urlList='["documentation/guidelines/README.md"]'
```

## Resources
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [PatternFly React](https://www.patternfly.org/)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Node.js Documentation](https://nodejs.org/en/docs/)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)

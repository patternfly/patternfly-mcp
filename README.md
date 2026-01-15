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

The MCP server tools are focused on being a resource library for PatternFly. Server tools are extensible by design and intended to be used in conjunction with the available MCP resources.

### Built-in Tools

#### Tool: searchPatternFlyDocs
Use this to search for PatternFly documentation URLs and component names. Accepts partial string matches or `*` to list all available components. From the content, you can select specific URLs and component names to use with `usePatternFlyDocs`

- **Parameters**: `searchQuery`: `string` (required)

#### Tool: usePatternFlyDocs
Fetch full documentation and component JSON schemas for specific PatternFly URLs or component names.

> **Feature**: This tool automatically detects if a URL belongs to a component (or if a "name" is provided) and appends its machine-readable JSON schema (props, types, validation) to the response, providing a fused context of human-readable docs and technical specs.

- **Parameters**: _Parameters are mutually exclusive. Provide either `name` OR `urlList` not both._
  - `name`: `string` (optional) - The name of the PatternFly component (e.g., "Button", "Modal"). **Recommended** for known component lookups.
  - `urlList`: `string[]` (optional) - A list of specific documentation URLs discovered via `searchPatternFlyDocs`.

#### Removed: ~~Tool: fetchDocs~~
> "fetchDocs" has been integrated into "usePatternFlyDocs."

~~Use this to fetch one or more specific documentation pages (e.g., concrete design guidelines or accessibility pages) after you’ve identified them via `usePatternFlyDocs`.~~

- ~~**Parameters**: `urlList`: `string[]` (required)~~

#### Deprecated: ~~Tool: componentSchemas~~
> "componentSchemas" has been integrated into "usePatternFlyDocs."

~~Use this to fetch the JSON Schema for a specific PatternFly component.~~

- ~~**Parameters**: `componentName`: `string` (required)~~

### Built-in Resources

The server exposes a resource-centric architecture via the `patternfly://` URI scheme:

- **`patternfly://context`**: General PatternFly development context and high-level rules.
- **`patternfly://docs/index`**: Index of all available documentation pages.
- **`patternfly://docs/{name}`**: Documentation for a specific component (e.g., `patternfly://docs/Button`).
- **`patternfly://schemas/index`**: Index of all available component schemas.
- **`patternfly://schemas/{name}`**: JSON Schema for a specific component (e.g., `patternfly://schemas/Button`).

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

### Disabled: ~~Docs-host mode (local llms.txt mode)~~

> Docs-host mode will be removed or replaced in a future release.
> 
> Docs-host mode was intended to be a more efficient way for accessing text file versions of PatternFly documentation and link
> resources. That effort was intended to help load times and token counts while attempting to account for future API work.
> Docs-host mode documentation and links have experienced drift with recent updates to PatternFly resources. That drift combined
> with the introduction of MCP server resources concludes in disabling Docs-host mode while we evaluate its removal or replacement.
>
> If you have been using Docs-host mode, there's a probability you've been leveraging model inference instead of PatternFly
> documentation. You can continue passing the `--docs-host` flag, it will not break the CLI, but it will no-longer affect how the
> PatternFly MCP server loads documentation and link resources.

~~If you run the server with `--docs-host`, local paths you pass in `urlList` are resolved relative to the `llms-files` folder at the repository root. This is useful when you have pre-curated `llms.txt` files locally.~~

- `--docs-host`: Running this flag produces no results. ~~Local paths you pass in `urlList` are resolved relative to the `llms-files` folder.~~

Example:
```bash
npx @patternfly/patternfly-mcp --docs-host
```

~~Then, passing a local path such as `react-core/6.0.0/llms.txt` in `urlList` will load from `llms-files/react-core/6.0.0/llms.txt`.~~

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

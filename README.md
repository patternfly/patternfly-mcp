# PatternFly MCP Server

A Model Context Protocol (MCP) server that provides access to PatternFly React development rules and documentation, built with Node.js and TypeScript.

## What is MCP?

The Model Context Protocol (MCP) is an open standard that enables AI assistants to securely access external data sources and tools. This server provides a standardized way to expose PatternFly documentation and development rules to MCP-compatible clients.

## Features

- **TypeScript**: Full type safety and modern JavaScript features
- **PatternFly Documentation Access**: Browse, search, and retrieve PatternFly development rules
- **Component Schemas**: Access JSON Schema validation for PatternFly React components
- **Comprehensive Rule Coverage**: Access setup, guidelines, components, charts, chatbot, and troubleshooting documentation
- **Smart Search**: Find specific rules and patterns across all documentation
- **Error Handling**: Robust error handling with proper MCP error codes
- **Modern Node.js**: Uses ES modules and the latest Node.js features

## Prerequisites

- Node.js 20.0.0 or higher
  - Note: External tool plugins require Node.js >= 22 at runtime. On Node < 22, the server starts with built‑in tools only and logs a one‑time warning.
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

## Scripts

These are the most relevant NPM scripts from package.json:

- `build`: Build the TypeScript project (cleans dist, type-checks, bundles)
- `build:clean`: Remove dist
- `build:watch`: Build in watch mode
- `start`: Run the built server, CLI (node dist/cli.js)
- `start:dev`: Run with tsx in watch mode (development)
- `test`: Run linting, type-check, and unit tests in src/
- `test:dev`: Jest watch mode for unit tests
- `test:integration`: Build and run integration tests in tests/
- `test:integration-dev`: Watch mode for integration tests
- `test:lint`: Run ESLint (code quality checks)
- `test:lint-fix`: Run ESLint with auto-fix
- `test:types`: TypeScript type-check only (no emit)

## Usage

The MCP server can communicate over **stdio** (default) or **HTTP** transport. It provides access to PatternFly documentation through the following tools. Both tools accept an argument named `urlList` which must be an array of strings. Each string is either:
- An external URL (e.g., a raw GitHub URL to a .md file), or
- A local file path (e.g., documentation/.../README.md). When running with the --docs-host flag, these paths are resolved under the llms-files directory instead.

Returned content format:
- For each entry in urlList, the server loads its content, prefixes it with a header like: `# Documentation from <resolved-path-or-url>` and joins multiple entries using a separator: `\n\n---\n\n`.
- If an entry fails to load, an inline error message is included for that entry.

### External tools (Plugins)

Add external tools at startup. External tools run out‑of‑process in a separate Tools Host (Node >= 22). Built‑in tools are always in‑process and register first.

- Node version gate
  - Node < 22 → external tools are skipped with a single startup warning; built‑ins still register.
  - Node >= 22 → external tools run out‑of‑process via the Tools Host.

- CLI
  - `--tool <plugin>` Add one or more external tools. Repeat the flag or pass a comma‑separated list.
    - Examples: `--tool @acme/my-plugin`, `--tool ./plugins/my-tools.js`, `--tool ./a.js,./b.js`
  - `--plugin-isolation <none|strict>` Tools Host permission preset.
    - Defaults: `strict` when any `--tool` is provided; otherwise `none`.

- Behavior
  - External tools run in a single Tools Host child process.
  - In `strict` isolation (default with externals): network and fs write are denied; fs reads are allow‑listed to your project and resolved plugin directories.

- Supported `--tool` inputs
  - ESM packages (installed in node_modules)
  - Local ESM files (paths are normalized to `file://` URLs internally)

- Not supported as `--tool` inputs
  - Raw TypeScript sources (`.ts`) — the Tools Host does not install a TS loader
  - Remote `http(s):` or `data:` URLs — these will fail to load and appear in startup warnings/errors

- Troubleshooting
  - If external tools don't appear, verify you're running on Node >= 22 (see Node version gate above) and check startup `load:ack` warnings/errors.
  - Startup `load:ack` warnings/errors from plugins are logged when stderr/protocol logging is enabled.
  - If `tools/list` fails or `tools/call` rejects due to argument validation (e.g., messages about `safeParseAsync is not a function`), ensure your `inputSchema` is either a valid JSON Schema object or a Zod schema. Plain JSON Schema objects are automatically converted, but malformed schemas may cause issues. See the [Input Schema Format](#input-schema-format) section for details.

### Embedding the server (Programmatic API)

You can embed the MCP server inside another Node/TypeScript application and register tools programmatically.

Tools as plugins can be
  - Inline creators, or an array/list of inline creators, provided through the convenience wrapper `createMcpTool`, i.e. `createMcpTool({ name: 'echoAMessage', ... })` or `createMcpTool([{ name: 'echoAMessage', ... }])`.
  - Local file paths and local file URLs (Node >= 22 required), i.e. `a string representing a local file path or file URL starting with file://`
  - Local NPM package names (Node >= 22 required), i.e. `a string representing a local NPM package name like @loremIpsum/my-plugin`

> Note: Consuming remote/external files, such as YML, and NPM packages is targeted for the near future.

Supported export shapes for external modules (Node >= 22 only):

- Default export: function returning a realized tool tuple. It is called once with ToolOptions and cached. Example shape: `export default function (opts) { return ['name', { description, inputSchema }, handler] }`
- Default export: function returning an array of creator functions. Example shape: `export default function (opts) { return [() => [...], () => [...]] }`
- Default export: array of creator functions. Example shape: `export default [ () => ['name', {...}, handler] ]`
- Fallback: a named export that is an array of creator functions (only used if default export is not present).

Not supported (Phase A+B):

- Directly exporting a bare tuple as the module default (wrap it in a function instead)
- Plugin objects like `{ createCreators, createTools }`

Performance and determinism note:

- If your default export is a function that returns a tuple, we invoke it once during load with a minimal ToolOptions object and cache the result. Use a creators‑factory (a function returning an array of creators) if you need per‑realization variability by options.

External module examples (Node >= 22):

Function returning a tuple (called once with options):

```js
// plugins/echo.js
export default function createEchoTool(opts) {
  return [
    'echo_plugin_tool',
    { description: 'Echo', inputSchema: { additionalProperties: true } },
    async (args) => ({ content: [{ type: 'text', text: JSON.stringify({ args, opts }) }] })
  ];
}
```

Function returning multiple creators:

```js
// plugins/multi.js
const t1 = () => ['one', { description: 'One', inputSchema: {} }, async () => ({})];
const t2 = () => ['two', { description: 'Two', inputSchema: {} }, async () => ({})];

export default function creators(opts) {
  // You can use opts to conditionally include creators
  return [t1, t2];
}
```

Array of creators directly:

```js
// plugins/direct-array.js
export default [
  () => ['hello', { description: 'Hello', inputSchema: {} }, async () => ({})]
];
```

#### Example
```typescript
// app.ts
import { start, createMcpTool, type PfMcpInstance, type PfMcpLogEvent, type ToolCreator } from '@patternfly/patternfly-mcp';

// Define a simple inline MCP tool. `createMcpTool` is a convenience wrapper to help you start writing a MCP tool.
const echoTool: ToolCreator = createMcpTool({
  // The unique name of the tool, used in the `tools/list` response, related to the MCP client.
  // A MCP client can help Models use this, so make it informative and clear.
  name: 'echoAMessage',
  
  // A short description of the tool, used in the `tools/list` response, related to the MCP client.
  // A MCP client can help Models can use this, so make it informative and clear.
  description: 'Echo back the provided user message.',
  
  // The input schema defines the shape of interacting with your handler, related to the Model.
  // In this scenario the `args` object has a `string` `message` property intended to be passed back
  // towards the tool `handler` when the Model calls it.
  inputSchema: {
    type: 'object', // Type of the input schema, in this case the object
    properties: { message: { type: 'string' } }, // The properties, with types, to pass back to the handler
    required: ['message'] // Required properties, in this case `message`
  },

  // The handler, async or sync. The Model calls the handler per the client and inputSchema and inputs the
  // `message`. The handler parses the `message` and returns it. The Model receives the parsed `message`
  // and uses it.
  handler: async (args: { message: string }) => ({ text: `You said: ${args.message}` })
});

async function main() {
  // Start the server.
  const server: PfMcpInstance = await start({
    // Add one or more in‑process tools directly. Default tools will be registered first.
    toolModules: [
      // You can pass:
      //  - a string module (package or file) for external plugins (Tools Host, Node ≥ 22), or
      //  - a creator function returned by createMcpTool(...) for in‑process tools.
      echoTool
    ]
    // Optional: enable all logging through stderr and/or protocol.
    // logging: { level: 'info', stderr: true },
  });

  // Optional: observe refined server logs in‑process
  server.onLog((event: PfMcpLogEvent) => {
    // A good habit to get into is avoiding `console.log` and `console.info` in production paths, they pollute stdio
    // communication and can create noise. Use `console.error`, `console.warn`, or `process.stderr.write` instead.
    if (event.level !== 'debug') {
      // process.stderr.write(`[${event.level}] ${event.msg || ''}\n`);
      // console.error(`[${event.level}] ${event.msg || ''}`);
      console.warn(`[${event.level}] ${event.msg || ''}`);
    }
  });

  // Stop the server after 10 seconds.
  setTimeout(async () => server.stop(), 10000);
}

// Run the program.
main().catch((err) => {
  // In programmatic mode, unhandled errors throw unless allowProcessExit=true
  console.error(err);
  process.exit(1);
});
```

#### Development notes
- Built‑in tools are always registered first.
- Consuming the MCP server comes with a not-so-obvious limitation, avoiding `console.log` and `console.info`.
  - In `stdio` server run mode `console.log` and `console.info` can create unnecessary noise between server and client, and potentially the Model. Instead, use `console.error`, `console.warn`, or `process.stderr.write`.
  - In `http` server run mode `console.log` and `console.info` can be used, but it's still recommended you get in the habit of avoiding their use.

### Authoring external tools with `createMcpTool`

Export an ESM module using `createMcpTool`. The server adapts single or multiple tool definitions automatically.

Single tool:

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

Multiple tools:

```ts
import { createMcpTool } from '@patternfly/patternfly-mcp';

export default createMcpTool([
  { name: 'hi', description: 'Greets', inputSchema: { type: 'object' }, handler: () => 'hi' },
  { name: 'bye', description: 'Farewell', inputSchema: { type: 'object' }, handler: () => 'bye' }
]);
```

Named group:

```ts
import { createMcpTool } from '@patternfly/patternfly-mcp';

export default createMcpTool({
  name: 'my-plugin',
  tools: [
    { name: 'alpha', description: 'A', inputSchema: { type: 'object' }, handler: () => 'A' },
    { name: 'beta', description: 'B', inputSchema: { type: 'object' }, handler: () => 'B' }
  ]
});
```

Notes
- External tools must be ESM modules (packages or ESM files). The Tools Host imports your module via `import()`.
- The `handler` receives `args` per your `inputSchema`. A reserved `options?` parameter may be added in a future release; it is not currently passed.

### Input Schema Format

The `inputSchema` property accepts either **plain JSON Schema objects** or **Zod schemas**. Both formats are automatically converted to the format required by the MCP SDK.

**JSON Schema (recommended for simplicity):**
```
inputSchema: {
  type: 'object',
  properties: {
    name: { type: 'string' },
    age: { type: 'number' }
  },
  required: ['name']
}
```

**Zod Schema (for advanced validation):**
```
import { z } from 'zod';

inputSchema: {
  name: z.string(),
  age: z.number().optional()
}
```

**Important:** The MCP SDK expects Zod-compatible schemas internally. Plain JSON Schema objects are automatically converted to equivalent Zod schemas when tools are registered. This conversion handles common cases like:
- `{ type: 'object', additionalProperties: true }` → `z.object({}).passthrough()`
- Simple object schemas → `z.object({...})`

If you encounter validation errors, ensure your JSON Schema follows standard JSON Schema format, or use Zod schemas directly for more control.

## Logging

The server uses a `diagnostics_channel`–based logger that keeps STDIO stdout pure by default. No terminal output occurs unless you enable a sink.

- Defaults: `level='info'`, `stderr=false`, `protocol=false`
- Sinks (opt‑in): `--log-stderr`, `--log-protocol` (forwards to MCP clients; requires advertising `capabilities.logging`)
- Transport tag: `transport: 'stdio' | 'http'` (no I/O side effects)
- Environment variables: not used for logging in this version
- Process scope: logger is process‑global; recommend one server per process

CLI examples:

```bash
patternfly-mcp                   # default (no terminal output)
patternfly-mcp --verbose         # level=debug (still no stderr)
patternfly-mcp --log-stderr      # enable stderr sink
patternfly-mcp --log-level warn --log-stderr
patternfly-mcp --log-protocol --log-level info  # forward logs to MCP clients
```

Programmatic:

```ts
await start({ logging: { level: 'info', stderr: false, protocol: false } });
```

### Tool: usePatternFlyDocs

Use this to fetch high-level index content (for example, a local README.md that contains relevant links, or llms.txt files in docs-host mode). From that content, you can select specific URLs to pass to fetchDocs.

Parameters:
- `urlList`: string[] (required)

Response (tools/call):
- content[0].type = "text"
- content[0].text = concatenated documentation content (one or more sources)

### Tool: fetchDocs

Use this to fetch one or more specific documentation pages (e.g., concrete design guidelines or accessibility pages) after you’ve identified them via usePatternFlyDocs.

Parameters:
- `urlList`: string[] (required)

Response (tools/call):
- content[0].type = "text"
- content[0].text = concatenated documentation content (one or more sources)

## Docs-host mode (local llms.txt mode)

If you run the server with --docs-host, local paths you pass in urlList are resolved relative to the llms-files folder at the repository root. This is useful when you have pre-curated llms.txt files locally.

Example:

```bash
npx @patternfly/patternfly-mcp --docs-host
```

Then, passing a local path such as react-core/6.0.0/llms.txt in urlList will load from llms-files/react-core/6.0.0/llms.txt.

## HTTP transport mode

By default, the server communicates over stdio. To run the server over HTTP instead, use the `--http` flag. This enables the server to accept HTTP requests on a specified port and host.

### Basic HTTP usage

```bash
npx @patternfly/patternfly-mcp --http
```

This starts the server on `http://127.0.0.1:8080` (default port and host).

### HTTP options

- `--http`: Enable HTTP transport mode (default: stdio)
- `--port <number>`: Port number to listen on (default: 8080)
- `--host <string>`: Host address to bind to (default: 127.0.0.1)
- `--allowed-origins <origins>`: Comma-separated list of allowed CORS origins
- `--allowed-hosts <hosts>`: Comma-separated list of allowed host headers

#### Security note: DNS rebinding protection (default)

This server enables DNS rebinding protection by default when running in HTTP mode. If you're behind a proxy or load balancer, ensure the client sends a correct `Host` header and configure `--allowed-hosts` accordingly. Otherwise, requests may be rejected by design. For example:

```bash
npx @patternfly/patternfly-mcp --http \
  --host 0.0.0.0 --port 8080 \
  --allowed-hosts "localhost,127.0.0.1,example.com"
```

If your client runs on a different origin, also set `--allowed-origins` to allow CORS. Example:

```bash
npx @patternfly/patternfly-mcp --http \
  --allowed-origins "http://localhost:5173,https://app.example.com"
```

### Examples

Start on a custom port:
```bash
npx @patternfly/patternfly-mcp --http --port 8080
```

Start on a specific host:
```bash
npx @patternfly/patternfly-mcp --http --host 0.0.0.0 --port 8080
```

Start with CORS allowed origins:
```bash
npx @patternfly/patternfly-mcp --http --allowed-origins "http://localhost:3001,https://example.com"
```

### Port conflict handling

If the specified port is already in use, the server will:
- Display a helpful error message with the process ID (if available)
- Suggest using a different port with `--port` or stopping the process using the port

**Note**: The server uses memoization to prevent duplicate server instances within the same process. If you need to restart the server, simply stop the existing instance and start a new one.

## MCP client configuration examples

Most MCP clients use a JSON configuration to specify how to start this server. The server itself only reads CLI flags and environment variables, not the JSON configuration. Below are examples you can adapt to your MCP client.

### Minimal client config (npx)

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

### Docs-host mode

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

### Local development (after build)

```json
{
  "mcpServers": {
    "patternfly-docs": {
      "command": "node",
      "args": ["dist/cli.js"],
      "cwd": "/path/to/patternfly-mcp",
      "description": "PatternFly docs (local build)"
    }
  }
}
```

### HTTP transport mode

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

### HTTP transport with custom options

```json
{
  "mcpServers": {
    "patternfly-docs": {
      "command": "npx",
      "args": [
        "-y",
        "@patternfly/patternfly-mcp@latest",
        "--http",
        "--port", "8080",
        "--host", "0.0.0.0",
        "--allowed-origins", "http://localhost:3001,https://example.com"
      ],
      "description": "PatternFly docs (HTTP transport, custom port/host/CORS)"
    }
  }
}
```

## Inspector-CLI examples (tools/call)

Note: The parameter name is urlList and it must be a JSON array of strings.

usePatternFlyDocs (example with a local README):

```bash
npx @modelcontextprotocol/inspector-cli \
  --config ./mcp-config.json \
  --server patternfly-docs \
  --cli \
  --method tools/call \
  --tool-name usePatternFlyDocs \
  --tool-arg urlList='["documentation/guidelines/README.md"]'
```

fetchDocs (example with external URLs):

```bash
npx @modelcontextprotocol/inspector-cli \
  --config ./mcp-config.json \
  --server patternfly-docs \
  --cli \
  --method tools/call \
  --tool-name fetchDocs \
  --tool-arg urlList='[
    "https://raw.githubusercontent.com/patternfly/patternfly-org/refs/heads/main/packages/documentation-site/patternfly-docs/content/design-guidelines/components/about-modal/about-modal.md",
    "https://raw.githubusercontent.com/patternfly/patternfly-org/refs/heads/main/packages/documentation-site/patternfly-docs/content/accessibility/components/about-modal/about-modal.md"
  ]'
```

componentSchemas (get component JSON Schema):

```bash
npx @modelcontextprotocol/inspector-cli \
  --config ./mcp-config.json \
  --server patternfly-docs \
  --cli \
  --method tools/call \
  --tool-name componentSchemas \
  --tool-arg componentName='Button'
```

## Environment variables

- DOC_MCP_FETCH_TIMEOUT_MS: Milliseconds to wait before aborting an HTTP fetch (default: 15000)

## External tools (plugins)

You can load external MCP tool modules at runtime using a single CLI flag or via programmatic options. Modules must be ESM-importable (absolute/relative path or package).

CLI examples (single `--tool` flag):

```bash
# Single module
npm run start:dev -- --tool ./dist/my-tool.js

# Multiple modules (repeatable)
npm run start:dev -- --tool ./dist/t1.js --tool ./dist/t2.js

# Multiple modules (comma-separated)
npm run start:dev -- --tool ./dist/t1.js,./dist/t2.js
```

Programmatic usage:

```ts
import { main } from '@patternfly/patternfly-mcp';

await main({
  toolModules: [
    new URL('./dist/t1.js', import.meta.url).toString(),
    './dist/t2.js'
  ]
});
```

Tools provided via `--tool`/`toolModules` are appended after the built-in tools.

### Authoring MCP external tools
> Note: External MCP tools require using `Node >= 22` to run the server and ESM modules. TypeScript formatted tools are not directly supported.
> If you do use TypeScript, you can use the `createMcpTool` helper to define your tools as pure ESM modules.

For `tools-as-plugin` authors, we recommend using the unified helper to define your tools as pure ESM modules:

```ts
import { createMcpTool } from '@patternfly/patternfly-mcp';

export default createMcpTool({
  name: 'hello',
  description: 'Say hello',
  inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
  async handler({ name }) {
    return { content: `Hello, ${name}!` };
  }
});
```

Multiple tools in one module:

```ts
import { createMcpTool } from '@patternfly/patternfly-mcp';

export default createMcpTool([
  { name: 'hello', description: 'Hi', inputSchema: {}, handler: () => 'hi' },
  { name: 'bye', description: 'Bye', inputSchema: {}, handler: () => 'bye' }
]);
```

## Programmatic usage (advanced)

The package provides programmatic access through the `start()` function:

```typescript
import { start, main, type CliOptions, type ServerInstance } from '@patternfly/patternfly-mcp';

// Use with default options (equivalent to CLI without flags)
const server = await start();

// Override CLI options programmatically
const serverWithOptions = await start({ docsHost: true });

// Multiple options can be overridden
const customServer = await start({ 
  docsHost: true,
  http: true,
  port: 8080,
  host: '0.0.0.0'
});

// TypeScript users can use the CliOptions type for type safety
const options: Partial<CliOptions> = { docsHost: true };
const typedServer = await start(options);

// Server instance provides shutdown control
console.log('Server running:', server.isRunning()); // true

// Graceful shutdown
await server.stop();
console.log('Server running:', server.isRunning()); // false
```

### ServerInstance Interface

The `start()` function returns a `ServerInstance` object with the following methods:

```typescript
interface ServerInstance {
  /**
   * Stop the server gracefully
   */
  stop(): Promise<void>;

  /**
   * Check if server is running
   */
  isRunning(): boolean;
}
```

**Usage Examples**:
```typescript
const server = await start();

// Check if server is running
if (server.isRunning()) {
  console.log('Server is active');
}

// Graceful shutdown
await server.stop();

// Verify shutdown
console.log('Server running:', server.isRunning()); // false
```

## Returned content details

For each provided path or URL, the server returns a section:
- Header: `# Documentation from <resolved-path-or-url>`
- Body: the raw file content fetched from disk or network
- Sections are concatenated with `\n\n---\n\n`

This makes it easier to see where each chunk of content came from when multiple inputs are provided.

## Publishing

To make this package available via npx, you need to publish it to npm:

1. Ensure you have an npm account and are logged in:
```bash
npm login
```

2. Update the version in package.json if needed:
```bash
npm version patch  # or minor/major
```

3. Publish to npm:
```bash
npm publish
```

After publishing, users can run your MCP server with:
```bash
npx @patternfly/patternfly-mcp
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Resources

- [Model Context Protocol Documentation](https://modelcontextprotocol.io/)
- [MCP SDK Documentation](https://github.com/modelcontextprotocol/typescript-sdk)
- [Node.js Documentation](https://nodejs.org/en/docs/)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/) 

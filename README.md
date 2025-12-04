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
- DOC_MCP_CLEAR_COOLDOWN_MS: Default cooldown value used in internal cache configuration. The current public API does not expose a `clearCache` tool.

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

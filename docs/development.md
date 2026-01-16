# Development usage

Complete guide to using the PatternFly MCP Server for development including CLI and programmatic API usage.

**Development:**
- [CLI Usage](#cli-usage)
- [Programmatic Usage](#programmatic-usage)
- [Tool Plugins](#tool-plugins)
- [Initial Troubleshooting](#initial-troubleshooting)

## CLI Usage

### Available options

| Flag                                  | Description                                           | Default              |
|:--------------------------------------|:------------------------------------------------------|:---------------------|
| `--http`                              | Enable HTTP transport mode                            | `false` (stdio mode) |
| `--port <num>`                        | Port for HTTP transport                               | `8080`               |
| `--host <string>`                     | Host to bind to                                       | `127.0.0.1`          |
| `--allowed-origins <origins>`         | Comma-separated list of allowed CORS origins          | `none`               |
| `--allowed-hosts <hosts>`             | Comma-separated list of allowed host headers          | `none`               |
| `--tool <path>`                       | Path to external Tool Plugin (repeatable)             | `none`               |
| `--plugin-isolation <none \| strict>` | Isolation preset for external tools-as-plugins        | `strict`             |
| `--log-stderr`                        | Enable terminal logging                               | `false`              |
| `--log-protocol`                      | Forward logs to MCP clients                           | `false`              |
| `--log-level <level>`                 | Set log level (`debug`, `info`, `warn`, `error`)      | `info`               |
| `--verbose`                           | Shortcut for `--log-level debug`                      | `false`              |
| `--docs-host`                         | **Disabled**, continued use will not break the server | `false`              |

#### Notes
- **Docs-host mode** - Docs-host mode has been disabled and will be removed in a future release. Its original purpose has been superseded by the move to MCP server resources.
- **HTTP transport mode** - By default, the server uses `stdio`. Use the `--http` flag to enable HTTP transport.
- **Logging** - The server uses a `diagnostics_channel`-based logger that keeps STDIO stdout pure by default.
- **Programmatic API** - The server can also be used programmatically with options. See [Programmatic Usage](#programmatic-usage) for more details.
- **Tool Plugins** - The server can load external tool plugins at startup. See [Tool Plugins](#tool-plugins) for more details. 

### Basic use scenarios

**stdio mode (default):**
```bash
npx @patternfly/patternfly-mcp
```

**HTTP mode:**
```bash
npx @patternfly/patternfly-mcp --http --port 8080
```

**HTTP mode with custom security**:
```bash
npx @patternfly/patternfly-mcp --http --port 3000 --allowed-origins "https://app.com"
```

**Loading external tool plugins**:
```bash
npx @patternfly/patternfly-mcp --tool ./first-tool.js --tool ./second-tool.ts
```

### Testing with MCP Inspector

The `@modelcontextprotocol/inspector` is the recommended way to visualize the server's interface.

1. **Start the Inspector**:
   ```bash
   npx -y @modelcontextprotocol/inspector npx @patternfly/patternfly-mcp
   ```
2. **Interact**: The inspector opens a web interface (typically at `http://localhost:5173`) where you can list tools, execute them, and view resource contents.

**Example with repository context:**
```bash
npx @modelcontextprotocol/inspector-cli \
  --config ./mcp-config.json \
  --server patternfly-docs \
  --cli \
  --method tools/call \
  --tool-name usePatternFlyDocs \
  --tool-arg urlList='["documentation/guidelines/README.md"]'
```

## Programmatic usage

### Server configuration options

The `start()` function accepts an optional `PfMcpOptions` object for programmatic configuration. Use these options to customize behavior, transport, and logging for embedded instances.

| Option                | Type                                     | Description                                                           | Default            |
|:----------------------|:-----------------------------------------|:----------------------------------------------------------------------|:-------------------|
| `toolModules`         | `ToolModule \| ToolModule[]`             | Array of tool modules or paths to external tool plugins to be loaded. | `[]`               |
| `isHttp`              | `boolean`                                | Enable HTTP transport mode.                                           | `false`            |
| `http.port`           | `number`                                 | Port for HTTP transport.                                              | `8080`             |
| `http.host`           | `string`                                 | Host to bind to.                                                      | `127.0.0.1`        |
| `http.allowedOrigins` | `string[]`                               | List of allowed CORS origins.                                         | `[]`               |
| `http.allowedHosts`   | `string[]`                               | List of allowed host headers.                                         | `[]`               |
| `pluginIsolation`     | `'none' \| 'strict'`                     | Isolation preset for external tools-as-plugins.                       | `'strict'`         |
| `logging.level`       | `'debug' \| 'info' \| 'warn' \| 'error'` | Set the logging level.                                                | `'info'`           |
| `logging.stderr`      | `boolean`                                | Enable terminal logging to stderr.                                    | `false`            |
| `logging.protocol`    | `boolean`                                | Forward logs to MCP clients.                                          | `false`            |
| `mode`                | `'cli' \| 'programmatic' \| 'test'`      | Specifies the operation mode.                                         | `'programmatic'`   |
| `docsPath`            | `string`                                 | Path to the documentation directory.                                  | (Internal default) |

#### Example usage

```typescript
import { start, type PfMcpInstance, type PfMcpOptions } from '@patternfly/patternfly-mcp';

const options: PfMcpOptions = {
  isHttp: true,
  http: {
    port: 3000,
    allowedOrigins: ['https://your-app.com']
  },
  logging: {
    level: 'debug',
    stderr: true
  }
};

const server: PfMcpInstance = await start(options);
```

### Server instance

The server instance exposes the following methods:

- `isRunning()` - Returns a `boolean`, `true` if the server is running.
- `onLog(callback)` - Registers a callback for server logs, returns a `PfMcpLogEvent` object.
- `stop()` - Stops the server.
- `getStats()` - Returns a `PfMcpStats` object containing server metrics and diagnostic channel IDs.

#### server.isRunning()

Checks if the server is running, returns a `boolean`, `true` if the server is running.

```typescript
import { start, type PfMcpInstance } from '@patternfly/patternfly-mcp';

const server: PfMcpInstance = await start({ /* options */ });

if (server.isRunning()) {
  // Server is running
}
```

#### server.onLog(callback)

Registers a callback for server logs. The callback receives a `PfMcpLogEvent` object.

```typescript
import { start, type PfMcpInstance, type PfMcpLogEvent } from '@patternfly/patternfly-mcp';

const server: PfMcpInstance = await start({ /* options */ });

server.onLog((event: PfMcpLogEvent) => {
  if (event.level !== 'debug') {
    console.warn(`[${event.level}] ${event.msg || ''}`);
  }
});
```

#### server.stop()

Stops the server.

```typescript
import { start, type PfMcpInstance } from '@patternfly/patternfly-mcp';

const server: PfMcpInstance = await start({ /* options */ });

process.on('SIGINT', async () => {
  await server.stop();
  process.exit(0);
});
```

#### server.getStats()

Returns a `PfMcpStats` object containing server metrics, includes diagnostic channel IDs for listening to server activity.

```typescript
import { channel, unsubscribe, subscribe } from 'node:diagnostics_channel';
import { start, type PfMcpInstance, type PfMcpStats, type PfMcpStatReport } from '@patternfly/patternfly-mcp';

const server: PfMcpInstance = await start({ /* options */ });
const stats: PfMcpStats = server.getStats();

const logChannel = channel(stats.health.channelId);
const logHandler = (event: PfMcpStatReport) => {
  /* Handle log events, on MCP server close unsubscribe */
};

const logSubscription = subscribe(logChannel, logHandler);

```

### Typing reference

Reference typings are exported from the package. The full listing can be found in [src/index.ts](/src/index.ts).

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
  handler: async (args: { message: string }) => ({
    content: [{ type: 'text', text: `You said: ${args.message}` }]
  })
});

const main = async () => {
  const server: PfMcpInstance = await start({
    toolModules: [
      echoTool
    ]
  });

  // Optional: observe refined server logs in‑process.
  // We recommend getting in the habit of avoiding use of console.log and info, they pollute STDOUT.
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

See [examples/](examples/) for more programmatic usage examples.

## MCP Tool Plugins

You can extend the server's capabilities by loading **Tool Plugins** at startup. These plugins run out‑of‑process in an isolated **Tools Host** to ensure security and stability.

### Environmental Requirements

- **Node.js >= 22**: Loading external tool plugins (`--tool`) requires Node.js version 22 or higher due to the use of advanced process isolation and ESM module loading features.
- **ESM**: Plugins MUST be authored as ECMAScript Modules.
- **Dependency Resolution**: Plugins importing from `@patternfly/patternfly-mcp` require the package to be resolvable in the execution environment. This may require a local `npm install` in the plugin's directory or project root if the package is not available globally.

### Security & Isolation

The server provides two isolation modes for external plugins via the `--plugin-isolation` flag:

- **`strict` (Default)**: The plugin runs in a restricted environment with limited access to the system. This is the recommended mode for most tools.
- **`none`**: The plugin has full access to the system environment, including the filesystem and network, inherited from the host process. Use this mode ONLY if your tool requires specific system access (e.g., executing Git commands or accessing local files outside the sandbox) and you trust the plugin code.

> **Warning**: Disabling isolation (`--plugin-isolation none`) increases the security risk. Always document the reason for requiring this mode in your tool's documentation.

### Terminology

- **`Tool`**: The low-level tuple format `[name, schema, handler]`.
- **`Tool Config`**: The authoring object format `{ name, description, inputSchema, handler }`.
- **`Tool Factory`**: A function wrapper `(options) => Tool` (internal).
- **`Tool Module`**: The programmatic result of `createMcpTool`, representing a collection of tools.

### Authoring Tools

We recommend using the `createMcpTool` helper to define tools. It ensures your tools are properly normalized for the server.

#### Authoring a single Tool Module

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
    return {
      content: [{ type: 'text', text: `Hello, ${name}!` }]
    };
  }
});
```

#### Authoring multiple tools in one module

```ts
import { createMcpTool } from '@patternfly/patternfly-mcp';

export default createMcpTool([
  { name: 'hi', description: 'Greets', inputSchema: {}, handler: () => ({ content: [{ type: 'text', text: 'hi' }] }) },
  { name: 'bye', description: 'Farewell', inputSchema: {}, handler: () => ({ content: [{ type: 'text', text: 'bye' }] }) }
]);
```

#### Input Schema Format

The `inputSchema` property accepts either **plain JSON Schema objects** or **Zod schemas**. Both formats are automatically converted to the format required by the MCP SDK.

**JSON Schema (recommended):**
```ts
const inputSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    age: { type: 'number' }
  },
  required: ['name']
};
```

**Zod Schema:**
```ts
import { z } from 'zod';

const inputSchema = z.object({
  name: z.string(),
  age: z.number().optional()
});
```

See [examples/toolPluginHelloWorld.js](examples/toolPluginHelloWorld.js) for a basic example.

## Initial Troubleshooting

### Tool Plugins

- **Plugins don't appear**: Verify the Node version (requires Node.js >= 20; >= 22 for tool plugins) and check logs (enable `--log-stderr`).
- **Startup warnings/errors**: Startup `load:ack` warnings/errors from tool plugins are logged when stderr/protocol logging is enabled.
- **Schema errors**: If `tools/call` rejects with schema errors, ensure `inputSchema` is valid. See [Authoring Tools](#authoring-tools) for details.
- **Network access issues**: If the tool is having network access issues, you may need to configure `--plugin-isolation none`. This is generally discouraged for security reasons but may be necessary in some cases.

### HTTP Transport

- **Connection issues**: Ensure the port is not already in use and the host is correct.
- **CORS errors**: Configure `--allowed-origins` if accessing from a web client.
- **DNS rebinding protection**: If behind a proxy, ensure correct `Host` header and configure `--allowed-hosts`.

### General Issues

- **Server won't start**: Check Node.js version (requires Node.js >= 20; >= 22 for tool plugins).
- **Missing tools/resources**: Verify the server started successfully and check logs with `--log-stderr`.
- **Type errors**: Ensure TypeScript types are installed: `npm install --save-dev @types/node`


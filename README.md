# PatternFly MCP Server

A Model Context Protocol (MCP) server that provides access to PatternFly rules and documentation, built with Node.js.

The PatternFly MCP server is a comprehensive library resource for PatternFly.
It is intended to be extensible to meet the needs of different teams and projects, from simple to complex, from design to development. 
[Read more about our roadmap and how we've structured the server in our architecture docs](./docs/architecture.md).

## Requirements
- [Node.js 20+](https://nodejs.org/)
- NPM (or equivalent package manager)

## Quick Start

The PatternFly MCP Server supports multiple configurations; see the [usage documentation](./docs/usage.md#mcp-client-configuration) for details.

### For integrated use with an IDE

#### Set a basic MCP configuration

Minimal configuration
```json
{
  "mcpServers": {
    "patternfly-docs": {
      "command": "npx",
      "args": ["-y", "@patternfly/patternfly-mcp@latest"],
      "description": "PatternFly rules and documentation"
    }
  }
}
```

HTTP transport mode
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

[See the MCP Server Configuration documentation for more examples.](./docs/usage.md#mcp-client-configuration)

### For development, advanced usage

#### Run the server directly
Run the server immediately via `npx`:

```bash
npx -y @patternfly/patternfly-mcp
```

Or with options

```bash
npx -y @patternfly/patternfly-mcp --log-stderr --verbose
```

#### Inspect the server
Visualize and test the MCP interface:

```bash
npx -y @modelcontextprotocol/inspector npx @patternfly/patternfly-mcp
```


#### Embed the server in your application

```typescript
import { start } from '@patternfly/patternfly-mcp';

// Remember to avoid using console.log and info, they pollute STDOUT
async function main() {
  const server = await start();

  // Graceful shutdown
  process.on('SIGINT', async () => {
    await server.stop();
    process.exit(0);
  });
}

main();
```

[See the development documentation for additional examples, CLI and embedded server options.](./docs/development.md)

## Documentation

For comprehensive usage, development, and project state [read the docs](./docs/README.md).

## Contributing

Contributing? Guidelines can be found here [CONTRIBUTING.md](./CONTRIBUTING.md).

### AI agent

If you're using an AI assistant to help with development in this repository, please prompt it to `review the repo guidelines` to ensure adherence to project conventions.

Guidelines for developer-agent interaction can be found in [CONTRIBUTING.md](./CONTRIBUTING.md#ai-agent).

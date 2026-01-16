# Usage guide

A comprehensive guide to PatternFly MCP Server tools, resources, and configuration.

**User Guide:**
- [Built-in Tools](#built-in-tools)
- [Built-in Resources](#built-in-resources)
- [MCP Client Configuration](#mcp-client-configuration)
- [Custom MCP Tool Plugins](#custom-mcp-tool-plugins)

## Built-in tools

> MCP tools represent the actions available to interact with the server.

Core server tools provide a resource library for PatternFly. They are extensible by design and intended for use with available MCP resources.

### Tool: searchPatternFlyDocs

Use this to search for PatternFly documentation URLs and component names. Accepts partial string matches or `*` to list all available components. From the content, you can select specific URLs and component names to use with `usePatternFlyDocs`.

**Parameters:**
- `searchQuery`: `string` (required) - Full or partial component name to search for (e.g., "button", "table", "*" for all components)

**Example:**
```json
{
  "searchQuery": "button"
}
```

### Tool: usePatternFlyDocs

Fetch full documentation and component JSON schemas for specific PatternFly URLs or component names.

> **Feature**: This tool automatically detects if a URL belongs to a component (or if a "name" is provided) and appends its machine-readable JSON schema (props, types, validation) to the response, combining human-readable documentation with technical specifications.

**Parameters:** _Parameters are mutually exclusive. Provide either `name` OR `urlList`, not both._
- `name`: `string` (optional) - The name of the PatternFly component (e.g., "Button", "Modal"). **Recommended** for known component lookups.
- `urlList`: `string[]` (optional) - A list of specific documentation URLs discovered via `searchPatternFlyDocs` (max 15 at a time).

**Example with name:**
```json
{
  "name": "Button"
}
```

**Example with urlList:**
```json
{
  "urlList": ["https://patternfly.org/components/button"]
}
```

### Deprecated tools

#### ~~Tool: fetchDocs~~ (Removed)
> "fetchDocs" has been integrated into "usePatternFlyDocs."

#### ~~Tool: componentSchemas~~ (Deprecated)
> "componentSchemas" has been integrated into "usePatternFlyDocs."

## Built-in resources

> MCP resources represent indexed collections of documentation.

The server exposes this resource-centric architecture via the `patternfly://` URI scheme:

- **`patternfly://context`**: General PatternFly MCP server context and high-level rules.
- **`patternfly://docs/index`**: Index of all available documentation pages.
- **`patternfly://docs/{name}`**: Documentation for a specific component (e.g., `patternfly://docs/Button`).
- **`patternfly://schemas/index`**: Index of all available component schemas.
- **`patternfly://schemas/{name}`**: JSON Schema for a specific component (e.g., `patternfly://schemas/Button`).

## MCP client configuration

Most MCP clients use JSON configuration to specify how the server is started. Below are examples you can adapt for your client.

### Minimal client config (stdio)

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

### Custom local tool

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

### HTTP mode with security

```json
{
  "mcpServers": {
    "patternfly-docs": {
      "command": "npx",
      "args": [
        "-y",
        "@patternfly/patternfly-mcp@latest",
        "--http",
        "--port",
        "3000",
        "--allowed-origins",
        "https://app.com",
        "--allowed-hosts",
        "localhost,127.0.0.1"
      ],
      "description": "PatternFly docs (HTTP transport with security)"
    }
  }
}
```

## Custom MCP tool plugins

You can extend the server's capabilities by loading custom **Tool Plugins** at startup.

[See development documentation for tool plugins.](./development.md#mcp-tool-plugins)

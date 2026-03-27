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

#### ~~Tool: componentSchemas~~ (Removed)
> "componentSchemas" has been integrated into "usePatternFlyDocs" and MCP resources.

## Built-in resources

> MCP resources represent indexed collections of documentation and machine-readable metadata.

The server exposes a resource-centric architecture via the `patternfly://` URI scheme. MCP clients can use these resources directly. [Review the roadmap for future resource updates](./architecture.md#roadmap).

> **Note on AI content**: Specialized AI guidance resources are sourced from the [patternfly/ai-helpers](https://github.com/patternfly/ai-helpers) integration. These are specifically optimized to help LLMs generate more accurate PatternFly code. [See Data sources and integrations in architecture](./architecture.md#data-sources-and-integrations).

### Discovery resources

Use these indexes to discover what is available in the library:

- **`patternfly://docs/index{?version,category,section}`**: A comprehensive index of all available PatternFly documentation pages.
- **`patternfly://docs/meta{?version}`**: Metadata discovery for available PatternFly documentation pages, helpful for understanding available filter parameters.
- **`patternfly://components/index{?version,category}`**: A list of all available PatternFly component names.
- **`patternfly://components/meta{?version}`**: Metadata discovery for components, helpful for understanding available filter parameters.
- **`patternfly://schemas/index{?version,category}`**: An index of all available component JSON schemas.
- **`patternfly://schemas/meta{?version}`**: Metadata discovery for JSON schemas, helpful for understanding available filter parameters.

### Component and documentation resources

Access specific component documentation or technical specifications using the following URI templates (RFC 6570):

- **`patternfly://docs/{name}{?version,category,section}`**: Full human-readable documentation for a specific component (e.g., `patternfly://docs/button`) or guideline.
- **`patternfly://schemas/{name}{?version,category}`**: Machine-readable JSON Schema for a specific component, detailing props, types, and validation rules (e.g., `patternfly://schemas/button`).

### Context and guidelines

- **`patternfly://context`**: General PatternFly MCP server context, including high-level development rules and accessibility guidelines.

> **Tip for LLMs**: When a user asks about a component you aren't familiar with, first check `patternfly://docs/index` to find the correct name, then read the documentation via `patternfly://docs/{name}`. Use `patternfly://components/index` for a cleaner list of component-only names.

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

# Usage guide

A comprehensive guide to PatternFly MCP Server tools, resources, and configuration.

**User Guide:**
- [Built-in tools](#built-in-tools)
- [Built-in resources](#built-in-resources)
- [MCP client configuration](#mcp-client-configuration)
- [Custom MCP tool plugins](#custom-mcp-tool-plugins)
- [Troubleshooting](#troubleshooting)

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
    "patternfly-mcp": {
      "command": "npx",
      "args": ["-y", "@patternfly/patternfly-mcp@latest"],
      "description": "PatternFly rules and documentation"
    }
  }
}
```

### HTTP transport mode

```json
{
  "mcpServers": {
    "patternfly-mcp": {
      "command": "npx",
      "args": ["-y", "@patternfly/patternfly-mcp@latest", "--http", "--port", "8080"],
      "description": "PatternFly rules and documentation (HTTP transport)"
    }
  }
}
```

### Custom local tool

```json
{
  "mcpServers": {
    "patternfly-mcp": {
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
    "patternfly-mcp": {
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
      "description": "PatternFly rules and documentation (HTTP transport with security)"
    }
  }
}
```

## Custom MCP tool plugins

You can extend the server's capabilities by loading custom **Tool Plugins** at startup.

[See development documentation for tool plugins.](./development.md#mcp-tool-plugins)

## Troubleshooting

These are **first-step checks** for common setup problems, not full diagnostics. If something still fails, use the community links at the end of this section or ask your IT team, especially on **Windows**, where permissions, security software, and Git setup vary and may be beyond simple troubleshooting.

> **Note on Operating Systems**: Our primary development and testing environments are **macOS and Linux**. While we provide instructions for **Windows**, these commands are run at your own discretion. If you are unsure, please verify them with your IT or system administrator before proceeding.

### 1. Verify Node.js Version
The PatternFly MCP server requires **Node.js 20 or higher**.

- **How to check**:
  - **macOS/Linux**: Open **Terminal** and type `node -v`.
  - **Windows**: Open **PowerShell** or **Command Prompt** and type `node -v`.
- **Requirement**: You should see a version starting with `v20`, `v22`, or higher.
- **Solution**: If your version is lower than 20, please download and install the latest "LTS" (Long Term Support) version from [nodejs.org](https://nodejs.org/).

### 2. Reset the npx Cache
If you encounter an `ERR_MODULE_NOT_FOUND` error or don't see the latest features, your system may be using a "stale" or corrupted version in its cache.

#### **macOS and Linux**
Run this command in your **Terminal**:
```bash
rm -rf ~/.npm/_npx
```

#### **Windows**
Run the appropriate command for your terminal:
- **PowerShell**:
  ```powershell
  Remove-Item -Recurse -Force "$env:LOCALAPPDATA\npm-cache\_npx"
  ```
- **Command Prompt (CMD)**:
  ```cmd
  rd /s /q "%LocalAppData%\npm-cache\_npx"
  ```

**Next Step**: Restart your MCP client (e.g., Claude Desktop, IDE, or Cursor) to force a fresh download.

### 3. Windows-Specific: Symbolic Links
On Windows, folders such as `.agents/skills` and `.claude/skills` can look empty if **Git** created them as normal folders instead of **links** to `guidelines/skills`. This often happens because Developer Mode, or Git symlink support, hasn't been enabled.

For detailed instructions on enabling and restoring symlinks, please refer to the **[Windows and repository symlinks section in CONTRIBUTING.md](../CONTRIBUTING.md#windows-and-repository-symlinks)**.

### 4. Configuration Best Practices
To ensure you stay up to date with the latest PatternFly documentation, use the `@latest` tag in your configuration:

```json
"patternfly-mcp": {
  "command": "npx",
  "args": ["-y", "@patternfly/patternfly-mcp@latest"],
  "description": "PatternFly rules and documentation"
}
```

> Using `@latest` in the configuration means installs resolve to the "latest" published version when npm/npx fetches the package, typically on a new `npx` run.

### 5. Common Error: `ERR_MODULE_NOT_FOUND`
If your logs show `Error [ERR_MODULE_NOT_FOUND]`, it likely indicates a corrupted cache following a PatternFly MCP version update. Please follow the [Reset the npx Cache](#2-reset-the-npx-cache) steps above for your specific operating system.

### 6. Community Support
If you have tried the steps above and are still encountering issues, or if you have specific questions about using PatternFly with your AI assistant, the following community resources are available:

- **[PatternFly Slack](https://patternfly.slack.com/)**: Join our Slack community for real-time support and conversation.
- **[GitHub Discussions](https://github.com/orgs/patternfly/discussions)**: A great place to ask questions, share ideas, and see how others are leveraging PatternFly.
- **[PatternFly on Medium](https://medium.com/patternfly)**: Read articles and deep-dives into PatternFly design and development practices.

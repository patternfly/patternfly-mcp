# Experimental settings

Opt-in server options documented here are **not** covered by the same stability guarantees as the rest of the docs. They may change behavior, graduate to stable configuration, or be removed without a major release.

**Stable docs:**
- [Usage guide](./usage.md) — default tools, resources, and client configuration
- [Development reference](./development.md) — CLI and programmatic API for supported options

## How experimental options work

- **CLI**: `--experimental-<kebab-name>` (for example, `--experimental-context-management`)
- **Programmatic**: `experimental<CamelName>` on the object passed to `start()` (for example, `experimentalContextManagement: true`)
- **Startup**: The server logs a warning when any registered experimental option is enabled

Using an experimental flag without the `experimental` prefix (CLI or programmatic) is ignored.

## Lifecycle

1. **Experimental** — documented only on this page; behavior may change between releases.
2. **Graduating** — when a flag loses its experimental prefix in code, its documentation moves to [usage](./usage.md) or [development](./development.md) in the same change; remove it from the index below.
3. **Removed** — when a flag fails to graduate, delete the row and section here; stable docs should not need updates.

## Index

| Internal name       | CLI flag                            | Programmatic option             | Value type  |
|---------------------|-------------------------------------|---------------------------------|-------------|
| `contextManagement` | `--experimental-context-management` | `experimentalContextManagement` | `boolean`   |

---

## contextManagement

Context management (also called **token-saver mode**) switches the server from the default two-step search-and-fetch workflow to a resource-link workflow for MCP clients that read `patternfly://` URIs directly.

> `contextManagement` is part of a broader set of updates intended to optimize the PatternFly MCP server's use of MCP resources and streamline code. Additional refactors may be included under this umbrella under later releases.

| Mode                    | Registered tools                                      | Typical workflow                                                                 |
|-------------------------|-------------------------------------------------------|----------------------------------------------------------------------------------|
| **Default** _(off)_     | `searchPatternFlyDocs`, `usePatternFlyDocs`           | Search returns text with URLs, names, and URIs; fetch content with `usePatternFlyDocs`. |
| **Context management**  | `searchPatternFly` only                               | Search returns `resource_link` items; read content with `resources/read`.        |

Built-in MCP resources (`patternfly://docs/...`, `patternfly://schemas/...`, indexes, and `patternfly://context`) remain available in both modes.

> **Important!**
>
> In **default** mode, `searchPatternFlyDocs` returns and `usePatternFlyDocs` accepts `patternfly://` URIs. This is a compatibility bridge for limited MCP clients. This is a transitional allowance: context management is the architecture the PatternFly MCP tools are moving towards, where URIs are returned as links and read through MCP resources. However, this does not mean the older technique of returning Markdown will go away; there is still a possible future where the PatternFly MCP retains the older Markdown response techniques to purposefully support limited and agentless MCP clients.

### Tool: searchPatternFly

Registered only when context management is enabled.

Search PatternFly components, documentation, guidelines, and JSON schemas by keyword. Returns MCP `resource_link` content items (collections, docs, and schemas).

**Parameters:**
- `query`: `string` (required) — Case-insensitive query for full or partial keywords, resource names, versions and more (e.g., `"button"`, `"card v6"`, `"react"`, `"*"`)
- `collection`: `string` (optional) — Filter results by a primary collection of records (e.g., `"patternfly-docs"`, `"patternfly-component-schemas"`, `"patternfly-api"`)

**Examples:**

Search across all collections:
```json
{
  "query": "button"
}
```

Search filtered by collection:
```json
{
  "query": "button",
  "collection": "patternfly-docs"
}
```

### CLI

```bash
npx -y @patternfly/patternfly-mcp@latest --experimental-context-management
```

HTTP transport:

```bash
npx -y @patternfly/patternfly-mcp@latest --http --port 8080 --experimental-context-management
```

### Programmatic

```typescript
import { start } from '@patternfly/patternfly-mcp';

const server = await start({
  experimentalContextManagement: true
});
```

### MCP client configuration

Stdio:

```json
{
  "mcpServers": {
    "patternfly-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "@patternfly/patternfly-mcp@latest",
        "--experimental-context-management"
      ],
      "description": "PatternFly rules and documentation (experimental context management)"
    }
  }
}
```

HTTP:

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
        "8080",
        "--experimental-context-management"
      ],
      "description": "PatternFly rules and documentation (HTTP, experimental context management)"
    }
  }
}
```

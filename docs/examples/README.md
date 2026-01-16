# Code Examples

PatternFly MCP code examples for tooling plugins and development use cases.

- **[embeddedBasicStdio.js](embeddedBasicStdio.js)** - Embedding a basic STDIO transport configuration and usage
- **[embeddedBasicHttp.js](embeddedBasicHttp.js)** - Embedding a basic HTTP transport configuration and usage
- **[embeddedInlineTool.ts](embeddedInlineTool.ts)** - Embedding the server and using a custom inline tool to make your own MCP server
- **[toolPluginGitStatus.js](toolPluginGitStatus.js)** - A custom tool using Git
- **[toolPluginHelloWorld.js](toolPluginHelloWorld.js)** - A basic JS tool plugin example


## Adding new example guidance

Examples should follow the basic guidelines:

1. This index is updated with an example link
2. Filenames are lowerCamelCased
3. Keep examples short; this is an introduction to the project
4. Examples are either JS or TS with ESM import/exports
5. Comments/annotations are used to explain key concepts
6. Examples are linted from the project's linting configs with
   - `npm run test:lint`
   - `npm run test:types`
   - `npm run test:spell-docs`
7. Examples are tested and can be run without errors

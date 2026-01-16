# Agent Coding

## Overview

Coding standards and architectural patterns for the PatternFly MCP project. This document emphasizes maintainability, performance, and pragmatic TypeScript usage.

## For Agents

### Processing Priority

High - This document should be processed when working with source code or implementing features.

### Related Guidelines

See the [Guidelines Index](./README.md#guidelines-index) for all guidelines.

## 1. TypeScript Standards

Adhere to the [TypeScript coding conventions](../CONTRIBUTING.md#typescript) established for the project.

### Core Principles

- **Pragmatic Over Perfection**: Focus on code and functionality. Types are for consumer ergonomics and quick sanity checks — not a blocker for implementation speed.
- **Generics should be reserved**: Use for public exported functions/typings. If they reduce readability, prefer concrete typings.
- **Prefer `unknown` over `any`**: `unknown` is the default at boundaries; add runtime guards and narrow. `any` is still acceptable in testing or deserialization (IPC).
- **Prefer inference over explicit returns**: Let inference work unless the function/type is part of the public surface.
- **Style Preference (Nullish Coalescing)**: Align to the codebase's established style. Prefer logical OR (`||`) over lazy application of the nullish coalescing operator (`??`). Use nullish coalescing when an active distinction for `null`/`undefined` (e.g., distinguishing from `0`, `""`, or `false`) is logically required.
- **Avoid Over-Engineering**: Do not use overabundant type guards or complex nested ternaries. Prefer clear, readable logic over opaque TypeScript patterns.

### Strict ESM Enforcement

The project is strictly ESM. Agents MUST follow these rules:
- **Exports**:
    - **Internal Source Code (TypeScript)**: Favor named exports (e.g., `export { foo }`).
    - **External Tool Plugins (JavaScript)**: MUST use `export default` for the tool definition.
- **Explicit Extensions**:
    - **Internal Source Code (TypeScript)**: Use extension-less imports for local modules (e.g., `import { foo } from './foo'`).
    - **External Tool Plugins (JavaScript)**: All relative imports MUST include explicit file extensions (e.g., `import { foo } from './foo.js'`) as they are loaded by the Node.js ESM runtime.
- **No CommonJS**: Do not use `require()`, `module.exports`, or `__dirname`.

### When to Bypass TypeScript (Localized Opt-out)

Specific modules allow bypassing strict typing to maintain momentum:

- **Internal tool composition** (`src/server.tools.ts`): Use localized casts for inferred unions that don't narrow. Add a short comment explaining intent.
- **Schema conversion** (`src/server.schema.ts`): Returning `z.ZodTypeAny` is fine. Avoid deep type plumbing.
- **Tools Host IPC** (`src/server.toolsHost.ts`): `any` for deserialized payloads is acceptable. Runtime checks and try/catch are the safety net.
- **Test fixtures and E2E clients**: Use `// @ts-ignore` or `as any` where tests exercise built outputs or where typings aren’t the point under test.

## 2. Architectural Patterns

The project follows a plugin-based architecture focused on stability and extensibility.

### 2.1 Tool and Resource Authoring (The "Creator" Pattern)

All tools and resources MUST follow the **Creator Pattern** for dependency injection and testability.

- **Structure**: Creator functions accept an optional `options` parameter (defaults to `getOptions()`) and return a tool/resource tuple.
- **Options Hybrid Approach**: Environment-dependent helpers should accept an optional `options` parameter that defaults to `getOptions()`. This allows for explicit dependency injection in tests while maintaining ergonomics via `AsyncLocalStorage` in production. Pure transforms should remain option-agnostic.
- **Internal Tools**: `(options = getOptions()): McpTool` -> Returns `[name, schema, handler]`.
- **Internal Resources**: `(options = getOptions()): McpResource` -> Returns `[name, uri, config, handler]`.
- **External Tool Plugins**: Authored using the `createMcpTool` helper with an object configuration, exported as `default`.
- **Testing**: Creators allow easy mocking: `const tool = usePatternFlyDocsTool(mockOptions)`.

### 2.2 Module Organization and Exports

- **File Naming**:
    - **Internal**: `lowerCamelCase` with dot notation (e.g., `server.http.ts`, `tool.docs.ts`).
    - **Prefixes**: `server.*` (core), `tool.*` (built-in tools), `resource.*` (resources), `options.*` (config).
    - **External/Examples**: `lowerCamelCase` with descriptive prefixes (e.g., `toolPluginHello.js`).
- **Export Patterns**:
    - **Internal (TS)**: Use **named exports** grouped at the end of the file.
    - **External (JS)**: Use **default export** for the primary tool definition.
- **Concurrency**: Use `processDocsFunction` for multi-file loading to leverage the `promiseQueue` (sliding window pattern). Respect `maxDocsToLoad`.

### 2.3 External Tool Plugin Scaffold

External tool plugins should follow this basic structure:

```javascript
import { createMcpTool } from '@patternfly/patternfly-mcp';

export default createMcpTool({
  name: 'myTool',
  description: 'Tool description',
  inputSchema: {
    type: 'object',
    properties: {
      param1: { type: 'string', description: 'Parameter description' }
    },
    required: ['param1']
  },
  async handler({ param1 }) {
    return {
      content: [{ type: 'text', text: `Result: ${param1}` }]
    };
  }
});
```

## 3. Common Patterns

### 3.1 Memoization

Expensive operations (network, I/O, schema processing) should be memoized by assigning a `.memo` property to the function. This allows easier testing of the original function.

- **Usage**: `const result = await getComponentSchema.memo('Button');`
- **Pattern**:
```typescript
const expensiveFn = async (arg: string) => { /* ... */ };

expensiveFn.memo = memo(expensiveFn, { 
  cacheLimit: 10, 
  keyHash: (args) => args[0] 
});
```
- **Note**: Use `cacheErrors: false` if normalization should retry on subsequent attempts.

### 3.2 Context Management

Use `AsyncLocalStorage` via helper functions to access session and global options without parameter drilling.

- **Tool Pattern**:
```typescript
const myTool = (options = getOptions()): McpTool => {
  const session = getSessionOptions();
  return [name, schema, async (args) => { /* use options/session */ }];
};
```
- **Execution**: Context is automatically preserved across async boundaries. Use `runWithSession` or `runWithOptions` only when explicit overrides are required.

### 3.3 Error Handling and "Suggestive Failure"

Always use `McpError` with appropriate `ErrorCode` for user-facing failures. When a resource is not found, provide suggestions.

**Note on Error Codes**: To avoid drift, we do not maintain a local list of MCP SDK `ErrorCode` values. Agents MUST analyze the current version of the `@modelcontextprotocol/sdk` package to identify correct codes. Avoid listing package-specific resources we do not control in agent documentation due to maintenance concerns.

```typescript
const { exactMatches, searchResults } = searchComponents.memo(name);

if (exactMatches.length === 0) {
  const suggestions = searchResults.map(r => r.item).slice(0, 3);

  throw new McpError(
    ErrorCode.InvalidParams,
    `"${name}" not found. Did you mean ${suggestions.map(s => `"${s}"`).join(', ')}?`
  );
}
```

### 3.4 Core Utilities (Helpers, Schema, Guards)

Centralized utilities in `server.helpers.ts`, `server.schema.ts`, and `server.getResources.ts` should be favored over re-implementation.

- **Helpers**: Use `stringJoin.newline()`, `freezeObject()`, `timeoutFunction()`, and `mergeObjects()`.
- **Schemas**: Use `normalizeInputSchema(schema)` to convert JSON Schema or Zod shapes into valid Zod instances.
- **Type Guards**: Use `isPlainObject()`, `isZodSchema()`, and `isErrorLike()` for runtime narrowing.
- **Zod Detection**: Robustly detect Zod schemas by checking for internal brands: `_def` for Zod v3 and `_zod` for Zod v4. Avoid relying solely on `parse()` or `safeParse()` methods.
- **Immutability**: Options and Session objects are **frozen**; use `structuredClone()` before modification.

### 3.5 Validation and Sanitization

Validate input at boundaries (handlers) and sanitize objects before merging.

```typescript
const handler = async (args: unknown) => {
  if (!isPlainObject(args)) {
    throw new McpError(ErrorCode.InvalidParams, 'Object required');
  }

  const { name } = args;

  if (typeof name !== 'string' || !name.trim()) {
    throw new McpError(ErrorCode.InvalidParams, 'Name string required');
  }

  return process(name.trim());
};
```

### 3.6 Async Patterns (Return Await)

Use `return await` ONLY when catching/translating errors in the current layer or when a `finally` block must execute before returning. Otherwise, return the promise directly.

### 3.7 Concurrency Patterns (Sliding Window)

The project favors a "sliding window" pattern for promise queues (see `src/server.getResources.ts`) over strict batching. This maintains a constant number of active requests rather than waiting for an entire batch to complete.

## 4. JSDoc Documentation Standards

While the codebase emphasizes pragmatism, **public APIs require comprehensive JSDoc** for consumer ergonomics.

### 4.1 Required Tags for Public APIs

- **`@param`**, **`@returns`**, **`@throws`**: Standard documentation for function signature.
- **`@property`**: Document properties for interfaces or classes.
- **`@alias`**: Used for stable aliased typings exposed to consumers.
- **`@template`**: Document generic type parameters.
- **`@example`**: Provide usage examples for complex functions.
- **`@note`**: Important implementation details or gotchas.

### 4.2 JSDoc Format Examples

```typescript
/**
 * Fetches documentation for a PatternFly component.
 * 
 * @param name - Component name (e.g., 'Button')
 * @param options - Configuration
 * @param options.maxDocs - Max items to load
 * @returns Tool tuple [name, schema, handler]
 * @throws {McpError} If component not found
 * @example
 * const tool = usePatternFlyDocsTool();
 * const res = await tool[2]({ name: 'Button' });
 */
```

### 4.3 Internal Code and Best Practices

- **Internal Code**: Use minimal JSDoc (description, key params, returns). Focus on "why" rather than "what".
- **Conciseness**: Keep descriptions brief but informative.
- **Accuracy**: Update JSDoc immediately when signatures change.
- **Types**: Use TS types in JSDoc ONLY when they add clarity or differ from the implementation.

## 5. Quality Control & Validation

Agents MUST validate all code outputs using the project's quality suite:

1. **Linting**: `npm run test:lint` (Ensures style consistency)
2. **Type Checking**: `npm run test:types` (tsc validation)
3. **Documentation**: `npm run test:spell-docs` (Cspell validation)
4. **Testing**: `npm run test` (Unit) and `npm run test:integration` (E2E)

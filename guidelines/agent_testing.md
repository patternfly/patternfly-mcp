# Agent Testing

## Overview

This document provides agent guidance on testing procedures and standards for the PatternFly MCP codebase.

## For Agents

### Processing Priority

High - This document should be processed when working with tests or implementing changes that require testing.

### Related Guidelines

See the [Guidelines Index](./README.md#guidelines-index) for a complete list of all guidelines.

## 1. Test Structure and Organization

Refer to [testing standards](../CONTRIBUTING.md#testing) for project-wide requirements.

- **Unit Tests (`src/__tests__/*.test.ts`)**: Focus on individual module logic, helpers, and creator functions.
- **E2E Tests (`tests/*.test.ts`)**: Validate full server lifecycle, transport (stdio/http), and tool/resource execution.
- **Integration Tests (`npm run test:integration`)**: Verify interactions between server components.

## 2. Testing Principles

- **Focus on Behavior**: Test what the user (MCP client) observes. Verify that tools return the expected content and errors. See [functionality and testing](../CONTRIBUTING.md#functionality-testing) guidance.
- **Pragmatic Typings**: Explicit `any` is allowed in tests to avoid over-modeling mocks and stubs. Avoid "type threading" in tests; do not attempt to perfectly type every mock. Focus on validating observable behavior. Use lightweight local type aliases if needed.
- **Don't Test Dependencies**: Assume `@patternfly` packages and the MCP SDK work as intended. Test our integration and custom logic.
- **Reproducers Required**: Every bug fix must include a test case that reproduces the issue and verifies the fix.
- **Suggestive Failure**: Tools should be tested for "suggestive failure". If a resource is not found, the tool should attempt to suggest the closest match using available metadata or fuzzy matching.
  
  **Test Example:**
  ```typescript
  it('returns suggestions for misspelled component name', async () => {
    const tool = usePatternFlyDocsTool();
    const result = tool[2]({ name: 'ton' }); // Misspelling "Button"

    await expect(result).rejects.toThrow(/Did you mean "Button"?/);
  });
  ```

## 3. Mocking and Snapshots

- **Jest Mocks**: Use `jest.mock()` for file system (`node:fs/promises`) and network (`fetch`) operations.
- **Snapshot Testing**: Use `toMatchSnapshot()` for large or complex tool outputs (e.g., documentation processing results).
- **Snapshot Verification**: Always inspect snapshot changes. Only update snapshots (`-u`) if the change is intentional and correct.
- **Mocking MCP SDK**: When testing server startup, mocks should simulate transport behavior without requiring actual network/IPC overhead where possible.

## 4. Test Case Requirements

- **Happy Path**: Verify standard tool/resource usage works as expected.
- **Error Handling**: Verify that invalid parameters, missing files, and network failures return user-friendly error messages (e.g., "Did you mean 'Button'?").
- **Edge Cases**: Test empty inputs, extreme `maxDocsToLoad` values, and complex URL patterns.
- **Security**: Verify that `resolveLocalPathFunction` correctly prevents path traversal.

## 5. Execution

- **Unit Tests**: `npm test`
- **E2E/Integration**: `npm run test:integration`
- **Manual Verification**: Use the [MCP Inspector](../docs/development.md#testing-with-mcp-inspector) to manually verify tool and resource behavior.
- **Coverage**: Ensure new logic is covered by at least one unit test.

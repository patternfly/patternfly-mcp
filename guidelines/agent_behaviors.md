# Agent Behaviors

## Overview

Comprehensive guide to agent behaviors, workflows, and standards for the codebase.

## For Agents

### Processing Priority

Critical - This document should be processed first when working with agent guidelines in the repository.

### Related Guidelines

See the [Guidelines Index](./README.md#guidelines-index) for all guidelines.

### Key Concepts

- Repository context and structure
- Core behavior standards
- Trigger-based workflows
- Decision-making principles
- Guidance authoring standards

## 1. Repository Context

The PatternFly MCP server is a Model Context Protocol (MCP) server written in TypeScript. It provides access to PatternFly documentation, rules, and component schemas for LLMs.

### Key Architectural Components

For a detailed overview of the system design and roadmap, see [docs/architecture.md](../docs/architecture.md).

- **Core Server**: Manages the MCP lifecycle and transport (stdio/http).
- **Tools**: Built-in actions for searching and using PatternFly documentation and technical specifications.
- **Resources**: URI-based access to PatternFly context, documentation, and schemas.
- **External Tools Host**: Isolated execution environment for custom tool plugins.
- **Caching & Performance**: Robust memoization and concurrency systems for efficient resource retrieval.

## 2. Core Behavior Standards

- **Sequential Processing**: Ask questions one at a time; process requests in logical order; complete one task before starting another.
- **Architectural Alignment**: Always confirm changes against the [system architecture and roadmap](../docs/architecture.md) before proceeding with implementation.
- **Reference-Based Implementation**: Review git history; study existing patterns (e.g., "creator" pattern for tools/resources); maintain code style consistency and follow [standard Git workflows](../CONTRIBUTING.md#step-4-submitting-your-work).
- **Commit Messaging Standards**: Follow the project's [commit messaging standards](../CONTRIBUTING.md#conventional-commits).
- **Validation Required**: Follow checklists; verify requirements; test thoroughly. Review [pull request submission guidelines](../CONTRIBUTING.md#step-4-submitting-your-work) to avoid common pitfalls.
- **Confirmation Required**: Confirm success; summarize changes; explain impact; verify understanding.
- **Guidance Review Scope**: Unless the user explicitly asks, do not make recommendations on improving guidance if all you're asked to do is review guidance.
- **Environment Awareness**: 
  - Server and plugin execution requirements are defined in `package.json`.
  - Always verify environment compatibility by checking `patternfly://context` or `package.json`.
  - Proactively check for environment mismatches (e.g., Node.js version) if tools fail to load.
- **Security Context**:
  - Default to `--plugin-isolation strict`.
  - If a tool requires filesystem or network access beyond the sandbox, document the need for `--plugin-isolation none`.
  - **Implicit Diagnostics**: If a tool call fails, the agent MUST proactively check `patternfly://context` to see if the user's environment meets requirements before requesting more technical details.
  - Warn users when a proposed solution requires disabling isolation.
- **State Management**: Use `.agent/` directory for local guidance and state; maintain context; preserve session information.
- **Security Awareness**: Be mindful of path traversal and isolation levels when working with external tools and resource loading.
- **Troubleshooting Reference**: When encountering environment or runtime issues, consult the [Troubleshooting section in docs/usage.md](../docs/usage.md#troubleshooting) for common fixes such as Node.js upgrades, cache resets, and Windows-specific symlink issues.

## 3. Trigger-Based Workflows

### Trigger: "Research MCP SDK methods or issues"

1. **Analyze**
  - Confirm the installed MCP SDK version
  - Research the error
  - Identify conflict scenarios with code
  - Identify potential test cases
  - Review [testing procedures](../CONTRIBUTING.md#step-3-development--testing) and [agent testing guidelines](./agent_testing.md) for applicable testing tiers.

2. **Test**
  - Run typing, lint, unit, e2e, and specialized tests (e.g., `npm run test:scripts` for script changes).
  - Confirm conflicts
  - Test resolution options

3. **Resolve**
  - Adjust codebase
  - Change code or confirm a solution
  - Implement resolution

4. **Validate**
  - Test conflict resolution
  - Confirm approach

### Trigger: "Contribute to the repository" / "Opening a pull request"

1. **Review Standards**
  - Study [CONTRIBUTING.md](../CONTRIBUTING.md) for project-wide guidelines.
  - Review [GOVERNANCE.md](../GOVERNANCE.md) to understand the automated and human review layers.
  - Open a GitHub issue BEFORE starting work to start a planning conversation.

2. **Gatekeeper Model**
  - PRs from general contributors require a Gatekeeper pre-check.
  - After opening a PR, automation will provide immediate feedback in a "PR Quality Guidance" bot comment.
  - **Action**: Monitor the bot comment for required cleanup. If Gatekeeper policy checks pass, the PR is labeled `bot:policy-ready`.
  - **Policy Hold**: PRs from non-core contributors that modify core behavior or exceed established file limits are automatically placed on **Policy Hold** (labeled `bot:policy-hold`). These require a secondary review by a maintainer.
  - **Fallback**: Gatekeeper supports a flexible messaging model. If direct PR feedback (labeling/commenting) is unavailable, agents and contributors should refer to the mirrored guidance and status in the workflow logs.

3. **Validation & Gating**
  - Address all feedback from the "PR Quality Guidance" bot comment before requesting a manual review.

4. **Core Contributor Implicit Bypass**
  - Core contributors (listed in `CODEOWNERS` or with `OWNER/MEMBER` roles) skip policy checks and receive the `bot:policy-ready` label immediately.

## 4. Decision-Making Guidelines

1. **Consistency vs. Improvement**
  - Favor consistency for minor changes
  - Favor improvement for bugs and features
  - Balance both when possible

2. **Strictness vs. Flexibility**
  - Strict for quality/security
  - Flexible for style preferences
  - Consider developer experience

3. **Backward Compatibility**
  - Minimize breaking changes
  - Document when necessary

4. **Architectural Alignment**
  - Always verify that the proposed solution fits within the project's [long-term architecture and roadmap](../docs/architecture.md).
  - Consult the roadmap before introducing major features or structural changes.

## 5. Validation Procedures

For all workflows:

1. **Testing**: Run appropriate tests, ensure they pass, update snapshots only when intentional
2. **Documentation**: Verify accuracy, consistency, and helpful examples
3. **Code Quality**: Follow patterns, check edge cases, ensure clear comments

## 6. Security Guidance

### 6.1 Path Traversal Prevention

When implementing tools that interact with the local filesystem, always use `resolveLocalPathFunction` to ensure paths remain within the intended directory.

**Secure Pattern:**
```typescript
import { resolveLocalPathFunction } from './server.getResources';
// ...
let safePath;

try {
  safePath = resolveLocalPathFunction(requestedPath);
} catch {
  throw new McpError(ErrorCode.InvalidParams, 'Access denied');
}

// use safePath for subsequent file operations
```

### 6.2 Plugin Isolation

- **Strict (Default)**: Isolation is enabled. Restricted environment.
- **None**: Isolation is disabled. Use ONLY when system/network access is strictly required (e.g., `git` commands).
- **Requirement**: Agents MUST warn users when a proposed solution requires `--plugin-isolation none` and explain the security implications.

## Date and Time Management

Run `$ date` to get system date before applying dates. Used for:
- Updating timestamps in documentation
- Adding creation dates
- Recording when changes were made

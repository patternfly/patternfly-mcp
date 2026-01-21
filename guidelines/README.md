# Agent Guidelines

## Overview

Agent-specific guidelines for the PatternFly MCP project, optimized for machine processing.

## File Naming Convention

- `agent_*`: Guidance for autonomous agents

## Guidelines Index

### Agent Guidelines

- [Agent Behaviors](./agent_behaviors.md) - Comprehensive guide to agent behaviors, workflows, and standards
- [Agent Coding](./agent_coding.md) - Coding standards
- [Agent Testing](./agent_testing.md) - Testing procedures

## User Guide

### Available Trigger Phrases

Agents should use these phrases as signals to consult specific documentation and source code:

| Task / Intent                       | Reference Document                                                                                                                                     |
|:------------------------------------|:-------------------------------------------------------------------------------------------------------------------------------------------------------|
| **"review the repo guidelines"**    | Scan markdown files and guidelines directory. See [AI agent context](../CONTRIBUTING.md#ai-agent).                                                     |
| **"review app architecture"**       | Review `docs/architecture.md` for current to future state, then review `src/*` for up-to-date specs.                                                   |
| **"review tool usage"**             | Review `docs/usage.md` for built-in tools and configuration.                                                                                           |
| **"review development guide"**      | Review `docs/development.md` for CLI, API, and plugin authoring.                                                                                       |
| **"create an example tool plugin"** | Review `guidelines/agent_coding.md`, `docs/development.md`, `docs/examples/*`, and `src/*` for context, coding standards, and existing example formats. |

## Guidelines Processing Order

1. **Guidelines Directory** (all files in the `guidelines/` directory)
2. **Local Guidelines** (`.agent/` directory)

## Maintaining This Directory

### File Maintenance Principles
- Update index files (e.g., `docs/examples/README.md` or `guidelines/README.md`) immediately when adding or removing content.
- Reference and index guidelines. Don't duplicate content
- Update references when adding new files
- Keep descriptions concise and focused

### Adding New Guidelines
1. Add entry to "Guidelines Index" section
2. Include essential metadata
3. Provide brief description
4. Update processing order if needed

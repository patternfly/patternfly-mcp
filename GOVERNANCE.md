# Governance

Every contribution passes through three layers before it can affect a user's system.

## Layer 1: Automated Review

GitHub workflows perform checks for

- Spelling and linting for most files
- Unit testing
- E2E testing
- Dependency Auditing: Automated `npm audit` checks to identify critical-risk vulnerabilities in the project's dependency tree, running on every dependency change and daily thereafter.
- Conditional Data Auditing: If and when related files are updated, an automated audit verifies the integrity and reachability of PatternFly documentation entries.

> Layer-1 policy feedback may be handled at the maintainer or organization level for core and established contributors. Any such discretion applies only to how policy findings are triaged; it does not extend to waiving automated checks, human review (Layer 2), or runtime boundaries (Layer 3).

## Layer 2: Human Review

A maintainer reviews every PR for intent-level issues that automated tools miss:

- **Intent-based Filtering:** Labeling is leveraged to prioritize reviews and identify high-risk changes based on their potential impact. Maintainers use workflow log outputs from Layer-1 to prioritize reviews for these contributions.
- **Architectural Alignment:** Every PR is verified against the [planned architecture](./docs/architecture.md) to ensure long-term stability.
- **Guideline Adherence Verification:** Maintainers verify that contributions follow established patterns and do not interfere with internal validation mechanisms designed to ensure contributors have performed a full context review.
- **Credential & Secret Scanning:** Manual verification that no sensitive environment variables or keys are exposed in tests or documentation.

## Layer 3: Runtime Permission Boundary

The PatternFly MCP server implements security at the execution level:
- **Plugin Isolation:** By default, the server operates in `strict` isolation mode, sandboxing tool execution to prevent unauthorized filesystem or network access.
- **Path Traversal Protection:** All resource lookups are constrained via a path normalization utility to ensure agents cannot escape the intended directory scope.

## What This Means in Practice

No single automated check or individual contributor can bypass the security chain. A malicious or accidental change must pass Layer-1, a human maintainer (Layer 2), and still operate within the Sandbox (Layer 3) to affect a user.

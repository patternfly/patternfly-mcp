# Governance

Every contribution passes through three layers before it can affect a user's system.

## Layer 1: Automated Review

GitHub workflows perform checks for

- **Policy Guidance**: An automated bot provides Gatekeeper guidance and links to contribution guidelines to help your PR reach a review-ready state.
- Spelling and linting for most files
- Unit testing
- E2E testing
- Dependency Auditing: Automated `npm audit` checks to identify and block critical-risk vulnerabilities in the project's dependency tree, running on every dependency change and daily thereafter.
- Conditional Data Auditing: If and when related files are updated, an automated audit verifies the integrity and reachability of PatternFly documentation entries.

> Core contributors may receive an automated pass on Layer-1 Gatekeeper policy checks when the workflow makes an allowance. This pass does not remove the remaining steps of automated review, or the later layers of review and runtime boundaries.

## Layer 2: Human Review

A maintainer reviews every PR for intent-level issues that automated tools miss:

- **Intent-based Filtering:** Automated labeling is leveraged to prioritize reviews and identify high-risk changes based on their potential impact. For contributions where Gatekeeper uses workflow log output, maintainers use this output for prioritization.
- **Architectural Alignment:** Every PR is verified against the [planned architecture](./docs/architecture.md) to ensure long-term stability.
- **Guideline Adherence Verification:** Maintainers verify that contributions follow established patterns and do not interfere with internal validation mechanisms designed to ensure contributors have performed a full context review.
- **Credential & Secret Scanning:** Manual verification that no sensitive environment variables or keys are exposed in tests or documentation.

## Layer 3: Runtime Permission Boundary

The PatternFly MCP server implements security at the execution level:
- **Plugin Isolation:** By default, the server operates in `strict` isolation mode, sandboxing tool execution to prevent unauthorized filesystem or network access.
- **Path Traversal Protection:** All resource lookups are constrained via a path normalization utility to ensure agents cannot escape the intended directory scope.

## What This Means in Practice

No single automated check or individual contributor can bypass the security chain. A malicious or accidental change must pass the Gatekeeper (Layer 1), a Human Maintainer (Layer 2), and still operate within the Sandbox (Layer 3) to affect a user.

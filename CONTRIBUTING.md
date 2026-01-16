# Contributing
Interested in contributing to the project? Review the following guidelines and our [planned architecture](./docs/architecture.md) to make sure
your contribution is aligned with the project's goals.

## Development

### Environment setup

#### Tools
- [Node.js](https://nodejs.org/en/download/package-manager)
- NPM (or equivalent package manager)
- Git configured with your GitHub account

#### Project setup
- Fork and clone the repository
- Open your terminal, or equivalent, in the codebase context and run the following commands
   ```bash
   npm install
   npm run build
   npm test
   npm run test:integration
   npm start
   ```
  All tests should pass, and the application should start successfully with confirmation messaging in the terminal.

#### Development workflow
- Make changes to the codebase
- Run tests to verify your changes do not break existing functionality
- Commit your changes and push them to your fork
- Open a pull request

### Using Git

#### Workflow
Our process follows the standard GitHub fork and pull request workflow.

- Fork the repository
- Create a branch for your changes
- Submit a pull request towards the main repository default branch

##### Main repository branches
- The `main` branch currently represents both development and stable releases

> In the future, a consideration for a `stable` branch may be made against an increase in contributions.
>    - `main` would be the default branch for development and feature work rebased from `stable` after release.
>    - `stable` would be a branch used for stable releases/hashes, reference links, and only updated with release commits.

#### Pull requests

Development pull requests (PRs) should be opened against the default branch.

> If your pull request work contains any of the following warning signs
>  - has no related issue
>  - ignores existing code style
>  - out of sync commits (not rebased against the default branch)
>  - poorly structured commits and messages
>  - any one commit relies on other commits to work (beyond "review requested updates")
>  - dramatic file restructures that attempt complex behavior
>  - missing, relaxed, or removed linting, typings, and tests
>  - overly complex TypeScript generics or generally over-the-top typings
>  - dramatic unit test snapshot updates
>  - affects any file not directly associated with the issue being resolved
>  - affects "many" files
>  - contains or is a minor grammatical fix
>
> You will be asked to either:
>  - open an issue instead of a PR
>  - restructure your commits
>  - break the work into multiple pull requests
>  - close the PR (typically, a last resort)

#### Pull request commits, messaging

Your pull request should contain Git commit messaging that follows [conventional commit types](https://www.conventionalcommits.org/)
to provide consistent history and help generate [CHANGELOG.md](./CHANGELOG.md) updates.

Commit messages follow two basic guidelines:
- No more than `65` characters for the first line.
- Commit message formats follow the structure:
  ```
  <type>(<optional scope>): <description> (#PR_NUMBER)
  ```
  Where:
  - **Type**: The type of work the commit resolves (e.g., `feat`, `fix`, `chore`, `docs`, `refactor`, `test`).
  - **Scope**: The optional area of code affected (directory, filename, or concept).
  - **Description**: What the commit work encompasses.
  - **#PR_NUMBER**: The pull request number. Typically added automatically during merge/squash operations. Including it manually is optional. It can help with traceability during review.

> If your **pull request contains multiple commits**, they will be squashed into a single commit before merging and the messaging
> altered to reflect current guidelines.

#### Pull request test failures
Before any review takes place, all tests should pass. You may be asked to update your pull request to resolve any failing tests
before a review.

> If you are unsure why your tests are failing, you should [review testing documentation](#testing). 


### Code style guidance and conventions
Basic code style guidelines are generally enforced by ESLint, but there are additional guidelines.

#### File structure
- File names use lowerCamelCase and dot notation (e.g., `server.http.ts`, `server.logger.ts`).
- Directory structure is organized by function, with all relevant files maintained in the `src` directory.

#### Functionality, testing
- Functions should attempt to maintain a single responsibility.
- Function annotations follow a minimal JSDoc style; descriptions are encouraged.
- Tests should focus on functionality.
- Tests should not be written for external packages. That is the responsibility of the external package, or it shouldn't be used.

#### Typescript
- Typings within the project may be generally loose for initial development but should be refined over time.
- Typings exposed to consumers should always attempt to maintain consistency.
- Typings for tests are less of a focus than functionality checks.

### Testing
Current testing is based on Jest.

> A consideration for Vitest is being made for the near future after base functionality is complete.

#### Unit tests

Unit tests are located in the `__tests__` directory.

#### E2E tests

E2E tests are located in the root `./tests` directory.

## AI agent

### User Section

Current agent interaction can be triggered with the chat command

- **`review the repo guidelines`** - Your agent should attempt to scan common markdown files and the guidelines directory

For detailed information on agent interaction, see [guidelines/README.md](./guidelines/README.md).

#### Customizing developer experience

As developers, we often have our own preferred workflows, and that includes working with AI agents. To that point, we've added agent guidance
to allow customization for your work environment through a tool-agnostic git-ignored directory `./.agent` in the root of the project.

#### Noting AI Agent contributions

Please reference [PatternFly's AI-assisted development guidelines](https://github.com/patternfly/.github/blob/main/CONTRIBUTING.md) for guidance on how to
acknowledge AI agent contributions.

### Agent Only
Agents: This repository contains a hierarchical guideline system. Agents should review agent-only comment blocks.

<!--
Agents must analyze these files when asked for guidance:

**Guidelines review order:**
1. **`./README.md`** - Main agent guidance and behavior standards (including agent-only comment block)
2. **`./guidelines/README.md`** - Core agent guidance and behavior standards
3. **`./guidelines/**/*.md`** - Specialized workflow and domain-specific instructions
4. **`./.agent/**/*.md`** - gitignored directory and local guidelines intended for agent-specific state and new agent-generated guidance, and user workflows that enhance the core guidelines

The guideline system should be processed in this order, with specialized guidelines taking precedence for their specific domains, and local guidelines overriding general guidelines when present.

**Next Steps:**
5. **Review guidance under the `./.agent/**/*.md` directory.** If the `./.agent` directory exists, the user may ask the agent about the guidance located here.
6. **If the `./.agent` directory does not exist, ask the user if they want to create it.** The agent should explain how it's going to be used.
-->

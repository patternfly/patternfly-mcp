# Contributing to PatternFly MCP

Welcome! Our goal is to make PatternFly documentation and components easily accessible to AI agents and developers everywhere.

Review these guidelines and our [planned architecture](./docs/architecture.md), [security policy](./SECURITY.md), and [governance policy](./GOVERNANCE.md) to ensure your contribution aligns with the project's goals.

### Navigation

- [Step 1: Start a Conversation](#step-1-start-a-conversation)
- [Step 2: Setting Up Your Workspace](#step-2-setting-up-your-workspace)
- [Step 3: Development & Testing](#step-3-development--testing)
- [Step 4: Submitting Your Work](#step-4-submitting-your-work)
- [The Gatekeeper & Review Process](#the-gatekeeper--review-process)
- [Node.js Engine Bumps](#maintenance-nodejs-engine-bumps)
- [AI Agent Guidance](#ai-agent)

---

### Step 1: Start a Conversation

In the new age of agentic coding where your ideas can be up and working quickly, we encourage opening a GitHub issue before starting any work.

Opening an issue first starts the planning conversation to have your idea integrated, push the PatternFly MCP forward collectively, and give you the recognition for your effort and planning without forcing a code review from maintainers. We want your planned idea, not our reactive interpretation.

Opening a PR without an issue has a higher likelihood your work will be flagged with automation, delayed for maintainer review, and potentially closed.

#### Just want to show us your work?
If you're leveraging the GitHub PR to provide us with file diffs, you can achieve the same Git diff applied by PRs by simply using the GitHub link format and applying it to your issue:
`https://github.com/patternfly/patternfly-mcp/compare/main...your-username:your-branch`

#### Want the PatternFly MCP to access more documentation?
Providing more documentation to the PatternFly MCP is what drives our unified library!

We have a few simple guidelines to make sure your subject aligns with our intent:
- **PatternFly Subject**: Added documentation should concern PatternFly as the primary subject.
- **Security**: Documentation is whitelisted to specific domains. Updates require an issue first for security.
- **Quality**: Resources should be production-ready and will be reviewed for quality and security.
- **Tooling**: Use the [Update documentation SKILL](./guidelines/skills/add-docs-links/SKILL.md) to help update related files.

---

### Step 2: Setting Up Your Workspace

> **Get a feature up and running. Try customizing the server!**
> The PatternFly MCP server is designed to be customizable. You can [wrap it in your own application](./docs/development.md#programmatic-usage) or add [MCP tool plugins](./docs/development.md#mcp-tool-plugins).

#### Tools
- [Node.js](https://nodejs.org/en/download/package-manager) (See [Engine Bumps](#maintenance-nodejs-engine-bumps) for version info)
- NPM (or equivalent package manager)
- Git configured with your GitHub account

#### Environment Setup
1. **Fork and clone** the repository.
2. **Install dependencies**: `npm install`
3. **Build and verify**: 
   ```bash
   npm run build
   npm test
   npm run test:integration
   ```
4. **Start the server**: `npm start`
5. **Test with the inspector**: `npx -y @modelcontextprotocol/inspector node dist/cli.js`

#### Windows and repository symlinks
Some paths in this repo are **symbolic links**. On Windows:
- **Enable Developer Mode** (Settings -> Privacy & security -> For developers).
- **Clone with links enabled**: `git clone -c core.symlinks=true <repository-url>`.
- If the links are already broken, delete the affected directories (e.g., `.agents/skills`) and re-clone with the setting above.

---

### Step 3: Development & Testing

#### Code Style & Conventions
- **Naming**: Use `lowerCamelCase.dot.notation` (e.g., `server.http.ts`).
- **Responsibility**: Functions should maintain a single responsibility.
- **TypeScript**: Use `unknown` over `any` where possible. Avoid overly complex generics.
- **Reuse**: Prioritize reusing existing functions over writing new ones for the same purpose.

#### Testing Procedures
- **Unit Tests**: Located in `src/__tests__/*.test.ts`. Name tests after the file they verify (e.g., `server.ts` -> `server.test.ts`).
- **E2E Tests**: Located in `tests/e2e/`. Run via `npm run test:integration`.
- **Audit Tests**: Verify data integrity via `npm run test:audit`.
- **Script Tests**: Verify GitHub Action scripts via `npm run test:scripts`.

---

### Step 4: Submitting Your Work

#### The Contributor's Agreement
By submitting a Pull Request, you acknowledge the following:
_"I have read the contribution guidelines and fulfill them with this PR. I acknowledge that my PR will be reviewed for alignment with the project's quality, security, and architectural standards."_

#### Git Workflow
1. **Fork** the repository.
2. Create a **branch** on your fork.
3. **Rebase** your branch against the `main` branch before committing work.
4. Submit a **Pull Request** using the provided template towards the `main` branch.

#### Conventional Commits
We follow [Conventional Commits](https://www.conventionalcommits.org/) to provide a consistent history.
**Format**: `<type>(<optional scope>): <issue> <description>`
- **Types**: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`.
- **Issue**: Reference the related issue (e.g., `issue/123`, `PF-123` or `[your issue prefix]-123`).
  - **Required**: `feat` commits require an issue link to pass validation.
  - **Encouraged**: All other types are encouraged to include one for traceability.
- **Description**: Keep the first line under **65 characters**. Issue numbers are excluded from this count.

> **Note**: If your PR contains multiple commits, they will be squashed before merging to maintain a clean history.

---

### The Gatekeeper & Review Process

To help your contribution reach a "review-ready" state faster, we use an automated **Gatekeeper** workflow.

#### Helpful Automation
The Gatekeeper provides immediate feedback in the workflow logs and PR comments. It helps us verify:
- ✅ A PR is linked to a GitHub issue.
- ✅ Commits follow the [Conventional Commits](#conventional-commits) format and length.
- ✅ Code follows existing style, security, and architectural patterns.
- ✅ Tests and linting pass successfully.

#### PR Labels
The Gatekeeper uses the following labels to communicate status:
- `bot:policy-ready`: All pre-checks passed! Your PR is ready for maintainer review.
- `bot:policy-hold`: Triggered by a "Perfect Storm" of identified issues (e.g., simultaneously modifying core files, excessive scope, and changing PR templates). To resolve, please reduce the scope of your changes.
- `bot:needs-cleanup`: Minor adjustments are needed (e.g., missing issue links, style violations, or failing tests).
- `bot:needs-maintainer`: Security-sensitive changes detected (e.g., `.github`, `package-lock.json`, or `scripts/`) or an unexpected error occurred. A maintainer has been notified.

---

### Maintenance: Node.js engine bumps

Node.js engine requirements are updated biannually (**Spring** and **Fall**) to ensure security and stability.
- **Target**: Latest even-numbered (LTS/Stable) versions (e.g., 20, 22, 24).
- **Criteria**: Update `package.json`, CI workflows, and documentation. Ensure all tests pass on the new target.

---

### AI Agent

#### User section
Trigger agent interaction with: **`review the repo guidelines`**.
For detailed information, see [guidelines/README.md](./guidelines/README.md).

#### Customizing Developer Experience
You can customize your agent's behavior via the git-ignored `./.agent` directory in the root of the project.

#### Noting AI Agent Contributions
Please reference [PatternFly's AI-assisted development guidelines](https://github.com/patternfly/.github/blob/main/CONTRIBUTING.md) for how to acknowledge AI agent contributions.

### Agent only
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

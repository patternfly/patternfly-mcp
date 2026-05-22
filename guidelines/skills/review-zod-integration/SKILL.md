---
name: review-zod-integration
description: Reviews Zod dependency upgrades for PatternFly MCP—maps release notes to codebase usage, runs tests, and writes a dated update report with impact tables and prioritized fixes. Use when bumping zod, on review zod, zod upgrade, zod integration review, assessing Zod breaking changes, generating a zod update report, or reviewing Dependabot/Renovate zod PRs.
---

# Review Zod Integration (PatternFly MCP)

## When to use

- User bumps or proposes bumping **`zod`** in `package.json`
- User asks for a **Zod upgrade review**, **integration review**, or **impact analysis**
- Dependabot/Renovate PR for `zod`
- User wants a report comparing **Zod release notes** to this codebase

## Workflow

1. **Versions and release notes**
   - Read `package.json`, `package-lock.json`, and `node_modules/zod/package.json` if installed.
   - Note **previous** version from `git log -1 -- package.json` or the bump PR/commit.
   - Fetch release notes for the target minor/major (release page, GitHub API, packaged changelog, or any fetch tool): `https://github.com/colinhacks/zod/releases/tag/v{VERSION}`.
   - For patch bumps within the same minor (e.g. 4.4.1 → 4.4.3), use the **minor** release notes (e.g. v4.4.0) plus patch-specific notes when present.
   - **Offline fallback:** If release notes cannot be retrieved, state that limitation and continue from `package.json`, lockfile, and the inventory/audit steps only.
   - Extract **potentially breaking**, **other fixes**, **performance**, and **locales** sections.
   - If notes are ambiguous or the bump is minor/major, follow [reference.md — Audit depth policy](reference.md#audit-depth-policy) (prefer `node_modules/zod/src/` when shipped; otherwise published entry points from `package.json` `exports`).

2. **Repo guidelines**
   - Read (do not paste into the report): `CONTRIBUTING.md`, `guidelines/agent_coding.md`, `guidelines/agent_testing.md`, `docs/development.md`.

3. **Codebase inventory**
   - Run all commands in [reference.md — Grep patterns](reference.md#grep-patterns). Read [reference.md — Key files](reference.md#key-files).
   - Record **used** vs **not used** per release-note item.
   - Apply [reference.md — Compatibility policy (Zod detection)](reference.md#compatibility-policy-zod-detection): new detection must be **additive**; do not remove `_def` or v3 paths unless release notes show a concrete conflict.

4. **Impact matrix**
   - For **every** release-note bullet (breaking, fixes, performance, locales), add one row to the report tables. Columns: **Release note**, **Used in PF MCP?** (Yes / No / Indirect — cite file or grep), **Impact** (None / Low / Medium / High), **Priority**, **Recommended fix** (or `None`). Priority rules: [reference.md — Priority rules](reference.md#priority-rules-pf-mcp).
   - Always include [reference.md — Updated P2 recommendations (Recurring)](reference.md#updated-p2-recommendations-recurring) in the report **Recommended fixes** section, even when tests pass.
   - Row patterns: [reference.md — Example impact rows](reference.md#example-impact-rows-pf-mcp).

5. **Tests**
   From repo root:

   ```bash
   npm run test:types
   npx jest --selectProjects unit
   npm run test:integration
   npm run test:audit
   ```

   - Record pass/fail counts. Full `npm test` may fail on `auditor/` ESLint—treat as pre-existing unless the bump touched `auditor/`.
   - **P0 (tests/types/runtime break):** Document failures in the report. Apply only minimal fixes needed to verify bump safety, re-run tests, and note any changes. Update snapshots only when output change is correct (`jest -u` scoped to affected files).
   - **P1 / P2:** Do not change code during this review—list fixes in the report only.

6. **Write the report**
   - **Directory:** `reports/` at repository root (gitignored). Run `mkdir -p reports` if needed; do not delete prior reports.
   - **Filename:** `YYYYMMDD-HHMMSS-zod-{semver}-update-report.md` (`YYYYMMDD-HHMMSS` = report timestamp in **UTC**, 24-hour, no separators in the time part; `{semver}` = target version without `v`, e.g. `reports/20260522-143045-zod-4.4.3-update-report.md`).
   - Use [reference.md — Report template](reference.md#report-template). Do not commit unless the user asks.

7. **User summary**
   - Report path; **executive summary verdict table** from the report (code changes required, documentation updates required, risk level—do not collapse to a single line); P0/P1/P2 counts; link to release notes.
   - Ask: *"Would you like me to proceed with the recommended P1/P2 fixes listed in the report?"*
   - Do not modify the codebase further until the user explicitly grants permission (except minimal P0 fixes from step 5).

Domain context (SDK routing, schema pipeline, peer range): [reference.md — Quick PF MCP facts](reference.md#quick-pf-mcp-facts).

## Additional resources

- [reference.md](reference.md) — grep patterns, key files, priority rules, compatibility policy, report template, example impact rows, architecture notes

## Quick checks

- [ ] Versions (from → to) and release notes captured (or offline limitation noted)
- [ ] Guidelines read; inventory grep run; compatibility policy applied
- [ ] Every release-note bullet mapped with priority
- [ ] Recurring P2s in report consolidated fixes
- [ ] `test:types`, unit, `test:integration`, `test:audit` recorded
- [ ] Report at `reports/YYYYMMDD-HHMMSS-zod-{semver}-update-report.md` (UTC)
- [ ] User asked before any P1/P2 code changes

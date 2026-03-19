---
name: add-docs-links
description: Maintains the PatternFly MCP documentation catalog in src/docs.json—add, edit, or remove entries with correct raw URLs, meta, and validation. Use when the user asks to add or register documentation links, update or fix docs.json entries, remove catalog rows, contribute to the docs catalog, or align with docs.json tests and CI audit.
---

# Add Documentation Links to docs.json

## When to use

User wants to **add**, **change**, or **remove** entries in `src/docs.json`, or fix broken / unreachable catalog links. They may paste **any GitHub URL** (blob or raw); you convert blob → raw, pick refs, verify reachability, shape entries, update `meta` and `generated`, and run tests.

For **editing or removing**: locate the entry by `path` or component key; after changes, recompute `meta.totalEntries`, `meta.totalDocs`, set `generated` to current ISO time, run `npm test`. Same constraints as adds (whitelist, unique `path`, base-hash count).

## Workflow

1. **Resolve the raw URL and ref (git hash/branch)**
   - Decide repo and file path (e.g. `patternfly/patternfly-org`, `patternfly/patternfly-react`).
   - **Why SHAs:** Pinned commit SHAs keep each `path` immutable until deliberately updated. See [reference.md](reference.md#path-raw-url).
   - Prefer an **existing ref** already in `docs.json` for that repo (keeps `baseHashes.size === 5` in unit tests). Extract from an existing entry’s `path`.
   - If a new ref is required: resolve SHA (e.g. GitHub API `GET /repos/{owner}/{repo}/commits?sha={branch}`) or use a stable tag in the raw URL.

2. **Build the raw URL (must be whitelisted)**
   - `path` must match the whitelist in `src/options.defaults.ts` (`patternflyOptions.urlWhitelist`). See [reference.md](reference.md#url-whitelist-allowed-domains).
   - **Maintainer-controlled:** Avoid changing the whitelist; new domains delay review.
   - Allowed bases: `https://patternfly.org`, `https://github.com/patternfly`, `https://raw.githubusercontent.com/patternfly`. Use **https** for every new URL.
   - GitHub raw pattern: `https://raw.githubusercontent.com/{owner}/{repo}/{ref}/{path-to-file}`.

3. **Confirm the URL is reachable**
   - Raw URL must return HTTP 200–299 (e.g. `curl -sI -o /dev/null -w "%{http_code}" "<url>"` or `tests/audit/utils/checkUrl.ts`). If unreachable, fix ref/path or do not add.

4. **Avoid duplicate paths**
   - Each `path` is unique across the file; `src/__tests__/docs.json.test.ts` fails on duplicates with a clear report. Scan before adding to avoid churn.

5. **Add or update entries**
   - Full field list and types: [reference.md — Entry format](reference.md#entry-format). Insert under the right PascalCase component key; preserve project ordering (e.g. alphabetical keys) when editing.

6. **Update `meta` and `generated`**
   - `meta.totalEntries` = number of keys in `docs`.
   - `meta.totalDocs` = total entries across all arrays.
   - `generated` = current ISO timestamp (`new Date().toISOString()`).

7. **Run unit tests and snapshots**
   - From repo root: `npm test` (or `jest --selectProjects unit --roots=src/`).
   - `docs.json.test.ts` validates duplicates, `meta`, and base-hash count. Coordinate before changing the expected base-hash count.
   - If snapshots fail after catalog changes, update them intentionally—common: `src/__tests__/docs.embedded.test.ts` (`EMBEDDED_DOCS`), and tool/resource tests under `src/__tests__/` that snapshot docs-derived output (e.g. `tool.patternFlyDocs.test.ts`, `tool.searchPatternFlyDocs.test.ts`, `resource.patternFlyDocs*.test.ts`). Use the project’s usual Jest update flow (e.g. `npm test -- -u` scoped to the failing file).

**CI:** `.github/workflows/audit.yml` runs on PRs touching `src/docs.json` or `tests/audit/**` and samples links for reachability (`tests/audit/`).

## Quick checks

- [ ] Blob URLs converted to raw; ref reused from `docs.json` when possible.
- [ ] `path` is whitelisted and uses `https`.
- [ ] Raw URL returns 2xx.
- [ ] No duplicate `path` values.
- [ ] Entry shape matches [reference.md](reference.md#entry-format); correct PascalCase key.
- [ ] `meta.totalEntries`, `meta.totalDocs`, and `generated` updated.
- [ ] `npm test` passes; snapshots updated only where catalog-driven output changed.

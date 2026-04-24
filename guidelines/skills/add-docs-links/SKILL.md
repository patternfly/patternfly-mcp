---
name: add-docs-links
description: Maintains the PatternFly MCP documentation catalog in src/docs.json—add, edit, or remove entries with correct raw URLs, meta, and validation. Use when the user asks to add or register documentation links, update or fix docs.json entries, remove catalog rows, contribute to the docs catalog, or align with docs.json tests and CI audit.
---

# Add Documentation Links to docs.json

## When to use

User wants to **add**, **change**, or **remove** rows in `src/docs.json`, or fix broken / unreachable catalog links. They may paste **any GitHub URL** (blob or raw); you convert blob → raw, pick refs, verify reachability, shape entries, update `meta` and `generated`, and run tests.

For **edits or removals**: find the row by `path` and/or its `docs` key; update `meta` / `generated`; run tests. Same rules as adds: whitelist, unique `path`, and `src/__tests__/docs.json.test.ts` (including `baseHashes`).

## Workflow

1. **Resolve raw URL and ref**
   - Map the link to `owner/repo` and file path; build **raw** `https://raw.githubusercontent.com/{owner}/{repo}/{ref}/{file}`.
   - Prefer the **same `ref`** already used in `docs.json` for that `patternfly/<repo>` (copy from an existing `path`).
   - **New** `patternfly/<repo>`: after you add URLs, `docs.json.test.ts` may need `expect(baseHashes.size)` updated—open that file; do not guess a number from this skill.
   - New ref for an existing repo: resolve SHA (e.g. commits API) or use a stable tag.

2. **Whitelist**
   - `path` must match `patternflyOptions.urlWhitelist` in `src/options.defaults.ts`. See [reference.md](reference.md#url-whitelist-allowed-domains). Use **https** only. Do not widen the whitelist in a catalog-only PR.

3. **Reachability**
   - Response must be 2xx (e.g. `curl -sI -o /dev/null -w "%{http_code}" "<url>"`). If not, fix ref or path; do not add a dead link.

4. **Unique `path`**
   - Each `path` appears once in the whole file.

5. **Placement in `docs`**
   - **New top-level key** under `docs` (e.g. `"AiHelpers"`): append as the **last property** inside `"docs": { … }` (after the current last key’s block). Do not insert mid-file by theme or alphabet.
   - **New object** in an **existing** key’s array: append to the **end of that array** unless the user specifies order.
   - **Edits**: keep the same key and array index unless the user asks to move.

6. **Entry shape**
   - Fields and types: [reference.md — Entry format](reference.md#entry-format). Copy `section` / `category` from the closest similar row when unsure.

7. **`meta` and `generated`**
   - `meta.totalEntries` = number of keys in `docs`.
   - `meta.totalDocs` = total objects across all arrays.
   - `generated` = `new Date().toISOString()`.

8. **Tests**
   - From repo root: `npm test` or `jest --selectProjects unit --roots=src/`.
   - If snapshots fail, update only where the catalog drives output (`docs.embedded`, `tool.patternFly*`, `resource.patternFlyDocs*`), e.g. scoped `npm test -- -u path/to/file.test.ts`.

**CI:** `.github/workflows/audit.yml` on PRs that touch `src/docs.json` or `tests/audit/**`.

## Quick checks

- [ ] Blob → raw; ref reused per repo when possible.
- [ ] `path` whitelisted, **https**, 2xx.
- [ ] No duplicate `path`.
- [ ] New **keys** at **end** of `docs`; new **array rows** at **end** of the target array.
- [ ] `meta` and `generated` updated.
- [ ] New `patternfly/<repo>`: `docs.json.test.ts` `baseHashes` expectation still matches.
- [ ] Tests pass; snapshots updated only if catalog-driven output changed.

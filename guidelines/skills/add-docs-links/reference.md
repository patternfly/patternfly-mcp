# docs.json Reference

## File location

- Catalog: `src/docs.json`
- Unit test: `src/__tests__/docs.json.test.ts`
- Link audit: `tests/audit/docs.audit.test.ts` (samples links and checks reachability)
- **CI:** `.github/workflows/audit.yml` runs a daily audit (and on PRs that change `src/docs.json` or `tests/audit/**`), executing the audit tests so links in `docs.json` are periodically checked for reachability.

## Top-level structure

Illustrative shape only—**do not copy** `generated`, `meta.totalEntries`, or `meta.totalDocs` from this block; those must always match the real `src/docs.json` after your edit (and `meta` is validated by unit tests).

```json
{
  "version": "1",
  "generated": "<ISO-8601 UTC from Date.prototype.toISOString()>",
  "meta": {
    "totalEntries": "<number of keys in docs>",
    "totalDocs": "<total entry count across all arrays>",
    "source": "patternfly-mcp-internal"
  },
  "docs": {
    "ComponentName": [ /* array of entries */ ]
  }
}
```

- `meta.totalEntries`: number of keys in `docs` (component count).
- `meta.totalDocs`: total number of doc entries across all keys.
- `docs`: keys are PascalCase component names; values are arrays of entry objects.

## Entry format

Each entry in `docs.<ComponentName>[]`:

| Field         | Type   | Example |
|---------------|--------|---------|
| `displayName` | string | `"About Modal"` |
| `description` | string | `"Design Guidelines for the about modal component."` |
| `pathSlug`    | string | `"about-modal"` |
| `section`     | string | `"components"` |
| `category`    | string | Match sibling entries in `docs.json` for the same kind of doc (e.g. `design-guidelines`, `react`, `accessibility`); the catalog uses additional values—copy an existing entry’s `category` when unsure. |
| `source`      | string | `"github"` |
| `path`        | string | Full raw GitHub URL (see below) |
| `version`     | string | `"v6"` \| `"v5"` |

### path (raw URL)

- Pattern: `https://raw.githubusercontent.com/{owner}/{repo}/{ref}/{path-to-file}`
- `ref`: branch name, tag (e.g. `v5`), or **commit SHA** (preferred for v6 org/react-style links).

**Why commit SHAs are used (instead of only `main` / a moving branch):** A pinned SHA makes the fetched doc **immutable** for that URL: the catalog always resolves to the same file content until someone intentionally updates the ref. Branch heads change as upstream merges; without a pin, links could silently point at different text, break if files move, or make audits and support harder to reason about. Tags (e.g. `v5`) can also pin a release line; the project still limits how many distinct refs it tracks (see unit test `baseHashes`).

- Example: `https://raw.githubusercontent.com/patternfly/patternfly-org/2d5fec39ddb8aa32ce78c9a63cdfc1653692b193/packages/documentation-site/patternfly-docs/content/components/about-modal/about-modal.md`
- **Must be whitelisted:** see [URL whitelist](#url-whitelist-allowed-domains) below.

## URL whitelist (allowed domains)

External paths and references are limited by a PatternFly URL whitelist so the server only fetches from allowed origins.

- **Defined in:** `src/options.defaults.ts` → `PATTERNFLY_OPTIONS` → `patternflyOptions.urlWhitelist`
- **Used by:** `tool.patternFlyDocs` (validates `urlList` via `assertInputUrlWhiteListed`); matching logic in `server.helpers.ts` → `isWhitelistedUrl`.
- **Default entries (prefix match):**
  - `https://patternfly.org` — patternfly.org and subdomains (e.g. `www.patternfly.org`, `v6.docs.patternfly.org`)
  - `https://github.com/patternfly` — any path under `github.com/patternfly`
  - `https://raw.githubusercontent.com/patternfly` — any path under `raw.githubusercontent.com/patternfly` (e.g. `patternfly-org`, `patternfly-react`)
- **Protocols:** `urlWhitelistProtocols` may include both `http` and `https` in server configuration. **For `docs.json`:** always use `https://` URLs only; do not add new `http://` catalog paths.

Any new `path` in `docs.json` must match one of these prefixes (protocol + host + path prefix). URLs that do not match will be rejected when the tool is used with a `urlList` or when the server fetches by path.

**Maintainer-controlled:** The whitelist is controlled at the maintainer level. It is recommended to avoid updating it; if it is modified, your contribution will be delayed while the new whitelisted domain is reviewed.

## Duplicate check

- Every `path` in the file must be **unique** across all entries.
- **Automatically enforced by unit test:** `src/__tests__/docs.json.test.ts` builds a map of each `path` to the list of entries that use it; if any path has more than one entry, the test fails and reports each duplicate path and which component/category entries reference it. Run `npm test` to confirm no duplicates. Optionally, before adding an entry, collect all `path` values (e.g. `Object.values(docs.docs).flat().map(e => e.path)`) to avoid a failing test.

## GitHub ref (hash) lookup

- **Use existing refs**: Prefer the ref already used in `docs.json` for that repo (same owner/repo). Extract the ref from an existing `path`: the segment after `raw.githubusercontent.com/owner/repo/` and before the next `/`.
- **New ref via API**: For branch `main` of `patternfly/patternfly-org`:
  - `GET https://api.github.com/repos/patternfly/patternfly-org/commits/main` (or `commits?sha=main`) and use the response `sha` in the raw URL.
- **Confirm raw URL**: After building the URL, fetch it (e.g. `curl -sI` or the project’s `checkUrl`) and ensure HTTP 200–299.

## Unit test constraints

From `src/__tests__/docs.json.test.ts`:

1. No duplicate `path` values.
2. `meta.totalEntries` === number of keys in `docs`.
3. `meta.totalDocs` === total number of entries in all arrays.
4. Number of unique “base hashes” (refs per repo) is **5** (v6 org, v6 react, v5 org, codemods, ai-helpers). When adding links, use existing refs so this count does not change unless the project explicitly adds a new source.

## Example new entry

```json
{
  "displayName": "New Component",
  "description": "Design Guidelines for the new component.",
  "pathSlug": "new-component",
  "section": "components",
  "category": "design-guidelines",
  "source": "github",
  "path": "https://raw.githubusercontent.com/patternfly/patternfly-org/2d5fec39ddb8aa32ce78c9a63cdfc1653692b193/packages/documentation-site/patternfly-docs/content/components/new-component/new-component.md",
  "version": "v6"
}
```

Place under `docs["NewComponent"]` (or the correct PascalCase key); create the key if it does not exist.

# docs.json Reference

## File location

- Catalog: `src/docs.json`
- Unit test: `src/__tests__/docs.json.test.ts`
- Link audit: `tests/audit/docs.audit.test.ts`
- CI: `.github/workflows/audit.yml` (daily + PRs that touch `src/docs.json` or `tests/audit/**`)

## Top-level structure

Illustrative only—**do not copy** `generated`, `meta.totalEntries`, or `meta.totalDocs` from examples; recompute from the real file after edits.

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

- `meta.totalEntries`: count of keys in `docs`.
- `meta.totalDocs`: sum of array lengths under `docs`.
- `docs`: string keys → arrays of entry objects.

## Entry format

Each object in `docs.<Key>[]`:

| Field         | Type   | Example |
|---------------|--------|---------|
| `displayName` | string | `"About Modal"` |
| `description` | string | `"Design Guidelines for the about modal component."` |
| `pathSlug`    | string | `"about-modal"` |
| `section`     | string | `"components"` |
| `category`    | string | Reuse the same `category` as similar rows (e.g. `design-guidelines`, `react`, `accessibility`). |
| `source`      | string | `"github"` |
| `path`        | string | Full raw GitHub URL (see below) |
| `version`     | string | `"v6"` \| `"v5"` |

### path (raw URL)

- Pattern: `https://raw.githubusercontent.com/{owner}/{repo}/{ref}/{path-to-file}`
- `ref`: branch, tag (e.g. `v5`), or **SHA** (preferred for moving upstream trees).

**Pinned refs:** A SHA (or stable tag) fixes content for that URL until you bump it deliberately. Moving branch heads can change or break files without notice.

**`baseHashes`:** The test counts distinct ref segments per `patternfly/<repo>` on raw URLs. The allowed total is **only** in `src/__tests__/docs.json.test.ts` (`baseHashes`, `expect(baseHashes.size)`). Reuse an existing ref per repo when you can; if you add a **new** `patternfly/<repo>`, update that test and mention it in the PR.

- Example: `https://raw.githubusercontent.com/patternfly/patternfly-org/2d5fec39ddb8aa32ce78c9a63cdfc1653692b193/packages/documentation-site/patternfly-docs/content/components/about-modal/about-modal.md`
- **Whitelist:** [URL whitelist](#url-whitelist-allowed-domains) below.

## URL whitelist (allowed domains)

Defined in `src/options.defaults.ts` → `patternflyOptions.urlWhitelist`. Used when validating/fetching paths.

- **Prefixes:** `https://patternfly.org`, `https://github.com/patternfly`, `https://raw.githubusercontent.com/patternfly`
- **`docs.json`:** use **https** only.

Paths must match a prefix or the server rejects them. Avoid widening the whitelist in catalog-only PRs.

## Duplicate check

Each `path` is unique file-wide. `docs.json.test.ts` fails with a duplicate report if not.

## GitHub ref (hash) lookup

- **Reuse ref:** For the same `patternfly/<repo>`, copy the `ref` segment from an existing catalog `path` (text between `…/repo/` and the next `/`).
- **Resolve SHA:** e.g. `GET https://api.github.com/repos/patternfly/patternfly-org/commits/main` → use returned `sha` in the raw URL.
- **Verify:** 2xx on the final raw URL before merging.

## Unit test constraints

From `src/__tests__/docs.json.test.ts`:

1. No duplicate `path` values.
2. `meta.totalEntries` === number of keys in `docs`.
3. `meta.totalDocs` === total entries in all arrays.
4. **`baseHashes`:** see `path (raw URL)` above—single source of truth is that test file.

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

Add under `docs["NewComponent"]` (or the correct key). **New top-level keys** go **last** inside `docs` (see SKILL workflow step 5).

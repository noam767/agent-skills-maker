# CLI Contract: `scrape-confluence.js`

Location: `scripts/scrape-confluence.js`

Invocation:

```bash
node scripts/scrape-confluence.js --space <SPACE_KEY> [--max-depth <N>] [--label <name>] [--ancestor <pageId>]
```

## Arguments

| Flag | Required | Default | Description |
|------|----------|---------|-------------|
| `--space <KEY>` | yes | — | Confluence space key (e.g., `ENG`, `DEVOPS`). Overrides `CONFLUENCE_SPACE_KEY`. |
| `--max-depth <N>` | no | `3` | Maximum ancestor depth to traverse. |
| `--label <name>` | no | none | Only include pages with this label. May be repeated. |
| `--ancestor <pageId>` | no | none | Only include descendants of this page id. |
| `--help` | no | — | Print usage and exit 0. |

## Environment variables

| Name | Required | Notes |
|------|----------|-------|
| `CONFLUENCE_BASE_URL` | yes | Full prefix for the on-prem Confluence instance, no trailing slash. May include a context path. Examples: `https://confluence.acme.corp`, `https://intranet.acme.corp/confluence`. The client unconditionally appends `/rest/api/...`. |
| `CONFLUENCE_PAT` | yes | Personal Access Token minted at `<CONFLUENCE_BASE_URL>/plugins/personalaccesstokens/usertokens.action`. Sent as `Authorization: Bearer <token>`. |
| `CONFLUENCE_SPACE_KEY` | no | Fallback if `--space` not given. |

**TLS note**: The client always disables certificate verification
(`rejectUnauthorized: false`). This is intentional — the target deployment
is an air-gapped on-prem network where the operator trusts the destination
host. Do not point this scraper at any URL outside that trust boundary.

## stdout

Single JSON document conforming to `scraped-output.schema.json`. No prefix,
no suffix, no log lines — only the JSON document. Suitable for piping into
`jq` or for ingestion by Claude.

## stderr

Human-readable progress lines, e.g.:

```text
[scrape] space=ENG base=https://confluence.acme.corp maxDepth=unbounded
[scrape] fetched page 1/47: Onboarding
[scrape] fetched page 2/47: Runbooks
...
[scrape] done; 47 pages in 18.4s
```

Errors:

```text
[scrape] ERROR: missing required env var CONFLUENCE_PAT
[scrape] ERROR: HTTP 401 from /rest/api/space/ENG — check CONFLUENCE_PAT
[scrape] ERROR: space "BOGUS" not found (HTTP 404)
```

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | Success; JSON document written to stdout. |
| 1 | Unexpected failure (network, parsing). |
| 2 | Configuration error (missing env var, invalid space key). |
| 3 | Auth failure (HTTP 401/403). |
| 4 | Space or ancestor not found (HTTP 404). |

## Determinism

Given identical Confluence content and identical arguments, the output JSON
SHOULD be byte-identical except for the `scrapedAt` timestamp. `pages` are
ordered by BFS traversal; within a depth tier they are ordered by Confluence
page id ascending.

# Bootstrap Flow (Claude-facing)

> Canonical source: `core/specs/001-confluence-agent-builder/contracts/orchestration.md`.
> This file is a hand-readable mirror. If the two diverge, the spec wins.
> Companion guide: [`./README.md`](./README.md). Project code lives in
> the sibling `core/` directory; paths below are relative to `core/`.

When a team member asks Claude to "use this repo on the `<SPACE>` Confluence
space", Claude follows the steps below. The repo's Node helper does I/O only;
Claude is the orchestrator.

## Deployment context

Target environment is **on-prem Confluence Data Center inside an air-gapped
network**. No Atlassian Cloud. The scraper hits
`<CONFLUENCE_BASE_URL>/rest/api/...` with an authentication scheme configured via `CONFLUENCE_AUTH_SCHEME`.

**Auth Scheme Comparison:**

| Scheme | Target Env | `CONFLUENCE_PAT` format | Header |
| :--- | :--- | :--- | :--- |
| `Bearer` | On-Prem DC | Raw PAT Token | `Bearer ...` |
| `Basic` | Cloud / Legacy | `base64(user:pass)` | `Basic ...` |

TLS verification is disabled by design (research.md R11).

## Step 1 — Pick the data path

- If a Confluence or Atlassian **MCP** tool is available in the current
  Claude Code session, use it for all data retrieval. Don't shell out.
- Otherwise, fall through to the REST path: shell out to
  `node scripts/scrape-confluence.js --space <KEY>` and parse stdout as JSON.

## Step 2 — Verify prerequisites (REST path only)

Before invoking the scraper, confirm:

- `CONFLUENCE_BASE_URL` is set and reachable.
- `CONFLUENCE_PAT` is set.

If either is missing, stop and point the user at `.env.example`.

## Step 3 — Scrape

Invoke the scraper (or the MCP tool) with appropriate filters:

```bash
node scripts/scrape-confluence.js --space ENG --max-depth 3
node scripts/scrape-confluence.js --space ENG --label runbook --ancestor 12345
```

The scraper emits a `ScrapedOutput` JSON document on stdout. The shape is
defined by `specs/001-confluence-agent-builder/contracts/scraped-output.schema.json`.

## Step 4 — Derive a KnowledgeSummary

Read the scraped pages and produce a structured summary covering:

- `teamPurpose` — one-paragraph statement.
- `tools` — what the team uses (internal/external/infra/observability/data).
- `servicesProvisioned` — what the team offers other teams.
- `historicalIncidents` — postmortems and outages worth remembering.
- `commonIssues` — recurring problems + standard responses.
- `bestPractices` — codified team guidance.
- `sources` — page ids/urls cited by the above.

**Rules**:
- Every non-source entry MUST cite ≥1 source page in `sourcePageIds`.
- If a category has no support in the scraped content, return `[]`, not a
  placeholder.

## Step 5 — Pick artefacts to generate

- **Agent candidates** = distinct, repeatable workflows the team performs.
- **Skill candidates** = discrete invocable procedures triggered by a clear
  user request.

Aim for ≥3 meaningful artefacts (SC-002). Skip candidates with weak
Confluence support.

## Step 6 — Generate

For each candidate, invoke the right subagent:

- `meta-agent` for agent definitions → writes `.claude/agents/<name>.md`.
- `skill-creator` for skill bundles → writes `.claude/skills/<name>/SKILL.md`.

Pass the candidate's relevant slice of the `KnowledgeSummary` plus citations
(page titles + URLs) so the generated artefact stays grounded.

## Step 7 — Report

Summarise to the user:

- Files written (paths + count).
- Candidates skipped, with reasons.
- Pages skipped (depth, empty body, etc.).

## Failure modes

| Trigger | Behaviour |
|---------|-----------|
| Neither MCP nor required env vars | Stop; point user at `.env.example`. |
| `scrape-confluence.js` exits non-zero | Stop; surface the stderr verbatim. |
| Space returns zero pages | Stop; "space '<KEY>' is empty — nothing to generate." |
| Subagent invocation fails | Continue with other candidates; note failure in the final report. |

## Re-run semantics

Re-runs are idempotent at the scraper level (no cache) and overwrite-with-
warning at the artefact level. Filter flags (`--label`, `--ancestor`) make
targeted refresh practical.

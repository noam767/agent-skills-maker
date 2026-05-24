# bootstrap-team flow (Roo Code)

Canonical contract: `specs/001-confluence-agent-builder/contracts/orchestration.md`.

The user should only have to provide three things: how to reach Confluence
(MCP server OR base URL + token), and the space key. Do not ask for
anything else; every knob has a sensible default.

## What the user provides

1. **A Confluence connection** — a Confluence/Atlassian MCP server in this
   Roo session OR `CONFLUENCE_BASE_URL`, `CONFLUENCE_PAT`, and
   `CONFLUENCE_AUTH_SCHEME` in `.env`.
2. **The space identifier** — key or a URL whose `<KEY>` you extract after
   `/spaces/`. If not in the prompt, ask once.

Do not ask for max-depth, labels, ancestors, or any other knob.

## Step 1 — Detect data path
- MCP available → use it for ALL data retrieval.
- No MCP → REST. If env vars missing, run interactive setup (Step 2).
- Never mix.

## Step 2 — Interactive setup (REST path only, if env missing)
Ask for: base URL (e.g. `https://confluence.acme.corp`), Personal Access
Token (mint at
`<CONFLUENCE_BASE_URL>/plugins/personalaccesstokens/usertokens.action`),
and auth scheme (`Bearer`, default). Append to `.env`. Do not overwrite
existing keys without confirming.

## Step 3 — Scrape (REST)
Use Roo's `command` group to run:
```bash
node scripts/scrape-confluence.js --space <KEY>
```
Defaults to `--max-depth 3`. Non-zero exit → stop, surface stderr.

## Step 4 — Derive KnowledgeSummary
`teamPurpose`, `tools`, `servicesProvisioned`, `historicalIncidents`,
`commonIssues`, `bestPractices`, `sources`. Every non-source entry cites ≥1
page. Empty categories → `[]`, never placeholders.

## Step 5 — Pick candidates
- Agent candidates = workflows.
- Skill candidates = discrete procedures.
Aim for ≥3 meaningful artefacts.

## Step 6 — Generate via mode handoff
For each agent candidate: `switch_mode` → `meta-agent` mode with the
candidate purpose + KnowledgeSummary slice + citations. The meta-agent mode
appends a new entry to `.roomodes` and a rules folder at
`.roo/rules-<slug>/`.

For each skill candidate: `switch_mode` → `skill-creator` mode. The skill
mode produces `.roo/rules-<slug>/` with `01-procedure.md` plus any
supporting `scripts/`, `reference/`, `templates/`, `fixtures/`.

## Step 7 — Report
Files written + paths, candidates skipped + reasons, pages skipped, overwrites.

## Failure modes
- Neither MCP nor env vars (after setup) → stop with what's still missing.
- Scraper non-zero exit → stop, surface stderr verbatim.
- Empty space → stop: "space '<KEY>' is empty — nothing to generate."
- Mode-handoff failure → continue with other candidates, note in the report.

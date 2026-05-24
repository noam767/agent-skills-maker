---
description: Scrape a team's Confluence space and generate OpenCode agents + commands from it.
agent: build
---

# /bootstrap-team — Confluence → Agents & Commands (OpenCode)

You are running the project's bootstrap flow on the team's Confluence
space. The user should only have to provide three things: how to reach
Confluence (MCP server OR base URL + token), and the space key. Don't ask
for anything else; every knob has a sensible default.

Canonical contract: `specs/001-confluence-agent-builder/contracts/orchestration.md`.

## What the user provides

1. **A Confluence connection** — one of:
   - A Confluence/Atlassian MCP server configured in this OpenCode session, OR
   - `CONFLUENCE_BASE_URL`, `CONFLUENCE_PAT`, `CONFLUENCE_AUTH_SCHEME` in `.env`.
2. **The space identifier** — a key, or a space URL whose `<KEY>` you extract
   after `/spaces/`. May come in via `$ARGUMENTS`, or you may need to ask once.

Do not ask for max-depth, labels, ancestors, or any other knob.

## Step 1 — Detect data path (MCP-first)

Check available tools for any containing `confluence`, `atlassian`, or
`jira+confluence`.
- MCP available → use it for ALL data retrieval.
- No MCP → REST path. If env vars missing, run interactive setup (see Step 2).
- Never mix the two.

## Step 2 — Interactive setup (REST path only, if env missing)

Ask the user for: base URL (e.g. `https://confluence.acme.corp`), Personal
Access Token (minted at
`<CONFLUENCE_BASE_URL>/plugins/personalaccesstokens/usertokens.action`),
and auth scheme (`Bearer`, default). Append to `.env`. Do not overwrite
existing keys without confirming.

## Step 3 — Scrape

REST path:
```bash
node scripts/scrape-confluence.js --space <KEY>
```
Defaults to `--max-depth 3`. Non-zero exit → stop, surface stderr.

## Step 4 — Derive KnowledgeSummary

`teamPurpose`, `tools`, `servicesProvisioned`, `historicalIncidents`,
`commonIssues`, `bestPractices`, `sources`. Every non-source entry cites ≥1
page. Empty categories → `[]`, never placeholders.

## Step 5 — Pick candidates

Agents = workflows. Commands = procedures. Aim ≥3 meaningful artefacts.

## Step 6 — Generate

For each agent candidate, invoke `@meta-agent`; outputs to
`.opencode/agent/<name>.md`. For each command candidate, invoke
`@skill-creator`; outputs to `.opencode/command/<name>.md` (plus a sibling
`.opencode/command/<name>/` for `scripts/`, `reference/`, etc. when the
procedure needs them).

## Step 7 — Report

Files written + paths, candidates skipped + reasons, pages skipped, overwrites.

## Failure modes

Same as the canonical contract. Stop on missing creds (after setup), empty
space, or non-zero scraper exit; continue past individual subagent failures
and note in the final report.

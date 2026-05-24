---
description: Scrape a team's Confluence space and generate Claude Code agents + skills from it.
argument-hint: [<SPACE_KEY>]
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent
---

# /bootstrap-team — Confluence → Agents & Skills

You are running the project's full bootstrap flow on the team's Confluence
space. The user should only have to provide three things: how to reach
Confluence (MCP server OR base URL + token), and the space key. Don't ask for
anything else; every other knob has a sensible default.

The canonical contract is
`specs/001-confluence-agent-builder/contracts/orchestration.md`; the
human-readable mirror is `../guides/bootstrap-flow.md`.

## What the user provides

1. **A Confluence connection** — one of:
   - A Confluence/Atlassian MCP server already configured in this session, OR
   - `CONFLUENCE_BASE_URL`, `CONFLUENCE_PAT`, and `CONFLUENCE_AUTH_SCHEME`
     in `.env` (see `.env.example`).
2. **The space identifier** — a key (`ENG`, `DEVOPS`) or a full space URL
   (you extract the key from the path segment after `/spaces/`). May come in
   as `$ARGUMENTS`, or you may need to ask.

If the user types `/bootstrap-team` with no argument, ask once for the space
key. Do not ask for max-depth, labels, ancestors, or any other knob — those
use sensible defaults internally.

## Step 1 — Detect the data path (MCP-first, MANDATORY)

Check the available tools in this session for any name containing
`confluence`, `atlassian`, or `jira+confluence`.

- **MCP available** → use it for ALL data retrieval (space metadata, page
  listing, bodies, ancestors, labels). Do NOT shell out to the Node scraper.
- **No MCP** → use the REST path. Proceed to Step 2.
- **Never mix** MCP and REST in a single run.
- If MCP is present but lacks a tool you'd need, surface the gap to the user
  and ask before falling through to REST.

## Step 2 — Make sure REST creds are configured

If `CONFLUENCE_BASE_URL` and `CONFLUENCE_PAT` are missing from the
environment, run the interactive setup:

1. Tell the user which variables are missing.
2. Ask them for:
   - the Confluence base URL (e.g. `https://confluence.acme.corp`),
   - the Personal Access Token (PAT),
   - the auth scheme — `Bearer` (default for on-prem DC PATs).
3. Append them to `.env` (don't overwrite existing keys without confirming).
   The PAT comes from the user's profile at
   `<CONFLUENCE_BASE_URL>/plugins/personalaccesstokens/usertokens.action`.
   Re-load the env so the scraper sees them. Example for PowerShell:
   ```powershell
   Get-Content .env | ForEach-Object {
     if ($_ -match '^(\w+)=(.*)$') {
       [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2])
     }
   }
   ```
4. Only then proceed.

## Step 3 — Scrape

REST path (from repo root):

```bash
node scripts/scrape-confluence.js --space <KEY>
```

Internally the scraper defaults to `--max-depth 3`, no label filter, no
ancestor filter. Do not surface these flags to the user. If a power user
explicitly asks for a narrower or deeper traversal, you may pass
`--max-depth N` (1–10) or `--label X` / `--ancestor ID` — but never proactively.

MCP path: enumerate the space pages via the MCP tool's listing call;
for each page, fetch body, ancestors, and labels. Cap at depth 3.

If the scraper exits non-zero, stop and surface stderr verbatim.

## Step 4 — Derive a KnowledgeSummary

Reason over the retrieved pages and produce an in-memory summary matching
`contracts/knowledge-summary.schema.json`: `teamPurpose`, `tools`,
`servicesProvisioned`, `historicalIncidents`, `commonIssues`,
`bestPractices`, `sources`.

Rules:
- Every non-source entry MUST cite ≥1 source page in `sourcePageIds`.
- If a category has no support in the scraped content, return `[]` — never
  a placeholder. Do not invent facts.

## Step 5 — Pick candidates

- **Agent candidates** — distinct, repeatable workflows the team performs.
- **Skill candidates** — discrete, invocable procedures triggered by a clear
  user request.

Aim for ≥3 meaningful artefacts (SC-002). Skip candidates with weak
Confluence support. Don't pad the count with low-signal artefacts.

## Step 6 — Generate via subagents

For each candidate, invoke the right subagent — in parallel where possible:

- **Agent candidate** → `meta-agent` subagent → `.claude/agents/<name>.md`.
- **Skill candidate** → `skill-creator` subagent → `.claude/skills/<name>/`
  (a directory: `SKILL.md` plus any supporting `scripts/`, `reference/`,
  `templates/`, `fixtures/` the skill needs).

Each subagent prompt MUST include:
- The candidate's purpose (one paragraph).
- The relevant slice of the `KnowledgeSummary` (only the tools/services/issues/
  practices that apply).
- Citations: page titles + URLs so the generated artefact stays grounded.

If a subagent invocation fails, continue with the remaining candidates and
note the failure in the final report.

## Step 7 — Report back

Summarise to the user:

- Files written (paths + count for agents and skills).
- Candidates skipped, with reasons.
- Pages skipped (e.g. empty body, depth cap).
- Any overwrite warnings.

## Failure modes (mirror of orchestration.md)

| Trigger | Behaviour |
|---|---|
| Neither MCP nor required env vars (after interactive setup) | Stop; tell the user what's still missing. |
| `scrape-confluence.js` exits non-zero | Stop; surface stderr verbatim. |
| Space returns zero pages | Stop: "space '<KEY>' is empty — nothing to generate." |
| Subagent invocation fails | Continue with the other candidates; note in the final report. |

## Re-run semantics

Re-runs re-scrape (no cache) and overwrite existing artefacts at the same
paths, warning on overwrite. Re-running on the same space after Confluence
content changes is the expected refresh path. For a targeted refresh of just
one section, a power user can run the scraper directly with `--label` or
`--ancestor`; the slash command does not expose these.

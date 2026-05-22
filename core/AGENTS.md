# AGENTS.md — Instructions for AI Coding Assistants

This file is the canonical instruction set for any AI agent (Claude Code,
Cursor, Aider, etc.) operating in this repository. It is loaded automatically
by tools that follow the AGENTS.md convention.

## Project purpose

Generate Claude Code **agents** and **skills** for teams, grounded in their
on-prem **Confluence Data Center** knowledge base. The Node helper does I/O;
the AI agent orchestrates the workflow and invokes the `meta-agent` and
`skill-creator` subagents to produce artefacts.

## Deployment context

- **On-prem Confluence Data Center** inside an **air-gapped network**.
- **Atlassian Cloud is out of scope.**
- Authentication: Bearer Personal Access Token (`Authorization: Bearer <token>`).
- TLS verification is disabled in the scraper by design (closed network).
  See `specs/001-confluence-agent-builder/research.md` R11.

## Bootstrap workflow — MCP-first rule (MANDATORY)

When the user asks to "use this repo on the <SPACE>" or "generate agents for
our team":

### Step 1 — Check for an Atlassian/Confluence MCP server FIRST

Before doing anything else, inspect the available MCP tools in the current
session. Look for tool names containing any of:

- `confluence`
- `atlassian`
- `jira` (only if it also exposes Confluence-shaped operations)

**If found**: use the MCP tool for ALL Confluence data retrieval — space
metadata, page listing, page bodies, ancestors, labels. Do **not** invoke
the Node scraper.

**If not found**: proceed to Step 2.

### Step 2 — Fall back to REST via the Node scraper

If and only if no MCP tool is available:

1. Verify env vars: `CONFLUENCE_BASE_URL`, `CONFLUENCE_PAT`. If either is
   missing, stop and point the user at `.env.example`. Do not invent values.
2. Invoke:

   ```bash
   node scripts/scrape-confluence.js --space <KEY> [--max-depth N] [--label X] [--ancestor pageId]
   ```

3. Parse stdout as JSON conforming to
   `specs/001-confluence-agent-builder/contracts/scraped-output.schema.json`.
4. Handle non-zero exit codes per `contracts/scrape-confluence.cli.md`
   (2 config, 3 auth, 4 not-found, 1 unexpected). Surface stderr verbatim.

### Step 3 — Derive a KnowledgeSummary

Shape per `contracts/knowledge-summary.schema.json`:

- `teamPurpose`, `tools`, `servicesProvisioned`, `historicalIncidents`,
  `commonIssues`, `bestPractices`, `sources`.
- Every non-source entry MUST cite ≥1 page in `sourcePageIds`.
- If a category has no support, return `[]` — never invent.

### Step 4 — Generate artefacts

For each candidate workflow, invoke the appropriate subagent:

- **Agent definitions** → `.claude/agents/meta-agent.md` writes
  `.claude/agents/<name>.md`.
- **Skill bundles** → `.claude/agents/skill-creator.md` writes
  `.claude/skills/<name>/SKILL.md`.

Pass the relevant slice of the `KnowledgeSummary` plus citations to each
subagent invocation.

### Step 5 — Report

Tell the user: files written (paths + count), candidates skipped (with
reasons), pages skipped.

## Hard rules

- **NEVER** call Atlassian Cloud endpoints (`*.atlassian.net`). Only the
  configured on-prem `CONFLUENCE_BASE_URL`.
- **NEVER** add `WebFetch` or `WebSearch` to generated agent tool lists.
  Constitution principles III + IV.
- **NEVER** mix MCP and REST retrieval in the same run.
- **NEVER** invent Confluence content. If the page set returns empty,
  report "space is empty — nothing to generate" and stop.
- **NEVER** run `npm install` at runtime. The Node helper uses only Node
  built-ins (Constitution III).

## Where to look

| Topic | File |
|-------|------|
| Project constitution | `.specify/memory/constitution.md` |
| Feature spec | `specs/001-confluence-agent-builder/spec.md` |
| Implementation plan | `specs/001-confluence-agent-builder/plan.md` |
| Workflow contract | `specs/001-confluence-agent-builder/contracts/orchestration.md` |
| Scraped-output schema | `specs/001-confluence-agent-builder/contracts/scraped-output.schema.json` |
| Knowledge-summary schema | `specs/001-confluence-agent-builder/contracts/knowledge-summary.schema.json` |
| Scraper CLI contract | `specs/001-confluence-agent-builder/contracts/scrape-confluence.cli.md` |
| User-facing guide | `../guides/README.md` |
| Claude-facing flow mirror | `../guides/bootstrap-flow.md` |
| Meta-agent (agent generator) | `.claude/agents/meta-agent.md` |
| Skill-creator (skill generator) | `.claude/agents/skill-creator.md` |

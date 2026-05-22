# Orchestration Contract: Claude-Driven Bootstrap Flow

This contract defines the workflow **Claude** follows when a team member runs
the project on a Confluence space. The Node helper is the I/O layer; Claude
is the orchestrator. The flow is identical whether triggered via a slash
command (future) or by a free-form user prompt such as "use this on the ENG
space".

## Inputs Claude must obtain

1. **Space identifier** — a space key (`ENG`, `DEVOPS`) or a space URL
   (`https://acme.atlassian.net/wiki/spaces/ENG/overview`). If only a URL is
   given, Claude extracts the key from the path segment after `/spaces/`.
2. **Confidence that credentials are configured** — Claude must verify
   `CONFLUENCE_BASE_URL`, `CONFLUENCE_EMAIL`, `CONFLUENCE_API_TOKEN` exist
   before launching the REST path. (Skipped when using MCP.)

## Step-by-step flow

### Step 1 — Detect the data path

- If a Confluence/Atlassian MCP tool is available in the current session,
  use it for all data retrieval. Do **not** call the Node scraper.
- Otherwise, fall through to the REST path.

### Step 2 — Retrieve content

- **MCP path**: enumerate space pages via the MCP tool's listing call; for
  each page, fetch body, ancestors, and labels. Stop traversal at depth 3
  (or user-supplied depth).
- **REST path**: shell out to `node scripts/scrape-confluence.js --space <KEY>`
  with appropriate `--max-depth` / `--label` / `--ancestor` flags. Parse the
  stdout JSON as a `ScrapedOutput`.

### Step 3 — Produce a `KnowledgeSummary`

Reason over the retrieved pages and emit a structured summary conforming to
`knowledge-summary.schema.json`. This is an in-memory artefact (Claude's
working context); it is not written to disk by default.

Rules:
- Every entry in `tools`, `servicesProvisioned`, `historicalIncidents`,
  `commonIssues`, `bestPractices` MUST cite at least one Confluence page in
  its `sourcePageIds`.
- Do not invent facts. If a category has no supporting content, emit an
  empty array — not a placeholder.

### Step 4 — Decide what to generate

From the `KnowledgeSummary`, identify candidate artefacts:

- **Agent candidates**: distinct, repeatable workflows the team performs
  (e.g., "Triage prod alerts", "Run schema migration"). One agent per
  workflow.
- **Skill candidates**: discrete, invocable procedures triggered by a clear
  user request (e.g., "Generate a postmortem", "Validate a deployment
  manifest"). One skill per procedure.

Aim for at least 3 meaningful artefacts overall (SC-002). Stop when remaining
candidates have weak Confluence support.

### Step 5 — Invoke subagents

For each agent candidate, invoke the `meta-agent` subagent with a prompt
that contains:
- The candidate's purpose.
- The relevant slice of the `KnowledgeSummary` (tools, services, issues,
  practices that apply).
- Citations (page titles + URLs) so the generated agent can reference them.

For each skill candidate, invoke the `skill-creator` subagent with the
analogous slice.

### Step 6 — Report

After all subagent invocations complete, summarise to the user:
- Number of agents generated (with file paths).
- Number of skills generated (with file paths).
- Any candidates that were skipped, with the reason.
- Any Confluence pages that were skipped (e.g., empty body, exceeded depth).

## Failure modes

| Trigger | Behaviour |
|---------|-----------|
| Neither MCP nor required env vars available | Stop; instruct the user how to set the three env vars (point at `.env.example`). |
| `scrape-confluence.js` exits non-zero | Stop; surface the stderr message verbatim. |
| Space returns zero pages | Stop; report "space '<KEY>' is empty — nothing to generate." (Matches AS-2 of US1.) |
| Subagent invocation fails | Continue with remaining candidates; record the failure in the final report. |

## Re-run semantics

A second invocation on the same space MUST:
- Re-scrape (no caching, per R9).
- Re-derive the `KnowledgeSummary` from fresh content.
- Overwrite existing artefacts at the same paths; warn (stderr) on any
  overwrite (per R10).

## Boundaries

This contract does **not** prescribe:
- The exact names Claude chooses for generated artefacts (subagents own the
  naming conventions).
- The internal tool list for each generated agent (`meta-agent` decides,
  subject to Constitution Principle IV).
- The number of pages Claude inspects in detail vs. skims; only the
  traversal cap (depth 3) is fixed.

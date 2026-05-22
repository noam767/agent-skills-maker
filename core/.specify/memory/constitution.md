<!--
SYNC IMPACT REPORT
==================
Version change: [TEMPLATE] → 1.0.0
Modified principles: N/A (initial fill from template)
Added sections:
  - Core Principles (I–V)
  - Confluence Integration Standards
  - Node.js Tooling Standards
  - Governance
Templates reviewed:
  - .specify/templates/plan-template.md        ✅ aligned (Constitution Check gate present)
  - .specify/templates/spec-template.md        ✅ aligned (no principle-breaking sections)
  - .specify/templates/tasks-template.md       ✅ aligned (task categories compatible)
  - .specify/templates/constitution-template.md ✅ source for this fill
Deferred TODOs: none
-->

# Agent Skills Maker Constitution

## Core Principles

### I. Knowledge-First Agent Generation

All generated agents and skills MUST be grounded in content scraped from the team's
Confluence space. Generic agent patterns are a starting point only; every agent MUST
incorporate team-specific knowledge: tools the team uses, services they provision,
known failure modes, common issues, and established best practices.

Rationale: An agent that ignores existing team knowledge produces redundant or
conflicting guidance and erodes trust in the generated artefacts.

### II. Confluence Integration Precedence

When populating knowledge context the system MUST follow this priority order:

1. Atlassian/Confluence MCP server — if an MCP tool with Confluence access is
   available in the current session, it MUST be used.
2. Confluence REST API — if no MCP tool is available, the system MUST fall back to
   direct REST API calls (authenticated via API token or Basic auth).
3. Human-supplied excerpts — only if neither of the above is possible.

The system MUST NOT fabricate or hallucinate team knowledge when Confluence is
unreachable. Instead, it MUST surface a clear error and request manual input.

### III. Air-Gap & Dependency Safety

Generated agents and skills MUST operate safely in environments with no network
access. Concretely:

- Generated artefacts MUST NOT script `npm install`, `pip install`, or any package
  registry fetch as part of their runtime execution.
- If a required binary or library is missing, the generated agent MUST flag the gap
  to the user rather than attempting to download it.
- Node.js helper scripts shipped alongside this project MUST list all runtime
  dependencies in `package.json` so teams can pre-install them in controlled
  environments.

### IV. Minimally Privileged Tool Assignment

Each generated agent MUST receive only the tools required for its described task:

- Read-only research agents: `Read, Grep, Glob` only.
- Agents that write artefacts: add `Write` or `Edit` as needed.
- Agents requiring shell interaction: add `Bash` only when necessary.
- Network tools (`WebFetch`, `WebSearch`) are forbidden in generated agents
  because the target execution environment is air-gapped.

Rationale: Overly permissive tool sets increase blast radius and erode the
principle of least privilege.

### V. Simplicity & Iterative Refinement

The system MUST prefer the simplest solution that satisfies the stated use case:

- Generated agent/skill definitions SHOULD fit in a single Markdown file unless
  supporting artefacts genuinely reduce complexity.
- Agents MUST be re-generatable: when Confluence content evolves, re-running the
  workflow MUST produce an updated, internally consistent artefact.
- Node.js helper scripts MUST be single-purpose; avoid monolithic utility modules.

## Confluence Integration Standards

- Authentication: API token auth via `Authorization: Basic base64(email:token)` header.
- Base URL pattern: `https://<domain>.atlassian.net/wiki/rest/api/`
- Required capabilities: space content listing, page body retrieval (storage or
  view format), label/ancestor traversal.
- The Node.js helper (`scripts/confluence-scraper.js` or equivalent) MUST:
  - Accept space key, base URL, and credentials via environment variables or a
    config file (never hard-coded).
  - Output scraped content as structured JSON to `stdout`.
  - Write errors to `stderr` with actionable messages.
  - Limit page depth to avoid runaway recursion (default max depth: 3 levels).

## Node.js Tooling Standards

- Runtime: Node.js LTS (≥18). No transpilation step required; use native ESM or
  CommonJS as appropriate.
- Allowed built-in modules: `fs`, `path`, `https`, `http`, `url`, `crypto`,
  `process`, `readline`.
- External dependencies: keep to a minimum; `node-fetch` (or native `fetch` in
  Node 18+) for HTTP, `dotenv` for config loading. No build tools.
- All scripts MUST exit with code 0 on success, non-zero on failure.
- No global installs; scripts run via `node <script>` or `npx` with no side effects
  on the host system.

## Governance

This constitution supersedes all other project-level conventions and coding
preferences. Any practice not explicitly addressed here is governed by good
engineering judgment aligned with the spirit of these principles.

**Amendment procedure**:
1. Propose the amendment by updating this file and bumping the version per semantic
   versioning rules (MAJOR: breaking governance change; MINOR: new section/principle;
   PATCH: clarification or wording fix).
2. Update the Sync Impact Report comment at the top of this file.
3. Propagate changes to `.specify/templates/` files affected by the amendment.
4. Commit with message: `docs: amend constitution to vX.Y.Z (<short rationale>)`.

**Compliance**: All PRs that add or modify agent/skill definitions or Node.js helper
scripts MUST pass a Constitution Check (see plan-template.md) before merging.

**Version**: 1.0.0 | **Ratified**: 2026-05-22 | **Last Amended**: 2026-05-22

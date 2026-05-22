# Implementation Plan: Confluence-Driven Agent & Skill Builder

**Branch**: `001-confluence-agent-builder` | **Date**: 2026-05-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-confluence-agent-builder/spec.md`

## Summary

Ship a small Node.js helper plus an orchestration contract so that any team
member can clone this repo, point Claude Code at their Confluence space, and
end up with a tailored set of `.claude/agents/*.md` and `.claude/skills/*/SKILL.md`
artefacts. Claude drives the workflow: it (a) pulls Confluence content via an
Atlassian MCP server when present or via the Node REST helper when not, (b)
reasons over the content to extract team knowledge categories, and (c) invokes
the existing `meta-agent` and `skill-creator` subagents to write the generated
artefacts. The Node side stays intentionally thin — its only job is reliable
REST-based scraping with deterministic JSON output.

## Technical Context

**Language/Version**: Node.js ≥18 LTS (native `fetch`, ESM-capable)

**Primary Dependencies**: Node standard library only (`https`/`fetch`, `fs`,
`path`, `process`, `url`). No runtime npm dependencies for the core scraper.
Optional dev-only dependency: none — use built-in `node:test` runner.

**Storage**: Filesystem only. Inputs: env vars + CLI args. Outputs:
- Scraper → JSON on stdout.
- Generation step → Markdown files under `.claude/agents/` and `.claude/skills/`.
- No databases, no caches persisted across runs.

**Testing**: `node --test` (built-in). Unit tests for URL building, response
parsing, and CLI argument handling. Integration tests use a mock Confluence
server (`http.createServer`) — no external network in CI.

**Target Platform**: Cross-platform (Windows, macOS, Linux) Node.js host
running inside a Claude Code session.

**Project Type**: CLI helper + Claude Code subagent orchestration (single
project; no frontend, no service).

**Performance Goals**: Scrape and emit JSON for a 200-page Confluence space in
under 5 minutes on a typical developer laptop (aligns with SC-004 / SC-005).

**Constraints**:
- Air-gap aware: no `npm install` at runtime; rely on Node built-ins.
- Generated agents MUST NOT include `WebFetch`/`WebSearch` tools.
- Confluence depth limited to 3 ancestor levels by default (FR-007).
- On-prem Confluence Data Center only (per Clarifications 2026-05-22). Cloud is out of scope.
- TLS verification disabled (`rejectUnauthorized: false`) — deliberate tradeoff for the closed network; documented in `.env.example` and quickstart.

**Scale/Scope**: One Confluence space per invocation; up to ~200 pages; emits
≥3 meaningful agent/skill artefacts (SC-002).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
|-----------|--------|----------|
| I. Knowledge-First Agent Generation | ✅ PASS | Spec FR-004/FR-005/FR-006 require all generated artefacts to derive from scraped Confluence knowledge. |
| II. Confluence Integration Precedence | ✅ PASS | Spec FR-002/FR-003 enforce MCP → REST order; the orchestration contract (`contracts/orchestration.md`) codifies the same precedence for Claude. |
| III. Air-Gap & Dependency Safety | ✅ PASS | Scraper uses only Node built-ins; `package.json` has zero runtime deps; generated agents are forbidden network tools (FR-010). |
| IV. Minimally Privileged Tool Assignment | ✅ PASS | Generation step delegates to the existing `meta-agent`/`skill-creator` subagents, which already enforce least-privilege tool lists. |
| V. Simplicity & Iterative Refinement | ✅ PASS | Single-purpose scripts (`scrape-confluence.js`), no abstractions beyond what the spec needs, re-runnable for incremental refresh (FR-011). |

**Confluence Integration Standards**: scraper accepts `CONFLUENCE_BASE_URL`,
`CONFLUENCE_EMAIL`, `CONFLUENCE_API_TOKEN`, `CONFLUENCE_SPACE_KEY` via env
vars; depth default = 3; writes errors to stderr; exits non-zero on failure.

**Node.js Tooling Standards**: Node ≥18; no transpilation; no build step;
exits 0/non-zero by success/failure.

**Verdict**: All gates pass with no violations. `Complexity Tracking` table
is intentionally empty.

## Project Structure

### Documentation (this feature)

```text
specs/001-confluence-agent-builder/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── scrape-confluence.cli.md       # CLI contract for the Node scraper
│   ├── scraped-output.schema.json     # JSON shape emitted by scraper
│   ├── knowledge-summary.schema.json  # JSON shape produced by Claude before invoking meta-agent
│   └── orchestration.md               # Claude-facing bootstrap workflow contract
└── tasks.md             # Phase 2 output (created by /speckit-tasks)
```

### Source Code (repository root)

```text
.claude/
├── agents/
│   ├── meta-agent.md          # existing — agent definition generator
│   └── skill-creator.md       # existing — skill directory generator
└── skills/
    └── (generated per-team skills land here)

scripts/
├── scrape-confluence.js       # REST fetcher; emits JSON to stdout
└── lib/
    ├── confluence-client.js   # Auth + HTTP helpers (Node built-ins only)
    ├── page-walker.js         # Depth-limited traversal
    └── content-normalizer.js  # Strips XHTML to plain text + metadata

tests/
├── unit/
│   ├── confluence-client.test.js
│   ├── page-walker.test.js
│   └── content-normalizer.test.js
└── integration/
    └── scrape-confluence.test.js   # Spins a mock Confluence HTTP server

docs/
└── bootstrap-flow.md          # Human-readable copy of the orchestration contract

package.json                    # Zero runtime deps; declares `node --test` script
.env.example                    # Documents required Confluence env vars
README.md                       # Updated with the "clone → bootstrap" walkthrough
```

**Structure Decision**: Single-project layout. `scripts/` holds the Node
helper (the only first-party software), `tests/` mirrors `scripts/lib/`, and
`.claude/agents` + `.claude/skills` are the artefacts the workflow ultimately
produces. No backend/frontend split; no monorepo packages.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

(No violations — table intentionally empty.)

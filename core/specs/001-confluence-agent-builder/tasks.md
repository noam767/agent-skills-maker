---

description: "Task list for Confluence-Driven Agent & Skill Builder"
---

# Tasks: Confluence-Driven Agent & Skill Builder

**Input**: Design documents from `/specs/001-confluence-agent-builder/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: The spec does not explicitly request TDD. Test tasks below are marked OPTIONAL and only verify the Node helper's HTTP path against a mock server. Skip them for an MVP-only run.

**Organization**: Tasks are grouped by user story so each story can be implemented and validated independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Maps task to user story (US1, US2, US3)

## Path Conventions

Repository root is `C:\Users\noamk\Desktop\agent-skills-maker\core\` on the dev machine. Paths below are project-relative.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Bootstrap the Node project skeleton.

- [x] T001 Create directory tree: `scripts/`, `scripts/lib/`, `tests/unit/`, `tests/integration/`, `docs/` (docs/ later moved to ../guides/)
- [x] T002 [P] Write `package.json` with zero runtime deps and `"scripts": { "test": "node --test" }`, `"type": "module"`, Node ≥18 engine
- [x] T003 [P] Write `.env.example` documenting `CONFLUENCE_BASE_URL`, `CONFLUENCE_PAT`, optional `CONFLUENCE_SPACE_KEY` (env vars revised per clarification 2026-05-22)
- [x] T004 [P] Write/extend `.gitignore` to exclude `node_modules/`, `.env`, `*.log`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core HTTP, traversal, and content modules that every user story depends on.

**⚠️ CRITICAL**: All user story phases depend on this phase.

- [x] T005 Implement `scripts/lib/confluence-client.js` — Bearer PAT HTTPS GET via native `fetch`, TLS verification disabled (research.md R11), exponential-backoff retry (250ms/500ms/1s/2s, 4 attempts max) honouring `Retry-After`. Throws typed errors `{code: 'AUTH'|'NOT_FOUND'|'TRANSIENT'|'CONFIG'|'NETWORK', message, status?}`.
- [x] T006 [P] Implement `scripts/lib/content-normalizer.js` — Strips Confluence storage-format XHTML to plain text. Headings → `#`/`##`/`###` prefix lines. Lists → `- ` lines. Tables → tab-separated rows. Decodes HTML entities. Truncates at 20 000 chars with `\n…[TRUNCATED]` suffix.
- [x] T007 Implement `scripts/lib/page-walker.js` — BFS over Confluence space starting at homepage. Uses `confluence-client` to fetch pages with `expand=body.storage,ancestors,metadata.labels`. Enforces `maxDepth`. Supports `label` and `ancestor` filters. Returns an array of normalised `ConfluencePage` objects ordered by BFS, ties broken by ascending page id.

**Checkpoint**: Library modules done — scraper CLI can now wire them together.

---

## Phase 3: User Story 1 - Bootstrap Team Agent Suite (Priority: P1) 🎯 MVP

**Goal**: A team member with credentials configured can clone the repo, run the scraper on their Confluence space, and feed the JSON into Claude to generate agents/skills.

**Independent Test**: Set the three env vars, run `node scripts/scrape-confluence.js --space <KEY>`, verify a valid JSON document hits stdout and that Claude (in a follow-up session) can read it and produce at least one agent or skill artefact citing real page titles.

### Implementation for User Story 1

- [x] T008 [US1] Implement `scripts/scrape-confluence.js` — CLI entry point. Parses flags (`--space`, `--max-depth`, `--label`, `--ancestor`, `--help`). Validates required env vars; on missing var emits `[scrape] ERROR: missing required env var <NAME>` to stderr and exits 2.
- [x] T009 [US1] Wire `confluence-client` + `page-walker` + `content-normalizer` inside `scrape-confluence.js`. Emit progress lines to stderr (`[scrape] fetched page N/M: <title>`). Final JSON document to stdout matches `contracts/scraped-output.schema.json`.
- [x] T010 [US1] Map error classes to exit codes per contract: AUTH → 3, NOT_FOUND → 4, CONFIG → 2, anything else → 1. Stderr messages match the strings in `contracts/scrape-confluence.cli.md`.
- [x] T011 [P] [US1] Write `../guides/bootstrap-flow.md` — human-readable copy of `specs/001-confluence-agent-builder/contracts/orchestration.md` so Claude (and humans) can read it outside the spec dir.
- [x] T012 [P] [US1] Write `../guides/README.md` — clone → configure → run walkthrough mirroring `quickstart.md`. Includes example `.env`, example invocation, expected output snippet.
- [ ] T013 [P] [US1] OPTIONAL: Write `tests/integration/scrape-confluence.test.js` using `node:test`. Spins a local `http.createServer` that serves canned space/page responses; runs the scraper as a child process pointed at the mock; asserts stdout is valid JSON conforming to the schema and exit code 0.

**Checkpoint**: User Story 1 deliverable — running the scraper produces clean JSON that Claude can consume. This is the MVP.

---

## Phase 4: User Story 2 - Incremental Refresh (Priority: P2)

**Goal**: Re-running the tool after Confluence content changes produces updated artefacts without manual cleanup.

**Independent Test**: Run scraper twice, change a page in between, diff the two JSON outputs — the second reflects the change. With filter flags, only the targeted sub-tree is rescraped.

### Implementation for User Story 2

- [x] T014 [US2] Verify and document idempotent re-run behaviour in `scripts/scrape-confluence.js`. No state files written; every run is a fresh scrape. Header comment references research.md R9.
- [x] T015 [US2] Implement `--label <name>` filter (repeatable) and `--ancestor <pageId>` filter inside `page-walker.js` and surface them via the CLI. When both supplied, both must match (AND semantics).
- [ ] T016 [P] [US2] OPTIONAL: Add `tests/unit/page-walker.test.js` covering depth limit, label filter, ancestor filter (all using in-memory fixtures, no HTTP).

**Checkpoint**: User Story 2 deliverable — filtered, repeatable scrapes work.

---

## Phase 5: User Story 3 - Use Atlassian MCP When Available (Priority: P3)

**Goal**: When an Atlassian/Confluence MCP server is configured, the workflow uses it instead of the Node scraper.

**Note**: MCP integration is a **Claude-side orchestration** concern, not Node code. Tasks here ensure Claude has the documentation needed to make the right call.

### Implementation for User Story 3

- [x] T017 [P] [US3] Write `AGENTS.md` at the repo root with a top-level "Bootstrap workflow" section that mirrors `contracts/orchestration.md` Step 1 (MCP-first detection). This is what Claude reads when a user invokes the workflow. Also extended `CLAUDE.md` with the same MCP-first rule.
- [x] T018 [P] [US3] Add an "MCP precedence" subsection to `../guides/README.md` explaining the user-visible behaviour: if your Claude Code has an Atlassian MCP server installed, the scraper is skipped automatically.

**Checkpoint**: User Story 3 deliverable — Claude has unambiguous guidance to prefer MCP.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T019 [P] OPTIONAL: `tests/unit/content-normalizer.test.js` covering headings, lists, tables, entity decoding, truncation.
- [ ] T020 [P] OPTIONAL: `tests/unit/confluence-client.test.js` covering retry/backoff, Retry-After honouring, and error-class mapping (using a mock server fixture).
- [ ] T021 Smoke-test the meta-agent and skill-creator subagents against a fixture `KnowledgeSummary` to confirm they still produce conformant output (manual: a small JSON in `tests/fixtures/knowledge-summary.sample.json` + a short README note on how to invoke).
- [ ] T022 Final pass on `README.md`: add troubleshooting table from `quickstart.md`, link the spec, link the constitution.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup. **Blocks all user stories.**
- **User Story 1 (Phase 3)**: Depends on Foundational. **MVP.**
- **User Story 2 (Phase 4)**: Depends on User Story 1 (extends the same CLI).
- **User Story 3 (Phase 5)**: Independent of US1/US2 (documentation-only).
- **Polish (Phase 6)**: Depends on whichever stories are in scope.

### Within Each User Story

- Library modules (Phase 2) before CLI wiring (Phase 3).
- CLI core (T008/T009) before exit-code mapping (T010).
- Docs (T011/T012/T017/T018) can run in parallel with code.

### Parallel Opportunities

- Setup: T002, T003, T004 all `[P]`.
- Foundational: T006 `[P]` runs alongside T005 (different files); T007 depends on T005.
- US1: T011, T012, T013 all `[P]` (docs + optional test, distinct files).
- US3: T017 and T018 both `[P]` (different files).
- Polish: T019, T020 `[P]`.

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 → Phase 2 → Phase 3.
2. Stop and validate by running the scraper against a real Confluence space.
3. Iterate based on real output before adding US2 filters or US3 docs.

### Incremental Delivery

- MVP shipped after Phase 3.
- US2 (Phase 4) adds filter flags — small surface, low risk.
- US3 (Phase 5) is pure documentation — can land any time.
- Polish (Phase 6) ongoing.

---

## Notes

- All file paths in this list refer to files **not yet created**; the implementer creates them as part of each task.
- `[P]` = different files, no dependency on an incomplete task.
- The Node helper has zero runtime npm dependencies — anyone tempted to add one should re-read Constitution Principle III first.
- Generated agent/skill files MUST NOT list `WebFetch` / `WebSearch` (Constitution Principle IV). Smoke-test T021 should fail loudly if they do.

# Feature Specification: Confluence-Driven Agent & Skill Builder

**Feature Branch**: `001-confluence-agent-builder`

**Created**: 2026-05-22

**Status**: Draft

**Input**: User description: "Allow teams to build agents and skills based on their knowledge base from their Confluence space. Clone the project, point it at a Confluence space, and Claude uses helper software + meta-agent + skill-creator subagents to generate multiple agents and skills tailored to the team's data, tools, services, errors, and best practices."

---

## Clarifications

### Session 2026-05-22

- Q: Target Confluence deployment — Cloud or on-prem Data Center? → A: Air-gapped on-prem Confluence Data Center (NOT Atlassian Cloud).
- Q: Authentication scheme? → A: Bearer Personal Access Token. Single env var `CONFLUENCE_PAT`; header `Authorization: Bearer <token>`. Team member mints the PAT in their own Confluence profile (`<base-url>/plugins/personalaccesstokens/usertokens.action`).
- Q: REST path prefix? → A: `CONFLUENCE_BASE_URL` is the full prefix the user pastes (host, optionally including a context path such as `/confluence`). The client unconditionally appends `/rest/api/...` — no Cloud-style `/wiki/` prefix.
- Q: TLS verification posture for internal/self-signed CAs? → A: TLS verification disabled by default (`rejectUnauthorized: false`). Justified by the closed air-gapped network; documented as an explicit security tradeoff for this deployment context.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Bootstrap Team Agent Suite from Confluence Space (Priority: P1)

A team member clones the project, provides their Confluence space key (or URL), and
runs a single command. Claude scrapes the space, extracts team knowledge, and
generates a set of agent definitions and skill files tailored to that team.

**Why this priority**: This is the entire value proposition of the project. Without
this flow nothing else matters.

**Independent Test**: A developer with a valid Confluence space key can clone the
repo, supply credentials, run the bootstrap command, and find newly generated
`.claude/agents/*.md` and `.claude/skills/*/SKILL.md` files containing team-specific
content from their space.

**Acceptance Scenarios**:

1. **Given** the user has a Confluence space key and API credentials configured,
   **When** they invoke the bootstrap command with the space key,
   **Then** the system scrapes the space, summarises team knowledge, and writes at
   least one agent definition and one skill file to the project.

2. **Given** the Confluence space is reachable but returns no pages,
   **When** the bootstrap runs,
   **Then** the system surfaces a clear warning and exits without writing partial artefacts.

3. **Given** credentials are missing or invalid,
   **When** the bootstrap runs,
   **Then** the system fails fast with an actionable error message describing which
   environment variable or config value is missing.

---

### User Story 2 - Incremental Refresh of Existing Agents/Skills (Priority: P2)

A team member re-runs the tool after Confluence content has been updated.
Existing agents and skills are regenerated to reflect new knowledge without
manual editing.

**Why this priority**: Teams update their documentation regularly; the tool must
stay useful over time, not just on first use.

**Independent Test**: Modify a Confluence page used in a prior run, re-execute
the bootstrap, and verify the regenerated agent/skill file reflects the change.

**Acceptance Scenarios**:

1. **Given** agents/skills were previously generated,
   **When** the user re-runs the bootstrap command,
   **Then** existing artefacts are overwritten with up-to-date content derived from
   the current state of Confluence.

2. **Given** the user wants to target only a sub-section of the space,
   **When** they provide a page ancestor ID or label filter,
   **Then** only artefacts derived from that sub-tree are regenerated.

---

### User Story 3 - Use Atlassian MCP Server When Available (Priority: P3)

When an Atlassian/Confluence MCP server is configured in the Claude Code session,
the tool uses it instead of raw REST calls, gaining richer context and avoiding
credential management.

**Why this priority**: MCP integration is a superior data path, but the tool MUST
work without it (REST fallback). MCP use is an enhancement, not a dependency.

**Independent Test**: Configure a Confluence MCP server, run the bootstrap, and
verify that no REST HTTP calls are made and the generated artefacts contain content
only accessible via the MCP tool (e.g., structured metadata not in the REST body).

**Acceptance Scenarios**:

1. **Given** a Confluence MCP tool is available in the current Claude session,
   **When** the bootstrap runs,
   **Then** the system uses MCP tool calls for all Confluence data retrieval and
   does not fall back to REST.

2. **Given** a Confluence MCP tool was previously available but is now absent,
   **When** the bootstrap runs,
   **Then** the system automatically falls back to REST API without user intervention.

---

### Edge Cases

- What happens when a Confluence page contains only images or attachments (no text)?
- How does the system handle rate-limiting responses (HTTP 429) from the Confluence API?
- What if two pages have the same title in different parts of the space hierarchy?
- What if the generated agent name conflicts with an existing `.claude/agents/*.md` file?
- How does the system behave when the Confluence space has thousands of pages
  (performance / depth limits)?

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST accept a Confluence space key or space URL as the
  primary input for knowledge extraction.
- **FR-002**: The system MUST retrieve page content from on-prem Confluence Data
  Center via its REST API when no MCP tool is available, authenticating with a
  Bearer Personal Access Token (env `CONFLUENCE_PAT`) and using
  `CONFLUENCE_BASE_URL` as the full URL prefix (host plus optional context path).
  TLS certificate verification is disabled to accommodate internal CAs in the
  air-gapped network.
- **FR-003**: The system MUST prefer an Atlassian/Confluence MCP server over REST
  when one is detected in the active Claude session.
- **FR-004**: The system MUST extract the following knowledge categories from the
  scraped space: team purpose, tools used, services provisioned for other teams,
  historical errors and failures, common issues, and established best practices.
- **FR-005**: The system MUST invoke the `meta-agent` subagent to generate agent
  definition files (`.claude/agents/*.md`) based on extracted knowledge.
- **FR-006**: The system MUST invoke the `skill-creator` subagent to generate skill
  directories (`.claude/skills/*/SKILL.md`) based on extracted knowledge.
- **FR-007**: The system MUST limit Confluence page traversal depth to prevent
  runaway scraping (default: 3 levels; configurable).
- **FR-008**: The system MUST fail fast with an actionable error message if
  Confluence credentials are missing or authentication fails.
- **FR-009**: The Node.js scraper script MUST output structured JSON to stdout and
  errors to stderr.
- **FR-010**: Generated agents MUST NOT include network tools (`WebFetch`,
  `WebSearch`) in their tool list, in accordance with the air-gap principle.
- **FR-011**: The system MUST support re-running to regenerate artefacts when
  Confluence content has changed.

### Key Entities

- **ConfluenceSpace**: Identified by space key; contains pages organised in a tree.
- **ConfluencePage**: A document with title, body, labels, ancestors, and metadata.
- **KnowledgeSummary**: Structured extraction of team knowledge from scraped pages
  (purpose, tools, services, errors, best practices).
- **AgentDefinition**: A Markdown file at `.claude/agents/<name>.md` following the
  meta-agent output format.
- **SkillDefinition**: A directory at `.claude/skills/<name>/SKILL.md` following
  the skill-creator output format.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A team member with no prior experience of the tool can go from zero to
  a working set of generated agents and skills within 15 minutes of cloning the repo.
- **SC-002**: The bootstrap generates at least 3 meaningful, non-generic agent or
  skill artefacts per Confluence space that has ≥10 pages of content.
- **SC-003**: 100% of generated agent files conform to the meta-agent output format
  (frontmatter fields: name, description, tools, model, color present and valid).
- **SC-004**: The scraper handles spaces with up to 200 pages without timing out or
  producing incomplete output.
- **SC-005**: Re-running the bootstrap after a Confluence content change produces
  updated artefacts within 5 minutes on a typical developer machine.
- **SC-006**: When credentials are absent or wrong, the user receives an error
  message that identifies exactly which value to fix before re-running.

---

## Assumptions

- Team members have a Confluence Data Center account on their on-prem instance
  and can mint a Personal Access Token from their own profile at
  `<base-url>/plugins/personalaccesstokens/usertokens.action`.
- The target Confluence instance is an on-prem Confluence Data Center deployment
  reachable from inside the team's air-gapped network. Atlassian Cloud is
  explicitly out of scope.
- The host running the scraper trusts the internal Confluence URL because the
  network is closed; TLS verification is disabled by deliberate choice.
- The Claude Code environment has Node.js 18+ available on the host.
- Confluence page bodies are in storage or view format (HTML/XHTML); PDF-only
  content is out of scope.
- The project is used from within a Claude Code session (CLI or IDE extension);
  there is no standalone web UI.
- The number of agents/skills to generate is determined heuristically by the
  extracted knowledge, not by a fixed count.
- Credential configuration is done via environment variables
  (`CONFLUENCE_BASE_URL`, `CONFLUENCE_PAT`); no interactive credential wizard in v1.

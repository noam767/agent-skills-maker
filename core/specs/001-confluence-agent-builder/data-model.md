# Data Model: Confluence-Driven Agent & Skill Builder

This feature has no persistent database. The "data model" here describes the
**in-flight data structures** that flow between the scraper, Claude's
orchestration step, and the meta-agent / skill-creator subagents.

---

## Entity: `ConfluenceSpace`

Identifies the target space being scraped.

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| `key` | string (uppercase, ≤255) | env `CONFLUENCE_SPACE_KEY` or CLI `--space` | Required. |
| `baseUrl` | string (URL) | env `CONFLUENCE_BASE_URL` | Required. Must end with `.atlassian.net`. |
| `name` | string | API response `space.name` | Populated after scrape. |
| `homepageId` | string (numeric) | API response `space.homepage.id` | Used as BFS root. |

**Validation**:
- `key` must match `^[A-Z0-9~]{1,255}$`.
- `baseUrl` must parse as an absolute `http://` or `https://` URL with no trailing slash. May contain a context path (e.g., `https://intranet.acme.corp/confluence`). No host-name restriction (on-prem hostnames vary).

---

## Entity: `ConfluencePage`

A single Confluence page after fetch + normalisation.

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| `id` | string (numeric) | API `id` | Stable Confluence identifier. |
| `title` | string | API `title` | |
| `path` | string[] | Derived from `ancestors[].title` + own title | Ordered root → leaf. |
| `depth` | integer ≥ 0 | `path.length - 1` | 0 = space home. |
| `labels` | string[] | API `metadata.labels.results[].name` | May be empty. |
| `url` | string (URL) | `baseUrl + /_links/webui` | Browser-facing link. |
| `text` | string | normalised `body.storage` | Plain text, headings prefixed with `#`. |

**Validation**:
- `depth` must satisfy `depth ≤ maxDepth` (default 3); otherwise the page is dropped before output.
- `text` is truncated to 20 000 characters; truncation appends `\n…[TRUNCATED]`.

---

## Entity: `ScrapedOutput`

Top-level JSON document emitted by `scrape-confluence.js`.

| Field | Type | Notes |
|-------|------|-------|
| `space` | `ConfluenceSpace` (subset: `key`, `name`, `baseUrl`) | |
| `scrapedAt` | string (ISO 8601 UTC) | `new Date().toISOString()`. |
| `maxDepth` | integer | Echo of the depth limit used. |
| `pageCount` | integer | `pages.length`. |
| `pages` | `ConfluencePage[]` | Ordered by BFS traversal (top-level first). |

See `contracts/scraped-output.schema.json` for the JSON Schema.

---

## Entity: `KnowledgeSummary`

Produced **by Claude** (not by Node) after reading `ScrapedOutput`. This is
the input that the orchestrator passes — conceptually — to the `meta-agent`
and `skill-creator` subagents when asking them to generate artefacts.

| Field | Type | Notes |
|-------|------|-------|
| `teamPurpose` | string | One-paragraph summary of what the team does. |
| `tools` | `ToolReference[]` | Internal/external tools the team uses. |
| `servicesProvisioned` | `ServiceReference[]` | What the team offers to other teams. |
| `historicalIncidents` | `Incident[]` | Past failures worth remembering. |
| `commonIssues` | `Issue[]` | Recurring problems and standard responses. |
| `bestPractices` | `Practice[]` | Codified guidance. |
| `sources` | `SourceLink[]` | Page IDs and URLs that fed each section. |

**Sub-shapes**:

- `ToolReference`: `{ name, category, usage, sourcePageIds[] }`
- `ServiceReference`: `{ name, consumers[], slo?, sourcePageIds[] }`
- `Incident`: `{ title, dateApprox?, summary, lesson, sourcePageIds[] }`
- `Issue`: `{ title, symptoms, resolutionSteps[], sourcePageIds[] }`
- `Practice`: `{ title, statement, rationale?, sourcePageIds[] }`
- `SourceLink`: `{ pageId, title, url }`

See `contracts/knowledge-summary.schema.json` for the JSON Schema.

---

## Entity: `AgentDefinition` (output artefact)

The Markdown file written under `.claude/agents/<kebab-name>.md`. Its shape
is fully defined by `.claude/agents/meta-agent.md`; this feature does not
redefine it. Generated files MUST conform to that contract:

- Frontmatter fields: `name`, `description`, `tools`, `model`, `color`.
- `tools` MUST NOT contain `WebFetch` or `WebSearch` (Constitution III).
- Body MUST include a `## Instructions` section grounded in the
  `KnowledgeSummary`.

---

## Entity: `SkillDefinition` (output artefact)

The directory at `.claude/skills/<gerund-name>/` containing at least
`SKILL.md`. Shape is fully defined by `.claude/agents/skill-creator.md`.
Generated skills MUST:

- Use gerund-form `name` in the frontmatter.
- Have a trigger-focused `description` (third person, "Use this skill when…").
- Be grounded in concrete content drawn from the `KnowledgeSummary`.

---

## Relationships

```text
ConfluenceSpace 1 ── * ConfluencePage
ScrapedOutput   1 ── 1 ConfluenceSpace
ScrapedOutput   1 ── * ConfluencePage
KnowledgeSummary —— derived-from ── ScrapedOutput
AgentDefinition  —— generated-from ── KnowledgeSummary (via meta-agent)
SkillDefinition  —— generated-from ── KnowledgeSummary (via skill-creator)
```

## State transitions

Not applicable — all data structures are produced once per run and not
mutated thereafter. Re-runs produce fresh instances (see R9 in research.md).

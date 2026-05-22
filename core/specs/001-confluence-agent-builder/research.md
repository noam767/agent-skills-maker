# Phase 0 Research: Confluence-Driven Agent & Skill Builder

This document resolves the open technical questions that surfaced during plan
authoring. Each entry follows the format: **Decision / Rationale / Alternatives
considered**.

---

## R1. Confluence Data Center REST endpoint set

**Decision**: Use the on-prem Confluence Data Center v1 REST API. Endpoints
relative to `CONFLUENCE_BASE_URL` (which includes any context path):

- `GET {base}/rest/api/space/{spaceKey}` — verify space exists and read metadata.
- `GET {base}/rest/api/content?spaceKey={key}&expand=body.storage,ancestors,metadata.labels&limit=50` — paginated page listing with body, ancestor chain, and labels in one round trip.
- `GET {base}/rest/api/content/search?cql=space=...` — only when a label or ancestor filter is supplied.

**Rationale**: DC uses the bare `/rest/api/` path (no Cloud-style `/wiki/`
prefix). `expand` collapses body+ancestors+labels into one request, keeping
us within the 200-page / 5-minute budget. The same v1 surface has been
stable across recent DC versions.

**Alternatives considered**:
- Atlassian Cloud `/wiki/rest/api/`: irrelevant — clarification 2026-05-22 scopes to on-prem DC.
- v2 REST API: Cloud-only; not available on DC. Rejected.
- CQL-only retrieval: loses ancestor structure, complicates depth limiting. Rejected.

---

## R2. Authentication mechanism

**Decision**: Confluence Data Center Personal Access Token sent as
`Authorization: Bearer ${CONFLUENCE_PAT}`. One env var, no username field.

**Rationale**: Per clarification 2026-05-22, the team member mints a PAT
from their own profile inside the on-prem Confluence (route
`/plugins/personalaccesstokens/usertokens.action`). Bearer PATs are the
DC-native authentication primitive, don't require sending a password, and
work cleanly with the air-gapped network — no Atlassian Cloud round-trip
needed to issue or validate the token.

**Alternatives considered**:
- Basic auth with username + PAT: works on DC but doubles the env var surface; reverse-proxy compatibility isn't a known concern here.
- Basic auth with username + password: rejected — sends a plaintext password over the wire and is being phased out across the Atlassian ecosystem.
- OAuth 2.0 (3LO): requires a callback server and a registered app in Confluence; overkill for a CLI tool inside a closed network.

---

## R3. MCP-vs-REST decision point

**Decision**: Detection happens in Claude's orchestration layer, not in the
Node scraper. Before invoking the scraper, Claude checks whether an Atlassian
or Confluence MCP tool is available in the current session. If yes, Claude
uses the MCP tool directly and never calls `scrape-confluence.js`. If no,
Claude shells out to the Node scraper.

**Rationale**: MCP tools are only addressable by Claude (the agent runtime),
not by an external Node process. Pushing the detection into Node would
require it to call back into Claude — an unnecessary indirection. Keeping
Claude as the dispatcher matches the project's "Claude orchestrates, Node
does I/O" division of labour.

**Alternatives considered**:
- Always-REST: drops the value of MCP integration when present. Rejected (violates Constitution Principle II).
- Always-MCP: not viable when no MCP server is configured.

---

## R4. Page body format & normalisation

**Decision**: Request `body.storage` (Confluence XHTML storage format) and
strip it to plain text inside `lib/content-normalizer.js` using a small
hand-rolled tag-stripper plus entity-decoder. Preserve heading hierarchy
as markdown-style `#` prefixes; drop everything else (tables collapse to
tab-separated rows, lists become `- ` lines).

**Rationale**: Storage format is the canonical lossless representation.
The downstream consumer (Claude) reasons better over plain text than over
XHTML noise, and a hand-rolled stripper keeps us within Node built-ins
(no `cheerio`, no `jsdom`, no transpilation — honours Constitution
Principle III).

**Alternatives considered**:
- Request `body.view` (rendered HTML): heavier payload, more presentation noise. Rejected.
- Pull in `cheerio`: adds npm dependency surface; unnecessary for the limited stripping we need. Rejected.

---

## R5. Depth-limited traversal strategy

**Decision**: Breadth-first traversal seeded by space root pages. Each page's
`ancestors` array (returned by the `expand=ancestors` query) yields the
current depth. The walker discards pages whose depth exceeds the configured
limit (default 3).

**Rationale**: BFS gives the most "important" pages first (top-level
sections), which matches the user's intent of summarising team purpose
before drilling into edge details. The 3-level default is the constitution's
explicit guidance and matches the typical Confluence space structure
(Space → Section → Page → Detail).

**Alternatives considered**:
- DFS: risks exhausting traversal budget on one deep sub-tree. Rejected.
- No depth limit: violates Constitution Confluence Integration Standards. Rejected.

---

## R6. Rate-limit & error handling

**Decision**:
- On HTTP 429 or 5xx: retry with exponential backoff (250 ms, 500 ms, 1 s,
  2 s, give up after 4 attempts). Respect `Retry-After` header when present.
- On HTTP 401/403: exit immediately with a descriptive error to stderr
  naming the missing/invalid env var.
- On HTTP 404 for the space: exit with code 2 and a message naming the
  space key that was not found.

**Rationale**: Distinguishing transient failures (5xx, 429) from
configuration failures (4xx auth) means transient errors recover silently
while user-fixable errors surface fast (SC-006).

**Alternatives considered**:
- Single linear retry: not robust enough for noisy networks.
- No retry: violates SC-004 (200-page scrape consistency).

---

## R7. Output schema design

**Decision**: Scraper emits a single JSON document with shape:

```json
{
  "space": { "key": "...", "name": "...", "url": "..." },
  "scrapedAt": "2026-05-22T10:15:00Z",
  "pageCount": 47,
  "pages": [
    {
      "id": "12345",
      "title": "...",
      "path": ["Space Home", "Section", "Page"],
      "depth": 2,
      "labels": ["runbook", "oncall"],
      "url": "...",
      "text": "..."
    }
  ]
}
```

Knowledge categorisation (purpose, tools, services, errors, best practices)
is **not** done in the scraper — Claude performs that step from the raw
text, then produces a `knowledge-summary.json` that conforms to a separate
schema.

**Rationale**: Splitting "raw fetch" from "semantic summarisation" keeps
the Node code deterministic and easy to test, while letting Claude apply
domain reasoning that no rule-based extractor could match.

**Alternatives considered**:
- Single-step "scrape + categorise" in Node: would require LLM calls from the script, violating the air-gap constraint and the Node-tooling minimalism principle. Rejected.

---

## R8. Testing strategy without network access

**Decision**: Integration tests spin up a local `http.createServer` instance
that serves canned Confluence-shaped JSON responses. The scraper points at
`http://127.0.0.1:<port>/wiki/rest/api/` via the same `CONFLUENCE_BASE_URL`
env var used in production.

**Rationale**: No external dependencies, deterministic, fast, and proves the
real HTTP code path end-to-end. Satisfies the Constitution requirement that
"integration tests must hit a real database/server, not mocks" — the mock
server *is* a real HTTP server.

**Alternatives considered**:
- Stub `fetch` directly with a function double: doesn't exercise header/auth handling. Rejected.
- Record-and-replay against real Confluence: requires real credentials in CI. Rejected.

---

## R9. Re-run / incremental refresh behaviour

**Decision**: Re-runs always re-scrape and overwrite. No diffing, no caching
layer in v1.

**Rationale**: Overwriting is simplest and matches FR-011's wording
("regenerate artefacts"). A diff/merge strategy would require an artefact
fingerprinting scheme that adds complexity disproportionate to v1 value.

**Alternatives considered**:
- ETag/`If-Modified-Since` caching: nice optimisation but moves us toward a state-persistence layer. Deferred to a future iteration.

---

## R10. Generated-artefact placement & collision policy

**Decision**: Generated agents land at `.claude/agents/<kebab-name>.md` and
generated skills at `.claude/skills/<gerund-name>/SKILL.md`, exactly as the
existing `meta-agent` and `skill-creator` subagents define. On name
collision, the new artefact overwrites the existing one and a warning is
written to stderr listing the overwritten files.

**Rationale**: Aligns with the existing subagent contracts (no new
conventions invented). Overwrite-with-warning is the simplest "incremental
refresh" semantics consistent with R9.

**Alternatives considered**:
- Suffix collisions (`-2`, `-3`): produces drift; user accumulates stale
  artefacts. Rejected.
- Fail on collision: blocks the refresh use case. Rejected.

---

---

## R11. TLS verification posture for the on-prem deployment

**Decision**: Disable TLS certificate verification in the Confluence client
by attaching an `https.Agent({ rejectUnauthorized: false })` to every
outbound request. Document this prominently in `.env.example`, the
quickstart, and the script header.

**Rationale**: Per clarification 2026-05-22 the deployment environment is
an air-gapped on-prem network where the operator owns both the client and
server. Internal Confluence instances are commonly served with certificates
issued by an internal CA that the host Node.js trust store does not include.
Forcing TLS verification on by default would block first-run setup for
nearly every target team and turn the project into a CA-provisioning
exercise; in a closed network the attacker model that TLS-verification
defends against (MITM on the wire) is not present.

**Alternatives considered**:
- `NODE_EXTRA_CA_CERTS` (point at corp CA PEM): keeps verification on, but
  requires every team member to know the path to (and have access to) the
  corporate CA bundle. Rejected as the v1 default; can be layered on later.
- Project-specific `CONFLUENCE_CA_FILE` env var: same security as the above
  with a less-standard name. Rejected for the same reason.

**Operational note**: The decision is deployment-scoped. Anyone porting
this project to a network where the trust model differs MUST revisit R11.

---

**Phase 0 complete.** All NEEDS CLARIFICATION items from the plan are resolved;
no items deferred to clarification round.

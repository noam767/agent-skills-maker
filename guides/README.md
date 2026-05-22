# agent-skills-maker — User Guide

> Project code lives in the sibling `core/` directory. All paths below are
> relative to `core/` unless noted. Bootstrap-flow companion guide:
> [`./bootstrap-flow.md`](./bootstrap-flow.md).

Generate Claude Code **agents** and **skills** for your team from your **on-prem
Confluence Data Center** space.

Clone, point Claude at your space, and let the meta-agent + skill-creator
subagents produce ready-to-use artefacts grounded in your team's actual
runbooks, services, incidents, and best practices.

> **Deployment context**: this project targets on-prem Confluence Data Center
> inside an **air-gapped network**. Atlassian Cloud is **not** supported.

## Quick start

### 1. Clone and enter the project

```bash
git clone <repo-url> agent-skills-maker
cd agent-skills-maker/core
```

### 2. Mint a Personal Access Token

In your on-prem Confluence, open your profile menu → **Personal Access Tokens**,
or browse directly to:

```text
<your-confluence-base-url>/plugins/personalaccesstokens/usertokens.action
```

Create a read-scoped token. Copy the value (Confluence shows it only once).

### 3. Configure env

```bash
cp .env.example .env
```

Edit `.env`:

```dotenv
CONFLUENCE_BASE_URL=https://confluence.acme.corp
# If your install is behind a context path, include it:
# CONFLUENCE_BASE_URL=https://intranet.acme.corp/confluence
CONFLUENCE_PAT=<paste-your-token>
CONFLUENCE_AUTH_SCHEME=Bearer
```

**Authentication Scheme Reference:**

| Scheme | Target Env | `CONFLUENCE_PAT` format | Header |
| :--- | :--- | :--- | :--- |
| `Bearer` | On-Prem DC | Raw PAT Token | `Bearer ...` |
| `Basic` | Cloud / Legacy | `base64(user:pass)` | `Basic ...` |

Load into your shell:

```bash
# bash / zsh
set -a; source .env; set +a

# PowerShell
Get-Content .env | ForEach-Object {
  if ($_ -match '^(\w+)=(.*)$') {
    [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2])
  }
}
```

### 4. (Optional) Sanity-check the scraper

```bash
node scripts/scrape-confluence.js --space ENG --max-depth 1 | head -c 400
```

Expect a JSON document beginning with `{"space":{"key":"ENG",...`.

### 5. Bootstrap with Claude

Open Claude Code from `core/` and prompt:

> Use this repo on the **ENG** Confluence space and generate agents and skills for me.

Claude will detect MCP (if present), scrape, summarise, and invoke the
`meta-agent` and `skill-creator` subagents to write artefacts under
`.claude/agents/` and `.claude/skills/`.

## How it works

- **`scripts/scrape-confluence.js`** — Node CLI that fetches pages via the
  Confluence Data Center REST API and emits a normalised JSON document.
- **`.claude/agents/meta-agent.md`** — generates agent definitions.
- **`.claude/agents/skill-creator.md`** — generates skill bundles.
- **`AGENTS.md`** — instruction file the AI assistant reads before acting.

## MCP precedence (important)

Claude follows a **MCP-first** rule, codified in `core/AGENTS.md` and
`core/CLAUDE.md`:

1. **First**, Claude checks the current session for a Confluence or Atlassian
   MCP server. If one is present, Claude uses it for ALL data retrieval and
   the Node scraper is never invoked.
2. **Only if no MCP tool is available**, Claude falls back to the Node
   scraper and the REST API path.

What this means for you:

- If your Claude Code is configured with an Atlassian MCP server,
  steps 2–4 of "Quick start" (PAT minting and env vars) are **not needed**.
- If you don't have an MCP server, the Node scraper is the path — set
  `CONFLUENCE_BASE_URL` and `CONFLUENCE_PAT` as shown above.

Either path produces the same artefacts.

The full design lives under `core/specs/001-confluence-agent-builder/`
(`spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`,
`quickstart.md`, `tasks.md`).

## Security notes

- **TLS verification is disabled** in the scraper (`rejectUnauthorized: false`).
  This is a deliberate choice for the closed air-gapped network where the
  operator trusts the internal Confluence host. **Do not point this scraper
  at any host outside that trust boundary.** Justification: research.md R11.
- The scraper never persists credentials. Credentials live only in your
  shell environment for the duration of the run.
- Generated agents are configured by `meta-agent` to never include
  `WebFetch` or `WebSearch` tools (constitution III + IV).

## Troubleshooting

| Symptom | Likely cause |
|---------|--------------|
| `[scrape] ERROR: missing required env var ...` | Re-source `.env`. |
| `[scrape] ERROR: HTTP 401 ...` | PAT invalid, expired, or pasted with whitespace. |
| `[scrape] ERROR: space "X" not found (HTTP 404)` | Wrong space key or no read permission. |
| `getaddrinfo ENOTFOUND <host>` | `CONFLUENCE_BASE_URL` host unreachable — VPN connected? |
| `connect ETIMEDOUT` | Firewall blocking outbound to Confluence host. |
| Claude says "space is empty — nothing to generate." | Try a higher `--max-depth` or drop a filter. |
| Generated agent lists `WebFetch`/`WebSearch` | Bug — file an issue; meta-agent must strip these. |

## Project layout

Repository root contains two top-level directories:

```text
agent-skills-maker/
├── guides/                   # ← you are here (user-facing guides)
│   ├── README.md
│   └── bootstrap-flow.md
└── core/                     # all project code, specs, and machinery
    ├── scripts/
    │   ├── scrape-confluence.js
    │   └── lib/
    │       ├── confluence-client.js
    │       ├── page-walker.js
    │       └── content-normalizer.js
    ├── .claude/
    │   ├── agents/
    │   │   ├── meta-agent.md
    │   │   └── skill-creator.md
    │   └── skills/           # populated by skill-creator
    ├── specs/001-confluence-agent-builder/
    │   ├── spec.md plan.md research.md data-model.md tasks.md
    │   ├── contracts/  quickstart.md  checklists/
    ├── .specify/             # spec-kit machinery
    ├── package.json
    └── .env.example
```

## Constitution

This project is governed by `core/.specify/memory/constitution.md`. Key rules:

1. Knowledge-first: agents/skills MUST cite Confluence pages.
2. MCP > REST > manual for Confluence data.
3. Air-gap safe: no `npm install` at runtime; no network tools in generated agents.
4. Least privilege: each generated agent gets only the tools it needs.
5. Simplicity: single-file artefacts; re-generate when content evolves.

Read it before contributing.

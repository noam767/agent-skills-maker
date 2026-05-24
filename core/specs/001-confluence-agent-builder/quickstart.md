# Quickstart: Confluence-Driven Agent & Skill Builder

This walks a brand-new team member through bootstrapping their own agent and
skill suite from their on-prem Confluence Data Center space.

## Deployment context

This project targets **on-prem Confluence Data Center / Server inside an
air-gapped network**. Atlassian Cloud is not supported. The scraper:

- Talks to `<CONFLUENCE_BASE_URL>/rest/api/...` and `<CONFLUENCE_BASE_URL>/download/...`.
- Authenticates with a Personal Access Token sent as `Authorization: Bearer <token>`.
- Disables TLS verification (closed network — see security note below).

## Prerequisites

- Node.js ≥18 available on PATH (`node --version`).
- An account on your team's Confluence Data Center instance with read access to the target space.
- A Confluence Personal Access Token (see step 2).
- Claude Code installed locally.

## 1. Clone the repo

```bash
git clone <repo-url> agent-skills-maker
cd agent-skills-maker
```

## 2. Mint a Personal Access Token

Inside your on-prem Confluence, navigate to your own profile menu and choose
**Personal Access Tokens**, or open directly:

```text
<CONFLUENCE_BASE_URL>/plugins/personalaccesstokens/usertokens.action
```

Create a new token (read-only scope is sufficient). Copy the value — Confluence
shows it only once.

## 3. Configure credentials

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

```dotenv
# Examples — replace with your actual values.
CONFLUENCE_BASE_URL=https://confluence.acme.corp
# or, if your install is behind a context path:
# CONFLUENCE_BASE_URL=https://intranet.acme.corp/confluence
CONFLUENCE_PAT=<paste-token-here>
CONFLUENCE_AUTH_SCHEME=Bearer
```

Load the env vars into your shell before running:

```bash
# bash / zsh
set -a; source .env; set +a

# Windows PowerShell
Get-Content .env | ForEach-Object {
  if ($_ -match '^(\w+)=(.*)$') {
    [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2])
  }
}
```

## 4. (Optional) Sanity-check the scraper

```bash
node scripts/scrape-confluence.js --space ENG --max-depth 1 | head -c 400
```

You should see a JSON document starting with `{"space":{"key":"ENG",...`.
If you get an auth error, double-check `CONFLUENCE_PAT` (tokens are scoped to
the user who minted them — make sure you copied the whole string).

## 5. Launch Claude Code and bootstrap

From the project root, start Claude Code and prompt:

> Use this repo on the **ENG** Confluence space and generate agents and skills for me.

(Replace `ENG` with your space key, or paste a full space URL from the
intranet — Claude will extract the key.)

Claude will:

1. Detect whether an Atlassian/Confluence MCP tool is available in the session.
2. Scrape the space (MCP if available, else `scripts/scrape-confluence.js`).
3. Summarise team knowledge into the categories defined by
   `contracts/knowledge-summary.schema.json`.
4. Invoke the `meta-agent` and `skill-creator` subagents to write artefacts.

## 6. Inspect the output

New files appear under:

```text
.claude/agents/<some-name>.md
.claude/skills/<some-name>/SKILL.md
```

Open one of the generated agent files — its `description` should reference
your team, and its body should cite Confluence page titles you recognise.

## 7. Iterate

When Confluence content changes, repeat step 5. Existing artefacts are
overwritten; you'll see warnings on stderr listing the overwrites.

---

## Security note: TLS verification is off

The scraper is configured with `rejectUnauthorized: false` on every HTTPS
request. This is a **deliberate choice** for the on-prem air-gapped deployment
because on-prem Confluence instances commonly use certificates signed by an
internal CA that the host Node.js trust store doesn't recognise.

Implications:

- The scraper will silently accept any TLS certificate from any host.
- **Do not** point `CONFLUENCE_BASE_URL` at a host outside your trusted
  internal network.
- If you ever port this project to a network where the trust model is
  different, revisit decision **R11** in `research.md` and re-enable
  verification.

## Troubleshooting

| Symptom | Likely cause |
|---------|--------------|
| `[scrape] ERROR: missing required env var ...` | Re-load `.env` into your shell. |
| `[scrape] ERROR: HTTP 401 ...` | PAT is invalid, expired, or copied with whitespace. |
| `[scrape] ERROR: space "X" not found (HTTP 404)` | Wrong space key, or your account has no read permission. |
| `getaddrinfo ENOTFOUND <host>` | `CONFLUENCE_BASE_URL` host isn't resolvable — VPN connected? Correct hostname? |
| `connect ETIMEDOUT` | Firewall is blocking outbound access to the Confluence host from this machine. |
| Claude says "space is empty — nothing to generate" | Try a higher `--max-depth` or drop a label/ancestor filter. |
| Generated agent lists `WebFetch` or `WebSearch` | Bug — file an issue; the meta-agent must strip these. |

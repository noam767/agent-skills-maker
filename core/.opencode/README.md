# OpenCode port of the Confluence agent-builder

This directory ports the Claude Code bootstrap layer (`/bootstrap-team`,
`meta-agent`, `skill-creator`) to [OpenCode](https://github.com/sst/opencode)
conventions:

| Claude Code path                          | OpenCode path                          |
| ----------------------------------------- | -------------------------------------- |
| `.claude/commands/bootstrap-team.md`      | `.opencode/command/bootstrap-team.md`  |
| `.claude/agents/meta-agent.md`            | `.opencode/agent/meta-agent.md`        |
| `.claude/agents/skill-creator.md`         | `.opencode/agent/skill-creator.md`     |

The body content is the same; only the frontmatter conventions differ
(OpenCode commands use `agent:` to nominate which subagent runs the command,
and OpenCode agents declare `mode: subagent` plus a `tools:` object map).

The generated team-Sentra artefacts (the output of running the command) live
under `result-example/team-sentra/.opencode/`.

> Verify frontmatter field names against your installed OpenCode version
> before relying on these — OpenCode is moving and small field renames happen.

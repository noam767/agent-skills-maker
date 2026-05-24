# Continue port of the Confluence agent-builder

This directory ports the bootstrap layer to
[Continue](https://github.com/continuedev/continue) conventions:

| Claude Code path                          | Continue path                                |
| ----------------------------------------- | -------------------------------------------- |
| `.claude/commands/bootstrap-team.md`      | `.continue/prompts/bootstrap-team.prompt`    |
| `.claude/agents/meta-agent.md`            | `.continue/agents/meta-agent.md`             |
| `.claude/agents/skill-creator.md`         | `.continue/agents/skill-creator.md`          |

Continue's `.prompt` files are YAML-frontmatter + markdown body, invoked from
the Continue chat with `/<name>`. Continue does not natively run shell
commands the way Claude Code or OpenCode do, so the bootstrap prompt asks the
user to run the scraper themselves and paste back the JSON.

The Continue "Agents" feature is newer and config-schema is in flux; the
files in `agents/` here are role/system prompts in the same markdown shape
as the Claude Code subagents, with a small YAML preamble. You may need to
wire them via Continue's `config.yaml` `agents:` block depending on your
Continue version.

The generated team-Sentra artefacts live under
`result-example/team-sentra/.continue/`.

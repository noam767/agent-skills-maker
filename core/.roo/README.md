# Roo Code port of the Confluence agent-builder

[Roo Code](https://github.com/RooCodeInc/Roo-Code) uses **custom modes** as
its agent unit and per-mode markdown rules under `.roo/rules-<slug>/`. There
is no first-class slash-command concept — instead you switch into the
relevant mode and the conversation runs under that mode's role definition
and rules.

| Claude Code path                          | Roo equivalent                                    |
| ----------------------------------------- | ------------------------------------------------- |
| `.claude/commands/bootstrap-team.md`      | `bootstrap-team` mode in `.roomodes` + `.roo/rules-bootstrap-team/` |
| `.claude/agents/meta-agent.md`            | `meta-agent` mode + `.roo/rules-meta-agent/`      |
| `.claude/agents/skill-creator.md`         | `skill-creator` mode + `.roo/rules-skill-creator/` |

To run the bootstrap flow in Roo:
1. Switch into the `bootstrap-team` mode.
2. Prompt: `bootstrap on space ENG` (or paste a space URL).
3. The mode follows the flow in `.roo/rules-bootstrap-team/01-flow.md`,
   handing off to `meta-agent` and `skill-creator` modes via Roo's
   `switch_mode` tool for each candidate.

Generated team-Sentra artefacts live under
`result-example/team-sentra/.roo/` and `result-example/team-sentra/.roomodes`.

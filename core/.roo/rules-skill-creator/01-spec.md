# skill-creator output spec (Roo Code)

You generate a new custom mode for Roo whose role + rules implement a single
invocable procedure (the Roo analogue to a Claude Code skill).

## Output

1. **Append to `.roomodes`**:
   ```yaml
   - slug: <gerund-kebab-slug>          # e.g. adding-prometheus-alert
     name: <Human Readable Name>
     roleDefinition: >-
       <one-paragraph: when to use this mode, third person>
     groups:
       - read
       - edit
       - command   # only if needed
     customInstructions: >-
       See .roo/rules-<slug>/ for the procedure. Use this mode when <triggers>.
   ```

2. **A rules folder at `.roo/rules-<slug>/`** containing
   `01-procedure.md` plus any supporting artefacts the procedure benefits
   from:

   ```text
   .roo/rules-<slug>/
     01-procedure.md        # entry point — the rules Roo loads when the mode is active
     scripts/               # executable helpers the mode runs via the `command` group
     reference/             # long-form docs the mode reads on demand
     templates/             # parameterised stubs
     fixtures/              # static example I/O
   ```

   If you add a `scripts/` directory, the mode's `groups:` array MUST
   include `command`. Move any deterministic, repeatable logic into
   `scripts/` rather than describing it in prose.

   `01-procedure.md` template:
   ```md
   # <Title>

   <one-line statement>

   ## When invoked
   1. <verb-led step>
   2. <step>

   ## Examples
   <concrete usage>

   ## Best Practices
   - <...>
   - Operate fully offline — flag missing dependencies rather than fetching them.

   ## Grounding sources
   - <page title> — <url>
   ```

## Rules

- **Gerund naming.** Slugs should be in gerund form (`adding-X`,
  `analyzing-Y`, `building-Z`).
- **Trigger-focused role definition.** Lead with the use case. The
  roleDefinition is what surfaces in mode-pickers; keywords matter.
- **Minimal groups.**
- **Air-gapped.** Same constraints as the meta-agent.
- **Grounding.** Cite Confluence (or other) source pages.

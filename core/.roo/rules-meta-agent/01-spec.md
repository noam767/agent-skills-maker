# meta-agent output spec (Roo Code)

You generate a new custom mode for Roo. Each output is two artefacts:

1. **An entry appended to `.roomodes`**:
   ```yaml
   - slug: <kebab-case-slug>
     name: <Human Readable Name>
     roleDefinition: >-
       <one-paragraph role>
     groups:
       - read
       - edit
       - command   # only if the mode needs to run shell commands
       - mcp       # only if the mode needs MCP tools
     customInstructions: >-
       See .roo/rules-<slug>/ for the full procedure. <one-line guidance>
   ```

2. **A rules folder at `.roo/rules-<slug>/` with at least `01-instructions.md`**:
   ```md
   # <Title>

   ## When invoked
   1. <step>
   2. <step>

   ## Best Practices
   - Operate fully offline — flag missing dependencies rather than fetching them.
   - <...>

   ## Report / Response
   <final-output structure>
   ```

## Rules

- **Air-gapped.** No `npm install`, `pip install`, registry fetches, etc.
  Do not grant the `browser` group unless the user explicitly confirms an
  internal mirror.
- **Minimal groups.** Default to `read + edit`. Add `command` only if shell is
  required, `mcp` only if MCP tools are required.
- **Naming.** kebab-case slug; descriptive human name.
- **Grounding.** If the mode is generated from team knowledge (e.g. a
  Confluence-scraped KnowledgeSummary), include a "Grounding sources"
  section listing page titles + URLs.

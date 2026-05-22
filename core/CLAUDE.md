<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:
`specs/001-confluence-agent-builder/plan.md`
<!-- SPECKIT END -->

# Bootstrap workflow — MCP-first rule (MANDATORY)

When the user asks you to "use this repo on the <SPACE>" Confluence space, or
"generate agents/skills for our team", you MUST follow this order:

1. **Detect MCP first.** Before you touch the Node scraper, check whether a
   Confluence or Atlassian MCP tool is available in the current session
   (look for tools with names containing `confluence`, `atlassian`, or
   `jira+confluence`). If one is available, you MUST use it for ALL data
   retrieval (space metadata, page listing, page bodies, ancestors, labels).
   Do NOT shell out to the Node scraper in this case.

2. **REST fallback.** Only if no Confluence/Atlassian MCP tool is available,
   shell out to `node scripts/scrape-confluence.js --space <KEY>`. Verify
   `CONFLUENCE_BASE_URL` and `CONFLUENCE_PAT` env vars are set before
   invoking; if either is missing, stop and point the user at `.env.example`.

3. **No mixed mode.** Don't combine MCP retrieval with REST retrieval in the
   same run. Pick one path at step 1 and stick with it.

4. **No silent skip of MCP.** If MCP is present but seems incomplete (e.g.,
   missing a tool you'd like), do not silently fall through to REST. Surface
   the gap to the user and ask before switching paths.

Full workflow contract: `specs/001-confluence-agent-builder/contracts/orchestration.md`.
Human-readable mirror: `../guides/bootstrap-flow.md`.

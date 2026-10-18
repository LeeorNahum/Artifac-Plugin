# Artifac Plugin

This repository packages Artifac for agent hosts: the plugin manifests, the MCP connection to
`https://mcp.artif.ac/mcp`, the `artifac` skill as a submodule, and the scripts and tests that
validate and release them. It is public. Server code, planning, and the skill's own source live
in their own repositories.

- The skill's source is the artifac-skill repository, a git submodule at `skills/artifac`. Change
  the skill there, release it, and move the submodule pointer here. Never edit files under
  `skills/artifac` from this repository, and never commit materialized skill files to `main`.
  Only the release scripts copy them, into staged packages and the `dist` branch the release
  workflow writes.
- The server, its tools, and the product live in the Artifac-Web repository, and the project's
  decisions in Artifac-Planning's `Context/`, both beside this one under the Artifac folder. A
  change here to the tool list, the server address, or the OAuth flow is checked against
  Artifac-Web, whose `packages/domain/src/mcp-tools.ts` defines the tools `scripts/validate.mjs`
  lists.
- Read SETUP.md and RELEASING.md before changing how the plugin installs or ships.
- Check every manifest field against the host's current first-party documentation or schema.
  `npm run validate` and `npm test` pass before any commit. Before a release, also run Claude
  Code's own check on what installs: stage the package and run `claude plugin validate --strict`
  on its `.claude-plugin/plugin.json` and on `.claude-plugin/marketplace.json`.
- Before committing, bring the installed skills current with
  `git submodule update --remote -- .agents/skills`, and when one changes, regenerate `CLAUDE.md`
  with `npx --yes github:LeeorNahum/claude-code-compat-skill`.
- No em dashes, en dashes, or semicolons as prose joiners in anything written here, commit
  messages included.

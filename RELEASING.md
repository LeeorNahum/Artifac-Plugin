# Releasing

`plugin.json` is the version source. The dependent manifests, the bundled skill, and the exact
published file inventory live in `scripts/release-contract.json`.

The skill is the `skills/artifac` submodule. Its files are never copied into this repository: the
release step stages them from the submodule as ordinary files, and the skill keeps its own
`metadata.version` in its own repository.

1. To ship a newer skill, release it in its repository first, then move the submodule to that
   commit with `git submodule update --remote -- skills/artifac` and commit the new pointer.
2. Set the next semantic version in `plugin.json`. A new skill version changes what the plugin
   delivers, so it is a plugin release of at least the same size.
3. Run `node scripts/sync-version.mjs --write`.
4. Run `npm ci`, `npm run validate`, and `npm test`.
5. Commit the complete release state and push it through review.
6. Confirm the reviewed commit is the current `origin/main` tip, tag it as `vX.Y.Z`, and push the
   tag.

The tag workflow checks out the submodule, rejects a tag that does not resolve to the current
`origin/main` tip or differs from `plugin.json`, and refuses a skill checkout that differs from
the recorded commit. It stages the contracted files with the skill materialized, creates a ZIP
and SHA-256 checksum, and publishes both to the GitHub release, whose notes name the skill
version and commit. It does not submit to or alter any marketplace or directory.

Validation uses canonical schemas vendored under `schemas/`. Normal validation is offline and
checks their recorded hashes. Refresh them only through the explicit network command
`node scripts/sync-schemas.mjs --refresh`, then review the generated diff.

## Hosts that install from Git

Claude Code and Codex install from a clone of this repository, so they read the skill through
the submodule. After any release, install the plugin from the published marketplace in a clean
host profile and confirm `skills/artifac/SKILL.md` is present in the installed copy, both on a
fresh install and on an update from the previous version.

## OpenAI's plugin portal

OpenAI's portal takes the package as a ZIP whose root holds `plugin.json`. It reads the listing,
the review cases, and the icon from `extensions.com.openai` in `plugin.json`, and it needs one
setting the Agent Plugins MCP schema does not allow: how the server's OAuth client is registered.
`node scripts/stage-openai.mjs --output dist/openai` stages the folder with the skill materialized
and that setting added to its copy of `mcp.json`. It refuses until `review.demo_recording_url`
holds the link to a recorded demo against production. Zip the contents of that folder, not the
folder itself, and upload it on the listing with **Upload new version**. Reviewer credentials
are entered in the portal and never go in the package.

A change to the server's tools needs no upload: the portal rescans the live server. A change to
the bundled skill, the listing text, or the review cases needs a new version and a new ZIP.

## Anthropic's directory

Anthropic's directory lists a plugin from its GitHub repository. Submit from the developer portal
at `https://claude.ai/directory/manage` with a paid claude.ai plan, after
`claude plugin validate --strict .` passes.

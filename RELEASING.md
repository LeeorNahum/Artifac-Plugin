# Releasing

`plugin.json` is the version source. The dependent manifests, the bundled skill, and the exact
published file inventory live in `scripts/release-contract.json`.

The skill is the `skills/artifac` submodule, and it keeps its own `metadata.version` in its own
repository. No commit on `main` copies its files. The release step stages them from the
submodule as ordinary files.

1. To ship a newer skill, release it in its repository first, then move the submodule to that
   commit with `git submodule update --remote -- skills/artifac` and commit the new pointer.
2. Set the next semantic version in `plugin.json`. A new skill version changes what the plugin
   delivers, so it is a plugin release of at least the same size.
3. Run `node scripts/sync-version.mjs --write`.
4. Run `npm ci`, `npm run validate`, and `npm test`. Then stage the package with
   `node scripts/stage-release.mjs --output <directory>` and run `claude plugin validate --strict`
   on `<directory>/.claude-plugin/plugin.json` and on `.claude-plugin/marketplace.json`. The
   repository root also holds maintainer files such as `CLAUDE.md` that never ship, so validate
   the staged package rather than the root.
5. Commit the complete release state and push it through review.
6. Confirm the reviewed commit is the current `origin/main` tip, tag it as `vX.Y.Z`, and push the
   tag.

The tag workflow checks out the submodule, rejects a tag that does not resolve to the current
`origin/main` tip or differs from `plugin.json`, and refuses a skill checkout that differs from
the recorded commit. It then:

- Stages the contracted files with the skill materialized, and creates a ZIP of them.
- Commits the staged package to the `dist` branch on top of the previous `dist` commit, with
  `scripts/dist-commit.mjs`, and pushes it without force.
- Publishes the ZIP as the GitHub release's only asset, with notes that name the skill version
  and commit. GitHub records the asset's SHA-256 digest on the release.

It does not submit to or alter any directory or portal.

Validation uses canonical schemas vendored under `schemas/`. Normal validation is offline and
checks their recorded hashes. Refresh them only through the explicit network command
`node scripts/sync-schemas.mjs --refresh`, then review the generated diff.

## Why hosts install from `dist`

Claude Code and Codex install a plugin from a Git clone. Codex copies the clone without fetching
submodules, so a plugin installed from `main` would arrive with an empty `skills/artifac`. The
marketplace entry therefore names `dist` as its source, and `dist` is written only by the release
workflow. Never edit or force-push it by hand. Users see a release once `dist` moves, so nothing
installs until the first release has run.

The Claude app, Cursor, and VS Code read the same marketplace entry, so they also install from
`dist`.

## Why the release has one asset

Gemini CLI installs `https://github.com/LeeorNahum/Artifac-Plugin` from the latest GitHub release
rather than from a clone. It takes the release's asset when there is exactly one, and otherwise
falls back to the tagged source, where `skills/artifac` is an empty submodule. So the release
carries only the ZIP, whose single top-level folder holds `gemini-extension.json` beside the
materialized skill, and a second asset would break Gemini installs.

To try a candidate locally, stage it with `node scripts/stage-release.mjs --output <directory>`
and start Claude Code with `claude --plugin-dir <directory>`, or install it into Gemini CLI with
`gemini extensions install <directory>`.

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
the strict validation in step 4 passes. Point the submission at the `dist` branch when the
portal asks for a ref, since that is the tree with the skill's files in place.

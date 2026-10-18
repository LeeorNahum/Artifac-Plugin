<!-- BEGIN claude-code-compat (generated, do not edit) -->

@AGENTS.md

# Nested AGENTS.md

Before you create, edit, or run files in a directory, read that directory's `AGENTS.md` first when one exists and is not already in your context. Only the root `AGENTS.md` and the files it imports are loaded above. Any other nested `AGENTS.md` holds local rules for its own subtree. The closest `AGENTS.md` at or above a file governs work on that file, so check for one whenever you enter a new part of the tree (a package, an app, or a skill directory).

# Agent Skills Index

These project skills are not Claude Code slash-command skills. When a listed skill is relevant, read its `SKILL.md` path directly instead of trying a Skill tool or slash command.

Each description is the trigger. Respect it, and when it matches the task, read the skill's `SKILL.md` plus any relevant references, assets, scripts, or nearby root files the skill points to.

## [release-versioning](.agents/skills/release-versioning/SKILL.md)

> Use when deciding or making a version bump, including a skill's metadata.version, preparing or publishing a GitHub release, publishing binaries or archives, attaching release assets, syncing README badges and version mentions, updating package or app metadata, or making sure version constants and docs agree before a release. Manages versioned releases and release artifacts across software, apps, firmware, skills, packages, and downloadable builds.

<!-- END claude-code-compat -->

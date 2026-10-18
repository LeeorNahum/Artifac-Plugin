# Artifac plugin

[![GitHub Release](https://img.shields.io/github/v/release/LeeorNahum/Artifac-Plugin?sort=semver)](https://github.com/LeeorNahum/Artifac-Plugin/releases/latest)

Connects an agent to [Artifac](https://artif.ac) through `https://mcp.artif.ac/mcp` and bundles
the `artifac` Agent Skill, which teaches the agent to create and update artifacts, keep saved
data, choose how to transfer each file, and recover from errors. The plugin ships the
[Agent Plugins 1.0.0](https://agent-plugins.org) manifests (`plugin.json`, `mcp.json`) and a
Claude Code adapter (`.claude-plugin/`, `.mcp.json`). It runs no hooks.

The skill lives in its own repository,
[artifac-skill](https://github.com/LeeorNahum/artifac-skill), included here as a git submodule
at `skills/artifac`. Release packages carry its files as ordinary files.

## Tools

- `list_workspaces` and `list_artifacts` find where you can create and what exists.
- `read_artifact` reads an artifact's details and file manifest, or one file.
- `create_artifact` makes a new artifact from files that include `index.html`.
- `update_artifact` adds or replaces files together, and `edit_artifact_file` makes one exact
  replacement in a text file.
- `delete_artifact_files` deletes files by exact path, and `delete_artifact` moves a whole
  artifact to Trash.

Saved data and its access rules are files under `.artifac/`, read and written with the same
tools. Sharing, visibility, subdomains, and restoring from Trash happen in the Artifac app.

## Connection

The host signs you in through its own MCP authentication the first time it calls the server.
The connection reaches every workspace you belong to, now or later, and artifacts shared with you
individually, with your current role in each. See [SETUP.md](SETUP.md) for the Claude Code steps
and troubleshooting.

## Install

```bash
# Claude Code
/plugin marketplace add LeeorNahum/Artifac-Plugin
/plugin install artifac@artifac

# Codex
codex plugin marketplace add LeeorNahum/Artifac-Plugin
codex plugin add artifac@artifac
```

In the Claude app, open Customize, then Plugins, add this repository as a marketplace by its
GitHub address, and install Artifac from it.

Any other MCP client can add `https://mcp.artif.ac/mcp` as a remote server, and install the skill
from its own repository.

To work on the plugin itself, clone it with its submodules:

```bash
git clone --recurse-submodules https://github.com/LeeorNahum/Artifac-Plugin.git
```

## Update

First refresh the marketplace metadata, then refresh the installed package:

```bash
# Claude Code
claude plugin marketplace update artifac
claude plugin update artifac@artifac

# Codex
codex plugin marketplace upgrade artifac
codex plugin add artifac@artifac
```

Start a new session after the update so the host rediscovers the skill and the server's tools.

## Before publishing

`.gitmodules` points `skills/artifac` at the local checkout `../../Skill/artifac-skill` until the
skill repository is public. Switch it with one line, `url = https://github.com/LeeorNahum/artifac-skill.git`,
then run `git submodule sync -- skills/artifac` and delete this section.

Licensed under the [Apache License 2.0](LICENSE).

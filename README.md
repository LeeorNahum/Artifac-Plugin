# Artifac plugin

[![GitHub Release](https://img.shields.io/github/v/release/LeeorNahum/Artifac-Plugin?sort=semver)](https://github.com/LeeorNahum/Artifac-Plugin/releases/latest)

[Artifac](https://artif.ac) hosts interactive web pages, apps, and sites that agents make, each at
its own artif.ac link. This plugin gives your agent the Artifac tools and the `artifac` skill,
which teaches it to create and update artifacts, keep saved data, choose how to send each file,
and recover from errors.

## Install

In a terminal:

```bash
# Claude Code
claude plugin marketplace add LeeorNahum/Artifac-Plugin
claude plugin install artifac@artifac

# Codex, for Codex CLI and the ChatGPT desktop app
codex plugin marketplace add LeeorNahum/Artifac-Plugin
codex plugin add artifac@artifac

# Gemini CLI
gemini extensions install https://github.com/LeeorNahum/Artifac-Plugin
```

Inside a Claude Code session, `/plugin marketplace add LeeorNahum/Artifac-Plugin` and
`/plugin install artifac@artifac` do the same.

- **Claude app** (claude.ai, the desktop app, and Cowork): open Customize, then Plugins. Choose
  Add, then Add marketplace, enter `LeeorNahum/Artifac-Plugin`, and install Artifac from it.
- **Cursor**: open Customize, then Plugins, and choose Browse Marketplace. Choose Add Marketplace,
  then Import from Github, paste `https://github.com/LeeorNahum/Artifac-Plugin`, and install
  Artifac from it.
- **VS Code with Copilot**: in your user `settings.json`, add `"LeeorNahum/Artifac-Plugin"` to
  `chat.plugins.marketplaces`. Then search the Extensions view for `@agentPlugins` and install
  Artifac. If it does not appear, check that `chat.plugins.enabled` is on.
- **Devin Desktop**, formerly Windsurf: in Devin's Customize page, open Plugins, then Plugin
  settings, then Edit manifest, and add
  `{ "source": "github", "repo": "LeeorNahum/Artifac-Plugin", "ref": "dist" }` to
  `requiredPlugins` in your Personal scope.
- **ChatGPT on the web**: open [ChatGPT Plugins](https://chatgpt.com/plugins), choose the plus
  button, then Add custom MCP server. Give it the name Artifac, enter `https://mcp.artif.ac/mcp`
  as the server URL, choose OAuth for authentication, and choose Create as a plugin. This adds
  the Artifac tools without the skill, and your account or workspace settings decide whether the
  option is offered.
- **Any other MCP client**: add `https://mcp.artif.ac/mcp` as a remote Streamable HTTP server.

## Sign in

Most hosts ask you to sign in to Artifac the first time your agent uses it. The Claude app waits
until you connect the plugin yourself. [SETUP.md](SETUP.md) has each host's steps and how to check
the connection.

The connection reaches every workspace you belong to, now or later, and artifacts shared with you
individually, with your current role in each.

## Update

```bash
# Claude Code: refresh the marketplace, then the plugin
claude plugin marketplace update artifac
claude plugin update artifac@artifac

# Codex: refresh the marketplace, then the plugin
codex plugin marketplace upgrade artifac
codex plugin add artifac@artifac

# Gemini CLI
gemini extensions update artifac
```

In the Claude app, select Check for updates on the marketplace, or turn on Sync automatically.

Start a new session after the update so the host rediscovers the skill and the server's tools.

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

## Package contents

The plugin connects the remote MCP server `https://mcp.artif.ac/mcp` and runs no hooks. It ships
the [Agent Plugins 1.0.0](https://agent-plugins.org) manifests (`plugin.json`, `mcp.json`), the
Claude plugin manifests (`.claude-plugin/`, `.mcp.json`), and the Gemini CLI extension manifest
(`gemini-extension.json`). The skill lives in its own repository,
[artifac-skill](https://github.com/LeeorNahum/artifac-skill), included here at `skills/artifac`.

To work on the plugin itself, clone it with its submodules:

```bash
git clone --recurse-submodules https://github.com/LeeorNahum/Artifac-Plugin.git
```

Licensed under the [Apache License 2.0](LICENSE).

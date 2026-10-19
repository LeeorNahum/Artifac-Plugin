# Connecting Artifac

The plugin adds one remote MCP server, `artifac`, at `https://mcp.artif.ac/mcp`. It needs no API
key, custom header, environment variable, or project file.

## Sign in

Signing in opens an Artifac page in your browser, where you sign in and approve the connection.
Most hosts start it the first time your agent uses Artifac. If the Artifac tools already appear in
your agent, you are connected and do not need to sign in again.

- **Claude Code**: to start it yourself, open `/mcp`, select `plugin:artifac:artifac`, and choose
  **Authenticate**. If Claude Code runs somewhere that cannot receive the browser's return to
  localhost, use the completion option Claude Code offers, and paste the full callback URL only
  when it asks for it.
- **Claude app**: open the Artifac plugin from Customize, then Plugins, and connect it on its
  Connectors tab. The skill works as soon as the plugin is installed, and the Artifac tools appear
  once you connect.
- **Codex**: run `codex mcp login artifac`. In the ChatGPT desktop app, open Settings, then MCP
  servers, and choose **Authenticate** beside `artifac`.
- **Gemini CLI**: run `/mcp auth artifac`.
- **Cursor**: the `artifac` server appears among the MCP servers in Customize, where you can start
  the sign-in if Cursor has not asked already.
- **VS Code**: run **MCP: List Servers** from the Command Palette and select `artifac` to start the
  sign-in if VS Code has not asked already.
- **Devin Desktop**: for local sessions, run `devin mcp login artifac` in a terminal with the
  Devin CLI. For Devin's cloud sessions, open the Artifac
  plugin in Devin's Customize page and connect its MCP server from the plugin's details.
- **ChatGPT on the web**: with OAuth set when you create the plugin, ChatGPT opens the Artifac
  sign-in. To
  reconnect, open the plugin in ChatGPT Plugins and connect it again.

## Check the connection

Ask your agent to list your Artifac workspaces. Every account has at least one, so a list means
the connection works.

- If the agent reports `unauthorized`, the sign-in expired or was revoked. Sign in again.
- If the server cannot be reached at all, check your internet connection before signing in again.
  That is a network problem, not a sign-in problem.

## The command line

To send files from your computer, such as images or a site's build folder, the agent may use the
Artifac CLI. It runs with `npx artifac` and needs Node.js. Sign in to it once with
`npx artifac login`, separately from the MCP connection.

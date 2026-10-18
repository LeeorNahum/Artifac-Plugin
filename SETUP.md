# Connecting Artifac

The plugin adds one remote MCP server, `artifac`, at `https://mcp.artif.ac/mcp`. It needs no API
key, custom header, environment variable, or project file.

## Sign in

The first time your agent uses Artifac, the host asks you to sign in. It opens an Artifac sign-in
page in your browser, where you sign in and approve the connection. If the Artifac tools already
appear in your agent, you are connected and do not need to sign in again.

In Claude Code, you can also start it yourself: open `/mcp`, select `plugin:artifac:artifac`, and
choose **Authenticate**. If Claude Code runs somewhere that cannot receive the browser's return to
localhost, use the completion option Claude Code offers, and paste the full callback URL only when
it asks for it.

In Codex, run `codex mcp login artifac`.

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

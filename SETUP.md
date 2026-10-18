# Connecting Artifac

The plugin declares one remote MCP server, `artifac`, at `https://mcp.artif.ac/mcp`. It needs no
API key, custom header, environment variable, or project file.

## Connect when the host asks

If the Artifac tools are already present, confirm the connection with `list_workspaces` and do
not sign in again. If the host reports that the server needs authentication, use that host's MCP
authentication flow, which opens an Artifac sign-in page in the browser. The person signs in and
approves the connection there.

In Claude Code, open `/mcp`, select `plugin:artifac:artifac`, and choose **Authenticate**. If a
remote environment cannot receive the localhost callback, use the completion action the host
offers and give the full callback URL only when it asks for it.

## Confirm the result

Call `list_workspaces`. A list with at least one workspace means the connection works, since
every account has one.

- `unauthorized` means the sign-in expired or was revoked. Authenticate again.
- An unreachable endpoint is a network problem, not a credential problem. Check ordinary HTTPS
  connectivity before signing in again.

## The CLI

The skill sometimes uses the Artifac CLI to send local files. It runs with `npx artifac` and needs
Node.js. The person signs in to it once with `npx artifac login`, separately from the MCP
connection.

---
name: "artifac"
description: "Use when building, publishing, updating, or fixing an interactive web page, app, game, dashboard, or static site on Artifac (artif.ac), and whenever a task calls Artifac's MCP tools such as create_artifact or update_artifact, its HTTP API, or the `npx artifac` CLI. Also use when an Artifac page needs saved data that visitors share or keep as their own, a title, favicon, or link preview, or images and other files sent to it, and when the user asks to host an HTML page at a link while Artifac is connected, even without naming Artifac. Teaches how to create and change artifacts without losing anyone's work, store saved data, choose how to transfer each file, and recover from each error."
license: "Apache-2.0"
metadata:
  author: "Leeor Nahum"
  version: "1.1.0"
---

# Artifac

Artifac hosts interactive static artifacts: HTML, CSS, JavaScript, assets, and saved app data, opened in a browser at the artifact's stable URL, `https://artif.ac/{id}`. Nothing server-side runs: no uploaded server code, server rendering, or background jobs. A single `index.html` is a complete artifact, so start there and add files only when the page needs them.

## Pick The Surface

All three reach the same operations, rules, and typed errors for the signed-in person.

| Surface | Use it when | Where |
| --- | --- | --- |
| MCP tools | The host has Artifac connected | `https://mcp.artif.ac/mcp` |
| CLI | You can run commands and the files are on disk, especially folders, build output, or binary files | `npx artifac` |
| HTTP API | A script or integration calls Artifac | `https://api.artif.ac/v1`, described at `https://api.artif.ac/openapi.json` |

Read [HTTP API and CLI](references/http-and-cli.md) before using either of those two.

## Create

1. Call `list_workspaces` and pick one where `can_create_artifacts` is true. When the person has several and has not said which, ask: the workspace owns the artifact.
2. Call `create_artifact` with `index.html` at the root and every other file the page needs, in one call.
3. Give the person the returned `url`, and say who can open it, from the returned `visibility`.

Each `create_artifact` call makes another artifact. If one fails with `internal`, list the workspace's artifacts before trying again, since it may have landed.

## Sharing Is The Person's

A new artifact opens only for its workspace's members. Who can open an artifact and its subdomain are the person's choice, made by an Owner in the Artifac app: the artifact's visibility, its invitations and roles, and the workspace's members, invitations, and roles. Never change any of them yourself, by any route: not through a tool, a browser, computer use, or the app's own pages, even when the person asks for a page others can open. Instead:

- Tell them who can open it now, from `visibility` (`workspace` is "Workspace only", `unlisted` is "Anyone with the link", `public` is "Public"), and the link: `site_url` when it is set, otherwise `url`.
- Tell them where to change it: the artifact's settings page in the Artifac app, `https://app.artif.ac/{id}` (Settings and sharing in its library menu), under Sharing, "Who can open it". "Anyone with the link" lets people with the link open it, "Public" lets anyone, and "Invite someone to this artifact" adds a person by email. Its subdomain is set on the same page, under Subdomain.
- Only Owners see those sections. When the person's `role` is not `owner`, tell them an Owner of the workspace has to make the change.

Restoring from Trash happens on the workspace's Trash page, `https://app.artif.ac/workspaces/{workspace_id}/trash`, which only Owners see.

## Change Files

Start with `read_artifact` and no `path`. It returns the artifact's URLs (when `site_url` is set, the artifact opens there, on its subdomain, instead of at `url`), capabilities, limits, and usage, and a manifest that gives each path its kind (`source`, `asset`, `data`, or `config`), revision, and what you may do to it (`read`, `replace`, `edit`, `delete`).

- **Exact edits first.** `edit_artifact_file` replaces `old_string`, which must appear exactly once, in a text file's current content. It never overwrites someone else's change: if their change removed your text, the edit fails instead. Copy `old_string` from a fresh read, not from memory.
- **Whole-file replacement needs a read.** `update_artifact` replaces an existing path only when your connection read it, or wrote it, at its current revision. `read_required` means read it, then send again. `conflict` means it changed since: read it again and reapply your change to the new content. Never resend the text you built from the old version.
- **Read every page before rewriting a file.** Text reads come in pages of lines, and reading the first page already counts as a read. Follow `next_offset` until it is null before you replace a file whole, or the replacement drops what you did not read. A `cut_line` marks a line longer than one read returns, and the whole file, saved data included, is at `download_url`.
- **Sessions sharing one credential share one read receipt.** Every conversation one person has through the same connected app counts as the same reader, so a read made in another conversation lets this one replace a file whose newer content it never saw. Read a file again just before replacing it whole.
- **One change per intent.** List every file of one change in a single `update_artifact` call. It applies all of them or none, keeps every file and saved record you leave out, and goes live at once: open pages reload on every accepted code change.
- **Deleting.** `delete_artifact_files` takes exact paths. `index.html` cannot be deleted, so replace it instead. `delete_artifact` moves the whole artifact to Trash, so call it only when the person asked to delete the artifact itself.

## Transfer Files

Give each file exactly one of these sources, chosen by where its bytes are:

| The file | Send it as |
| --- | --- |
| Text (HTML, CSS, JavaScript, JSON, SVG, Markdown) small enough to send inline | `content`, its full UTF-8 text |
| Bytes at a public `https://` URL that answers with the file itself | `source_url`, which Artifac fetches |
| In `fileParams`, from a host that supports it (below) | `attachment_index`, the file's position in `fileParams` |
| On the person's computer, when the host's `fileParams` cannot take it | `npx artifac upload --artifact <id> <file>` (or `--workspace <id>` for a new artifact), then its `upload_id`. For a folder, send it whole with `npx artifac create` or `update` |

`create_artifact` and `update_artifact` declare `fileParams` through OpenAI's `openai/fileParams` tool metadata, and what it carries depends on the host:

- **ChatGPT** fills `fileParams` with the files the person attached to the conversation.
- **Codex with Artifac connected as a ChatGPT app** shows `fileParams` to you as local file paths. List each local file's path there, and Codex uploads it before the call reaches Artifac. If Codex cannot upload a file, use the CLI.
- **A host that does not honor `openai/fileParams`** leaves it empty, so use the CLI. Never build `fileParams` entries yourself there, and send a public file as `source_url`.

Set each file's `attachment_index` to its position in `fileParams`. An index into an empty `fileParams` answers `transfer_unsupported`, and one past its end answers `validation_failed`.

For a file on the person's computer, the CLI is the route. Run `npx artifac upload` when you can run commands, or ask the person to run it and give you the `upload_id` it prints. The CLI needs one sign-in, which is the person's: whenever it tells you to run `npx artifac login`, ask the person to run it and wait for them, and never start the sign-in yourself.

Binary files (raster images, fonts, audio, video, PDF, archives) never travel as `content`. When none of the rows fits, as when a person attached a file in a host that gives tools no access to attachment bytes and you cannot run commands, stop and say so. Offer every route that works: the CLI upload, a public URL for the file, or pasting a text file's text. Never put base64 in `content` or a `data:` URL, and never pass a local path, sandbox path, or host file ID as `source_url`. `transfer_unsupported` names this case.

An upload is used once, belongs to the person and the artifact or workspace it names, and expires, so one made with the CLI works in that person's MCP calls for the same target.

## Saved Data

Saved data is collections of JSON records that a page reads and writes live through the runtime SDK at `/__artifac/sdk.js`, and that you read and write as `.artifac/data/<collection>.json` with the same file tools. `.artifac/config.json` sets each collection's read policy (`shared` or `own`) and write rule (`any`, `own`, or `editors`), and a collection it does not name is `shared` with `any`. Code changes never reset saved data.

Read [saved data](references/saved-data.md) before a page stores anything, before writing the configuration, and before changing a data file. Copy [the saved-data starter](assets/saved-data-starter.html) as the base for a page that keeps records.

## Metadata

The library, the browser tab, and link previews take their metadata from the head of `index.html`, refreshed on every change. There is no metadata tool.

- `<title>` names the artifact, else `og:title`.
- `<meta name="description">`, else `og:description`.
- `<link rel="icon" href="...">` with a path inside the artifact or an `https://` URL. A `data:` URL is ignored.
- `og:image` or `twitter:image` for the preview image, a path inside the artifact or an `https://` URL. Without one, link previews of a public or unlisted artifact show a card Artifac draws from the title and description.

Put these tags at the top of the head. Only `index.html` is read for them.

## Paths And Serving

- Paths are relative, case-sensitive, and normalized: `/` separators, no leading slash, no `.` or `..` segment, no `?`, `#`, or backslash, and no segment ending in a dot or space.
- `.artifac/` holds only `config.json` and `data/<collection>.json`, and is never served. `__artifac/` belongs to Artifac's own scripts. Neither can hold your files.
- The artifact is served at its own root, so root-relative (`/js/app.js`) and relative URLs both work, at the stable URL and on a subdomain.
- `/guide/` serves `guide/index.html`. `/guide` serves `guide` or `guide.html` when one exists, and otherwise moves to `/guide/` when `guide/index.html` does, so relative links in a folder's page resolve inside the folder. There is no fallback page and no custom 404, so a client-side router needs hash routing or one HTML file per route, as a static export produces.
- For framework output, send the build folder with the CLI.

## How The Page Runs

The artifact runs in a sandboxed frame on an origin of its own:

- It cannot navigate the top-level page, so links that leave the artifact need `target="_blank"`.
- Camera, microphone, and location are unavailable, and service workers are refused.
- `localStorage` and IndexedDB belong to this artifact in this browser only. Use saved data for anything another visitor or device should see. Cookies can be visible to other artifacts, so keep nothing private in them.
- A frame the page nests gets no SDK.
- Outside an Artifac page the SDK fails to load (opened from disk) or throws `unavailable`. Load it with a dynamic `import()` and make the page render without saved data.

## Viewer Identity

Artifact code never receives a person's account ID, name, or email. A signed-in viewer appears to an artifact under a pseudonym that is different in every artifact for the same person, and an anonymous visitor under a key derived from their browser and that artifact, the same at its stable URL and on its subdomain. Whichever applies owns the records they create there.

- Learn about the viewer through the SDK: `session()` says whether they are signed in, their role, and what they may do in each configured collection, and each record's `mine` flag says whether they created it. The data file shows the same `mine` flag, never an owner value.
- Never build identity that spans artifacts, and never treat an anonymous visitor's ownership as proof of who they are.
- Never decode the runtime token the SDK holds. Its contents are the SDK's own.

## Errors

Every refusal is JSON, `{ "error": { "code", "message", "hint", "details" } }`, and a failed call changed nothing. Follow the hint, read `details` for the limit or field involved, and read [error recovery](references/errors.md) for any code not covered above.

## Limits

Allowances and limits change with the plan and over time, so read them from the product, never from memory: `read_artifact` returns `limits` and `usage`, each tool's input schema states its inline and page sizes, the HTTP API publishes them at `/openapi.json`, and an error's `details` names the limit it hit. At a limit nothing is lost. Free space only by removing what the person agrees to remove.

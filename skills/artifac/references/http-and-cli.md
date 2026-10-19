# HTTP API And CLI

Both act for one signed-in person with the same rules and error codes as the MCP tools. They add what MCP cannot do: send local files and folders, and upload bytes directly.

## CLI

`npx artifac` needs Node.js. Signing in is the person's: ask them to run `npx artifac login`, which opens their browser, and wait for them to finish. Never run `login` yourself, even when you can run commands, and never handle their credentials. `npx artifac --help` lists every command and option.

| Command | Does |
| --- | --- |
| `workspaces` | Lists workspaces, marking where you can create |
| `list [--workspace <id>] [--shared] [--query <text>] [--sort <order>]` | Lists artifacts |
| `read <id> [path] [--offset n] [--limit n] [--out <file>]` | Reads details and the manifest, or one file. `--out` saves the whole file, whatever its size or type. A text file read page by page is saved with a final newline |
| `create --workspace <id> <file or folder>...` | Creates an artifact. `index.html` must be at the top |
| `update <id> <file or folder>... [--overwrite]` | Adds or replaces files |
| `edit <id> <path> --old <text> --new <text>` | One exact replacement |
| `rm <id> <path>...` | Deletes files by exact path |
| `delete <id>` | Moves the artifact to Trash |
| `upload (--artifact <id> \| --workspace <id>) <file>` | Uploads one file and prints an `upload_id` for an MCP or API call |

- A folder sends every file inside it at its path within that folder, so pass the folder that holds `index.html`, such as a build's output folder. A single file keeps its path relative to the current folder. Version-control folders, `node_modules`, and system clutter files are skipped.
- Small text files go inline and everything else goes as a direct upload, chosen for you.
- A large send is split into batches, each its own change. If one fails, the earlier batches stay applied and the CLI says how to send the rest.
- `update` replaces an existing file only after a `read` of it with the same sign-in. `--overwrite` replaces without that read, and still fails if the file changes while the command runs, so use it only when the local files are meant to win.
- Each sign-in keeps its own read receipts, separate from MCP connections.
- `--json` prints the API's JSON for a script to parse.

## HTTP API

Base `https://api.artif.ac/v1`. The OpenAPI document at `https://api.artif.ac/openapi.json` is the contract, with every request and response schema and the limits written into them.

Send `Authorization: Bearer <OAuth access token>` for the person. `/.well-known/oauth-protected-resource` names the authorization server.

| Operation | Request |
| --- | --- |
| List workspaces | `GET /v1/workspaces` |
| List artifacts | `GET /v1/artifacts` with `workspace_id`, `shared_with_me`, `query`, `sort`, `cursor`, `limit` |
| Create | `POST /v1/artifacts` with `{ workspace_id, files }` |
| Read details or a file | `GET /v1/artifacts/{id}` with `path`, `offset`, `limit` |
| Add or replace files | `POST /v1/artifacts/{id}/files` with `{ files }` |
| Exact edit | `POST /v1/artifacts/{id}/files/edit` with `{ path, old_string, new_string }` |
| Delete files | `POST /v1/artifacts/{id}/files/delete` with `{ paths }` |
| Move to Trash | `DELETE /v1/artifacts/{id}` |
| Start an upload | `POST /v1/uploads` |
| Complete an upload | `POST /v1/uploads/{upload_id}/complete` |

Each file in `files` is `{ path }` plus exactly one of `content`, `source_url`, or `upload_id`.

- **Replacing without a read.** A file entry may carry `if_revision`, the revision from the manifest or a read. Without it, replacing an existing file needs this client's earlier read.
  - A source or asset file must be at exactly that revision, and `null` means it must not exist yet. Anything else answers `conflict`.
  - `.artifac/config.json` is at revision 0 until it is first written, so `0` and `null` both name the never-written file.
  - A saved-data file's revision is the collection's change sequence, 0 until the collection is first written. Here `if_revision` is the version your file is based on, and `null` means 0. A record changed after it conflicts if your file changes it or leaves it out, a record created after it is kept, and a number above the current sequence answers `conflict`.
  - So `null` on a collection that already holds records can only add records, never delete them.
- **Separate receipts per session.** Read receipts belong to the person and the OAuth client. Send an `Artifac-Session` header with your own stable ID for one job to keep its receipts apart from other runs of the same client.
- **Uploads.** `POST /v1/uploads` with `{ artifact_id }` or `{ workspace_id }`, plus the exact `size` in bytes and the `content_type`. PUT exactly those bytes to `put_url` with the returned `headers`, then complete the upload. Use its `upload_id` once, for that target, before `expires_at`.
- **Images.** A read of an image also returns `image`, `{ data, mime_type }`, with `data` the base64 bytes of the image shown, beside the same fields the MCP tool returns. When `content.derived_preview` is true, those bytes are a smaller preview and the original is at `content.original.url`, so never save `data` back as the file. `image` is `null` whenever a read returns no inline image.
- **Errors.** The body is `{ "error": { code, message, hint, details } }` with a matching HTTP status. `429` and `503` carry `Retry-After`. A body over the request limit answers `413 payload_too_large`, so send big files as uploads.

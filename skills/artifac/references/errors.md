# Error Recovery

Every refusal carries `code`, `message`, `hint`, and sometimes `details`. A failed call changed nothing, except a multi-batch CLI send, which reports the batches already applied. The hint is written for every surface. This table adds what an agent should do next.

| Code | What to do |
| --- | --- |
| `unauthorized` | The connection's sign-in expired or was revoked. Ask the person to reconnect Artifac through the host's MCP authentication, or run `npx artifac login` for the CLI. Never ask for a password or token in chat |
| `forbidden` | The person's role does not allow this here, such as a Viewer changing code. Say which role it needs. Sharing, visibility, subdomains, and Trash are managed in the Artifac app, never through a tool |
| `not_found` | The ID or path does not exist, or the person cannot see it. List workspaces or artifacts, or read the manifest, for current IDs and paths. Do not guess IDs |
| `validation_failed` | An argument or file is malformed. `details.issues` names each field and rule. Fix those and send again |
| `invalid_path` | Rename the path to a relative, normalized one. The message and `details.rule` name the rule it broke |
| `reserved_path` | Under `.artifac/` only `config.json` and `data/<collection>.json` exist, and `__artifac/` is Artifac's. Move the file elsewhere |
| `entry_point_required` | A new artifact needs `index.html` at its root, and `index.html` cannot be deleted. Send new content for it instead |
| `edit_match_not_found` | The text is not in the current file, often because it changed. Read the file again and copy `old_string` exactly from it |
| `edit_match_ambiguous` | The text appears more than once. Add surrounding lines until it is unique |
| `edit_unsupported` | Exact edits apply to UTF-8 text files up to the edit size limit in `read_artifact`'s `limits`. Replace it whole with `update_artifact` after reading it (every page, for text), sending a binary or oversized file through a transfer route |
| `read_required` | Read the file (every page, for a long one), then send the replacement, or make an exact edit instead |
| `conflict` | Someone changed the file, record, or collection after your read. Read it again and reapply your change to what is there now. Never resend the stale version |
| `quota_exceeded` | An allowance is full, named in `details`. Tell the person. Remove files or saved data only with their agreement. Trash frees the active-artifact slot, but its bytes count until it is permanently deleted in the app. A paid plan raises allowances |
| `limit_reached` | A limit that is the same on every plan. Make room, or split the work, such as fewer collections or records |
| `file_too_large` | The file is over the per-file limit in `details`. Make it smaller, for example by compressing an image, before sending it again |
| `payload_too_large` | Too many or too large files in one call. Send fewer per call, or move large files to an upload or `source_url` |
| `plan_suspended` | The owning account's plan does not cover this artifact right now. Nothing an agent can fix. Tell the person that freeing capacity or renewing the plan restores it |
| `seat_suspended` | The workspace has more members than its plan admits. Its Owner frees a seat in the app |
| `rate_limited` | Wait `details.retry_after_ms`, then retry once. Batch changes into fewer calls |
| `try_again` | Something was still finishing. Retry after a moment |
| `transfer_unsupported` | No byte route reached this file. Pick a route from the transfer table, or tell the person which routes would work |
| `source_unreachable` | Artifac could not fetch `source_url`, or a call's imports ran too long. Check that the URL is public and serves the file itself, not a page about it. Import fewer files per call, or upload instead |
| `upload_invalid` | The upload is unknown, incomplete, used, expired, or for another target. Make a new upload for this artifact or workspace and use it once |
| `internal` | Retry once. After a failed `create_artifact`, list the workspace's artifacts first, because the artifact may exist |

The remaining codes (`invitation_invalid`, `account_closed`, `name_invalid`, `name_unavailable`, and `trash_restore_blocked`) come from the Artifac app's own sharing, subdomain, and Trash screens. Pass their hint on to the person.

Runtime SDK calls raise the same codes as an `ArtifacError`, plus `unavailable` when the page is not open inside Artifac.

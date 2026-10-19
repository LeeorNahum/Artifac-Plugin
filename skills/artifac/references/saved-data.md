# Saved Data

Saved data is an artifact's collections of records. A page reads and writes records one at a time, live, through the runtime SDK. An agent reads and writes the same records as JSON files. Both go through the same server checks: policies, validation, quotas, and conflict detection.

## Choose The Policy

Each collection has a read policy and a write rule.

| Read | Who reads records |
| --- | --- |
| `shared` | Everyone who can open the artifact reads every record |
| `own` | Each person reads only the records they created. Editors and Owners read all of them |

| Write | Who writes records |
| --- | --- |
| `any` | Anyone who can read the collection creates, changes, and deletes any record they can read |
| `own` | Anyone creates records, and only a record's creator changes or deletes it. Editors and Owners change any |
| `editors` | Only Editors and Owners write. Everyone else reads |

`own` reading requires `own` writing. Common shapes:

| Page | Policy |
| --- | --- |
| Shared checklist, board, or tally everyone edits | `shared` with `any` (the default) |
| Sign-up sheet or guestbook everyone sees, each person editing only their own entry | `shared` with `own` |
| Form or survey where each person sees only their own answers | `own` with `own` |
| Announcements or content only the authors change | `shared` with `editors` |

Viewers of an artifact can write saved data, within these rules. Public and unlisted visitors can too, without signing in. The server enforces every rule, so never rely on page code to hide or block what a policy allows.

## The Configuration File

`.artifac/config.json` names collections and their policies:

```json
{
  "collections": {
    "tasks": { "read": "shared", "write": "any" },
    "answers": { "read": "own", "write": "own" }
  }
}
```

- Collection names start with a lowercase letter and use `a-z`, `0-9`, `_`, and `-`.
- A collection the file does not name is `shared` with `any`.
- Only Editors and Owners change the configuration, the same people who change code.
- A collection that holds records stays in the file. Leaving one out would silently loosen it to `shared` with `any`, so that write is refused. To change its policy, keep it listed with the new policy.
- Reading the file shows every configured collection spelled out. Deleting it resets the configuration, under the same rule.

## The Data File

`.artifac/data/<collection>.json` is your view of one collection: the records you may read, oldest first.

```json
{
  "records": [
    {
      "id": "8xQ2mRk4TbWz",
      "mine": true,
      "revision": 3,
      "created_at": "2026-10-18T14:02:11.000Z",
      "updated_at": "2026-10-18T15:40:02.000Z",
      "data": { "text": "Order chairs", "done": false }
    }
  ]
}
```

`data` is always a JSON object. `id`, `mine`, `revision`, and the times are set by Artifac. You act as the person you are signed in as, with their role, so an Editor's or Owner's view of an `own` collection holds every record.

Writing it with `update_artifact`, against the version you last read:

- A record with an `id` updates that record when its `data` differs. The read-only fields may be sent back unchanged.
- A record without an `id` is created.
- A record you leave out is deleted, unless you may not change it (it stays) or it was created after your read (you never saw it, so it stays).
- A record changed by anyone after your read makes the whole write fail with `conflict`. Read the file again and reapply.
- Records outside your view are never touched.

To seed a new collection, write its file with records that have no `id`. An exact edit with `edit_artifact_file` works too and must leave valid JSON. Deleting the file removes only the records you may delete, and needs a read first when it holds records.

## The Runtime SDK

The SDK is served at `/__artifac/sdk.js` on every artifact. Import it dynamically, so the page still renders where it cannot load, as when opened from disk:

```js
let artifac = null;
try {
  artifac = await import("/__artifac/sdk.js");
} catch {
  // Not running in Artifac: render without saved data.
}
```

| Call | Does |
| --- | --- |
| `collection(name)` | A handle on one collection |
| `.subscribe((records, complete) => ..., { onError })` | Calls back with every record now and after each change by anyone, until the returned function is called. `complete` is false when the collection is larger than a live list follows |
| `.list({ limit, cursor })` | One page of records, oldest first, with the `cursor` for the next page or null |
| `.add(data)` | Creates a record, answering `{ id, revision }` |
| `.update(id, { merge: fields })` | Sets the given top-level fields and keeps the rest |
| `.update(id, { data })` | Replaces the record's data |
| `.remove(id)` | Deletes the record |
| `session()` | `{ viewer: { signed_in }, role, can_write, collections, revision }` |

Records have the same shape as in the data file.

- Toggle or set single fields with `merge`, so two visitors changing different fields of one record never overwrite each other.
- For a read, compute, and write sequence, pass `{ expectedRevision: record.revision }` as the last argument: `update(id, change, { expectedRevision })` or `remove(id, { expectedRevision })`. It fails with `conflict` when the record changed since. Inside the change object it is ignored.
- `session().collections` lists only the collections the configuration names. Name every collection whose permissions the page checks.
- Every failure is an `ArtifacError` with `code`, `message`, `hint`, and `details`. `unavailable` means the page is not open inside Artifac, so show the page without the data instead of breaking. The `hint` is written for the page's author, so show visitors your own words, chosen by `code`.
- A write that fails leaves nothing changed, so put the control back the way it was, as the starter does.
- Subscriptions update live, so never poll. A code change reloads the page, and saved records survive it.

## Visitors And Ownership

An anonymous visitor owns records through a key tied to their browser for that artifact, the same at its stable URL and on its subdomain. Clearing site data, or switching browsers, loses access to their `own` records, and the key proves possession of that browser, not who the person is. Signing in ties records to the person, who appears to each artifact under a pseudonym of that artifact alone. Never use an `own` policy as authentication for anything beyond the visitor's own records.

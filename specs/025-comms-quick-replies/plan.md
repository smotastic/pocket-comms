# Plan 025 — pocket-comms: suggested replies and the owner's quick replies

- **Spec:** [spec.md](./spec.md)
- **Status:** `Approved` — approved with the spec by the owner (2026-11-06)

## 1. Affected projects

| Path                            | Change                                                                                                                                                                       | Nx tags                               |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `packages/comms/domain`         | `replies.ts`: `suggestedReplies(text)` (the rules of requirement 1); `DEFAULT_QUICK_REPLIES`, `MAX_QUICK_REPLIES`, `MAX_QUICK_REPLY_LENGTH` and `parseQuickReplies(list)`.   | `scope:comms`, `layer:domain`         |
| `packages/comms/application`    | `QuickRepliesOutbound` (`load`, `save`); `QuickReplies` use case (`list`, `replace`); the transcript's `shown` adds `replies` to assistant entries; an in-memory fake store. | `scope:comms`, `layer:application`    |
| `packages/comms/infrastructure` | A quick replies file store: `quick-replies.json` in the state folder, temporary file and rename, as the activity file; a missing file loads as `None`.                       | `scope:comms`, `layer:infrastructure` |
| `packages/comms/contract`       | `QuickReplies { replies }`, `GET /quick-replies`, `PUT /quick-replies`; the optional `replies` on the assistant `TranscriptEntry`.                                           | `scope:comms`, `type:contract`        |
| `packages/comms/api`            | The quick replies handlers; `InvalidInputError` maps to `422` as elsewhere.                                                                                                  | `scope:comms`, `layer:api`            |
| `apps/comms-server`             | Wires the file store into the composition; the regenerated OpenAPI document.                                                                                                 | `scope:comms`, `type:app`             |
| `apps/comms-web`                | `CommsClient.quickReplies`/`saveQuickReplies`; a query; `QuickReplies` takes the list; `SuggestedReplies`; the `/settings` route and `SettingsPage`; the overview's button.   | `scope:comms`, `type:app`             |
| `packages/comms/AGENTS.md`      | Names spec 025; the quick replies file; the rule that a suggestion only ever sends a prompt.                                                                                | —                                     |
| `.pocket-ci`                    | Accepted OpenAPI diff lines, if the diff flags the optional field.                                                                                                           | —                                     |

No design kit change: `ChipGroup` takes an `icon` per chip (sparkle), and the Settings page
composes `Page`, `AppBar`, `List`, `ListItem`, `IconButton` (`edit`, `delete`, `chevron-down`),
`Button` and `TextField`/`Composer` from the kit. Move up uses a text button if the kit has no
up icon.

## 2. Contract changes

Compatible for the web app, which ships with the server.

- `GET /quick-replies` → `200 QuickReplies { replies: string[] }`.
- `PUT /quick-replies` with `QuickReplies` → `200 QuickReplies` (the saved, cleaned list); `422`
  on `replies` (too many, a duplicate) or `replies[i]` (blank, too long, a control character).
- The assistant variant of `TranscriptEntry` gains optional `replies: string[]` (1 to 4 items),
  left out when there are none.

## 3. Migrations

No database. A new file, `quick-replies.json` (`{ version: 1, replies }`), is written on the
first save; until then the default list applies. A file that does not decode is reported and
answers `503`; it is never overwritten by a read.

## 4. Design

- **Domain.** `suggestedReplies(text): ReadonlyArray<string>` is pure: it looks at the message's
  end (trailing blank lines dropped), finds a final numbered or lettered list (optionally followed
  by one question paragraph) for choices, else the final sentence for the approval question, with
  a small fixed list of approval phrases. `parseQuickReplies` returns the cleaned list or
  `InvalidInputError` with field paths.
- **Port and use case.** `QuickRepliesOutbound.load: Effect<Option<ReadonlyArray<string>>>`,
  `save(list)`. `QuickReplies.list` returns the stored list or the default; `replace` parses and
  saves, returning the saved list.
- **Transcript.** `shown` sets `replies` on assistant entries with a non-empty suggestion, so the
  `GET` transcript, the live `entries` events and the subagent chats all carry it; the web app uses
  it only for the main conversation.
- **Web.**
  - `SuggestedReplies` (`ChipGroup`, label "Suggested replies", row layout, sparkle icons), above
    `QuickReplies`, rendered when the view is Chat, the agent is `idle` or `done`, the last entry is
    an assistant message with `replies`, and that entry's id is not the one last answered. A tap
    calls the prompt mutation (`fromField: false`); on success the entry id is remembered as
    answered. Disabled while `sending`.
  - `QuickReplies` takes `replies` from a `quickRepliesQuery`; nothing shows while it loads or when
    the list is empty.
  - `/settings` route with `SettingsPage`: back to `/`, a "Quick replies" section: a `List` of the
    replies, each with Move up, Move down, Edit and Delete; an add field at the end. Edit replaces
    the row with a field (Save/Cancel). Each change calls `PUT` with the whole list; on success the
    query data is set to the response; on failure an `Alert` shows the reason and the list shows the
    saved data.
  - The overview's `AppBar` gets `IconButton icon="settings" label="Settings"`.

## 5. Test strategy

- **Unit (domain):** the acceptance examples of `suggestedReplies` (approval phrases, " or ",
  numbered and lettered lists, a list followed by a question, a long item, a list in the middle,
  Markdown emphasis, no question); `parseQuickReplies` limits, trimming, duplicates, control
  characters.
- **Unit (application, fakes):** `list` gives the default without a stored list and the stored
  one after; `replace` saves the cleaned list and saves nothing on an invalid one; the transcript
  adds `replies` to assistant entries only.
- **Adapter:** the file store round-trips, loads `None` without a file, and reports a broken file.
- **API and contract:** `GET` and `PUT` answer `200` and `422`; the OpenAPI document is
  regenerated.
- **Web (Testing Library):** suggestions show for an idle agent's last assistant message and send a
  prompt once, then hide; none while blocked, working, in the Screen view, or when the last entry is
  not an assistant message; quick replies come from the server list; the Settings page adds, edits,
  deletes and moves a reply with the right `PUT` body and shows a failed save; axe has no
  violations.
- **Boundaries:** no new imports across layers; `pnpm verify:local`.

## 6. Risks

- **A wrong suggestion.** The rules only fire on clear shapes and stay quiet otherwise; a
  suggestion only sends a prompt the owner chose, and never answers a dialog.
- **Two devices editing at once.** The last save wins; the owner is one person, so no versioning.

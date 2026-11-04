# Plan 023 — pocket-comms: pictures in the brainstorm chat and its issues

- **Spec:** [spec.md](./spec.md)
- **Status:** `Approved` — approved with the spec by the owner (2026-11-04)

## 1. Affected projects

| Path                            | Change                                                                                                                                                                                                         | Nx tags                               |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `packages/comms/domain`         | `brainstorm.ts`: a user entry's `images`; a proposal's `pictures` and `attached`; the `attaching` issue state; the chat's pictures by number; `parsePictureChoice`; `withPictures(body, attached)`.            | `scope:comms`, `layer:domain`         |
| `packages/comms/application`    | `AgentRuntimeOutbound` gains `seesImages` and the turn's `images`; `GiteaOutbound.attachImage`; Pi's input names the pictures; the propose tools take `pictures`; `send` takes image ids; `decide` uploads.   | `scope:comms`, `layer:application`    |
| `packages/comms/infrastructure` | The Pi adapter passes images and reads `model.input`; the Gitea adapter's multipart `POST …/assets`; the chat file moves to version 3 and still loads versions 1 and 2.                                         | `scope:comms`, `layer:infrastructure` |
| `packages/comms/contract`       | `BrainstormMessageRequest.imageIds`; the entries' `images`, `pictures` and `attached`; the `attaching` state; `Ready.seesPictures` and `Ready.pictures`; the decisions' `pictures`; the `FinishWithout` one. | `scope:comms`, `type:contract`        |
| `packages/comms/api`            | `send` and `decide` pass the new fields and map the errors as before.                                                                                                                                          | `scope:comms`, `layer:api`            |
| `apps/comms-web`                | The brainstorm composer attaches pictures (`useAttachments`); user messages show numbered thumbnails; both proposal cards get a Pictures section; the attaching card has Retry and Finish without them.        | `scope:comms`, `type:app`             |
| `apps/comms-server`             | The regenerated OpenAPI document.                                                                                                                                                                              | `scope:comms`, `type:app`             |
| `packages/comms/AGENTS.md`      | The Gitea write rule names the attachment upload; the Pi rule names the pictures.                                                                                                                              | —                                     |
| `.pocket-ci`                    | One accepted-change line per breaking OpenAPI diff, as for spec 022.                                                                                                                                           | —                                     |

No design kit change: the cards compose `ImageThumb` and `Checkbox`, which the kit has.

## 2. Contract changes

Compatible for the web app, which ships with the server; the breaking diff lines are accepted
per change (spec note).

- `BrainstormMessageRequest`: `text` may be empty when `imageIds` (optional, at most 5) is given.
- The `user` entry gains an optional `images` (ids, in order).
- Both proposal kinds gain optional `pictures` (ids Pi named, or the owner's choice once decided)
  and optional `attached` (`{ image, url }`, the pictures already in Gitea).
- `ProposalState` gains `{ _tag: 'attaching', number, url }`, added last: the issue exists, its
  pictures are not all attached.
- `BrainstormState.Ready` gains `seesPictures` (boolean) and `pictures`
  (`{ id, number, available }` in chat order).
- `ProposalDecisionRequest`: `Create` and `Apply` gain optional `pictures` (ids, at most 5);
  `FinishWithout` is added last. `Create` on an `attaching` proposal is the retry and ignores its
  draft.

## 3. Migrations

No database. The chat file (`brainstorm.json`) moves to version 3: user entries may carry
`images`, proposals `pictures` and `attached`, and an issue proposal may be `attaching`. Versions
1 and 2 load as today, with none of these; the next save writes version 3 (requirement 20).

## 4. Design

- **Domain.** `chatPictures(entries)` numbers the pictures of the user entries from 1.
  `parsePictureChoice(ids, chat)`: at most five, each a picture of the chat. `withPictures(body,
attached)` appends `\n\n## Pictures\n\n` and `![Picture N](url)` lines, and returns the body
  unchanged with nothing attached. `missingPictures(chosen, attached)` is what a retry still
  uploads.
- **Runtime port.** `AgentRuntimeOutbound.seesImages: boolean`; `TurnInput.images:
ReadonlyArray<{ kind, bytes }>`. The Pi adapter sets `seesImages` from
  `model.input.includes('image')` and calls `agent.prompt(text, images)` with base64
  `ImageContent`; Pi stores them in its messages, so the history keeps them (requirement 6).
- **Pi's input.** The use case adds `[Pictures 3, 4 attached]` to the text, or
  `[Pictures 3, 4 attached; you cannot see pictures]` when `seesImages` is false, and passes
  the bytes only when it is true. The instructions say that Pi may name pictures by number in
  `pictures` of `propose_issue` and `propose_issue_edit`.
- **Gitea.** `GiteaOutbound.attachImage(repository, number, { name, kind, bytes })` answers the
  attachment's `browser_download_url`: one multipart `POST
/repos/{owner}/{repo}/issues/{index}/assets` with the field `attachment`, the token in the
  header, no redirects. A `404` is `IssueNotFoundError`; any other refusal is
  `GiteaUnavailableError` with Gitea's message.
- **Use case.** `send(text, imageIds)` looks every id up in `ImagesOutbound` before anything
  changes. `decide`:
  - `Create` on `open`: parse, check the pictures, `createIssue`, then save the proposal as
    `attaching` with the chosen `pictures` before the first upload. Upload each missing picture,
    saving `attached` after each. Then read the issue and `updateIssue` with its current title and
    `withPictures(body, attached)`; settle as `created`. Without pictures, as today.
  - `Create` on `attaching` (retry): the same from the uploads on. `FinishWithout` on
    `attaching`: the update with what is attached, then `created`, and Pi hears what was left out.
  - `Apply` with pictures: the base check, then the uploads (saving `attached`), then
    `updateIssue` with the shown title and `withPictures(body, attached)`. A failure leaves the
    edit `open` with its `attached`; a retry skips them.
  - A failed upload fails the request with its error after saving the progress, so the card shows
    the reason and the saved state. Every step runs under the chat's lock, as today.
- **State.** `Ready.pictures` asks `ImagesOutbound.path` for each picture's id, so a removed one
  is `available: false`.
- **Web.** The brainstorm `Footer` uses `useAttachments` and the `Composer`'s `attach` slot as
  the conversation does. `UserMessage` shows numbered `ImageThumb`s ("Picture N"). A
  `ProposalPictures` part (a `Checkbox` and an `ImageThumb` per picture, at most five checked,
  removed ones disabled) goes into `ProposalCard` and `IssueEditCard`. The `attaching` card shows
  the issue link, the reason, Retry and Finish without them. "This model can't see pictures"
  shows when `seesPictures` is false.

## 5. Test strategy

- **Unit (domain):** the numbering; `parsePictureChoice` refuses six, an unknown and a duplicate
  id; `withPictures` with none, one and several; the retry's missing pictures.
- **Unit (application, fakes):** `send` with images gives Pi the numbers and the bytes, or the
  "cannot see" note without bytes; an unknown id changes nothing. The tools refuse a wrong
  picture number. `decide`: create with two pictures makes one issue, two uploads and one update
  with the block; a failing second upload leaves `attaching` with one `attached`, and the retry
  uploads one and creates nothing; Finish without them; an edit with a picture checks the base
  first, uploads and updates; a failed edit upload changes nothing in the body; a removed picture
  is refused before any Gitea request; Discard sends nothing; Pi is told only at the end.
- **Adapter:** `attachImage` against the fake Gitea server sends one multipart `POST` with the
  token and maps `404`. The Pi adapter with pi-ai's faux provider passes images to a model that
  accepts them and reports `seesImages`. The file store round-trips the new fields and loads
  versions 1 and 2.
- **API and contract:** the new fields and decision decode; the OpenAPI document is regenerated.
- **Web (Testing Library):** attaching and sending in the brainstorm composer; the numbered
  thumbnails; a card checks Pi's pictures, sends the owner's choice and disables removed ones;
  the attaching card retries; the notice for a model without vision.
- **Boundaries:** no new imports across layers; `pnpm verify:local`.

## 6. Risks

- **A larger chat file** (spec note), bounded by five pictures per message and New chat.
- **Gitea's attachment settings** may refuse a picture; the card shows Gitea's reason and the
  issue stays without it until Retry or Finish without them.
- **A crash between Gitea's answer and the save** could upload one picture twice on retry; the
  progress is saved after each upload to keep this window one request long.

# Plan 014 — pocket-comms: images in the agent chat

- **Spec:** [spec.md](./spec.md)
- **Status:** `Approved` — approved by the owner (2026-11-02)

## 1. Affected projects

| Path                            | Change                                                                                                                 | Nx tags                               |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `packages/comms/domain`         | `image.ts`: image ids, the content check, the limits, the prompt with paths; `transcript.ts`: images on a `user` entry | `scope:comms`, `layer:domain`         |
| `packages/comms/application`    | `ImagesOutbound`; `ImagesInbound` (upload, read, sweep); image ids on `prompt` and on task `create`; a fake            | `scope:comms`, `layer:application`    |
| `packages/comms/infrastructure` | `images/`: the folder store; the transcript adapter passes the images folder to the parser                             | `scope:comms`, `layer:infrastructure` |
| `packages/comms/contract`       | The `images` group (upload, read); `imageIds` on `PromptRequest` and `CreateTaskRequest`; `images` on the user entry   | `scope:contracts`                     |
| `packages/comms/api`            | The image handlers; the daily sweep forked with the server                                                             | `scope:comms`, `layer:api`            |
| `apps/comms-server`             | Wires the store in `stateDir`; the OpenAPI document                                                                    | `scope:comms`, `type:app`             |
| `packages/design/ui`            | `Composer`: an `attachments` slot and an `onAttach` action; an `image` icon; `ImageThumb`                              | `scope:design`, `type:ui`             |
| `apps/comms-web`                | `attachments.ts` (pick, shrink, upload, state); the conversation and New task wiring; thumbnails in the "You" card     | `scope:comms`, `type:web`             |

### Shapes

- **Domain** (`image.ts`). `ImageId` = 26 lowercase base32 characters (server made, random).
  `MAX_IMAGES = 5`, `MAX_IMAGE_BYTES = 10 MB`, `IMAGE_RETENTION_DAYS = 30`.
  `imageKind(bytes) → Option<'jpeg' | 'png'>` by the magic numbers. `promptWithImages(text,
paths)` gives text, a blank line and one path per line, or only the paths. `parsePrompt` takes
  the image count: blank text is fine when there is at least one image.
  `imagesInPrompt(text, folder) → { text, images: ImageId[] }` takes out the lines that are exactly
  `<folder>/<id>.(jpg|png)` and trims the rest; the transcript's `user` entry gets
  `images: ReadonlyArray<ImageId>`.
- **Port.** `ImagesOutbound { save(kind, bytes) → ImageId, path(id) → Option<string>, read(id) →
Option<{ kind, bytes }>, removeOlderThan(date) → number }`. The adapter writes
  `<state>/images/<id>.<ext>` through a temporary file and a rename, reads only names that match
  the id pattern, and never follows a symlink.
- **Use cases.** `ImagesInbound.upload(bytes)` checks size and kind (validation error) and saves;
  `read(id)` (not found); `sweep` removes old ones. `AgentsInbound.prompt(ref, text, imageIds)`
  resolves every id to a path before it calls Herdr (unknown id: validation error);
  `TasksInbound.create` does the same for the first prompt and refuses images without an agent.
- **API.** Group `images` under `/api/v1`: `POST /images` with a multipart body of one `file` part
  answers `201 { id }`; `GET /images/:image` answers the bytes with `image/jpeg` or `image/png`,
  `Cache-Control: private, max-age=31536000, immutable`. Both go through the identity guard. The
  sweep runs at start-up and every 24 hours as a scoped fiber of `commsServerLayer`.
- **Design.** `Composer` gains `attachments?: ReactNode` (shown above the text inside the field)
  and `onAttach?: () => void` (an `image` icon button left of the text); `sendable?: boolean` lets
  a screen allow sending without text. `ImageThumb { src, state: uploading | ready | failed,
reason?, onRemove?, onRetry?, onOpen? }`.
- **Web.** `attachments.ts`: a hidden `<input type="file" accept="image/*" multiple>`, the shrink
  with `createImageBitmap` and a canvas (`toBlob('image/jpeg', 0.85)`), the upload with the
  client, and a small reducer for the list. The conversation and New task use it; the "You" card
  renders `images` with `ImageThumb` and a full-size `Sheet`.

## 2. Contract changes

Additive within `/api/v1`: the `images` group with two endpoints; an optional `imageIds` on
`PromptRequest` and `CreateTaskRequest`; `PromptRequest.text` may be empty when `imageIds` is not;
an `images` field on the `user` transcript entry. Old clients keep working.

## 3. Migrations

None. The service has no database; images are files in the state folder.

## 4. Test strategy

- **Domain:** `imageKind` on JPEG, PNG, text and an empty buffer; `promptWithImages` with and
  without text; `parsePrompt` with images only; `imagesInPrompt` keeps foreign paths and other
  text, and refuses a name outside the pattern.
- **Application:** with the fake store and the Herdr fake: upload refusals (kind, size); the prompt
  text Herdr gets; an unknown id sends nothing; more than five; a task with an agent and images; a
  task without an agent and images is refused; the sweep.
- **Infrastructure:** the folder store in a temporary folder: save, read, path, an id that does not
  match, a symlink, `removeOlderThan` by modification time; the transcript adapter with an
  anonymised fixture whose prompt holds image paths.
- **API:** `comms-api.spec.ts` for upload (201, 400), read (200 with type, 404, 403 without the
  login) and the prompt with `imageIds`; the contract spec lists the paths.
- **Design:** `Composer` with attachments and the attach button; `ImageThumb` in its three states;
  stories for both.
- **Web:** attach, the five limit and the left-out message, upload states, send blocked while
  uploading, send clears, failed send keeps, image-only send, thumbnails in the "You" card, New task
  with images. The shrink is a pure size function tested on its own; the canvas runs in the browser.
- **Boundaries:** the existing layer tags and dependency-cruiser rules; no new dependency.

> **As-built note (2026-11-02).** The upload is a raw `application/octet-stream` body, not
> multipart: Effect's OpenAPI generator drops the description of a multipart file field, and a raw
> body needs no temporary file. The prompt's image paths are taken out of the transcript in the
> application layer (`transcript.use-case.ts`, with the store's `folder`), not in the transcript
> adapter. The kit gained an `AttachButton` (also used by the New task form) and a
> `control.height.thumb` token; `ImageThumb` links to the full-size image instead of opening a
> sheet, and shows a picture that no longer loads as removed.

## 5. Risks

- **Agents may turn a pasted image path into an attachment.** Claude Code converts an image path it
  sees in pasted input into `[Image #n]` and stores the image in its session file. If Herdr's prompt
  arrives as a paste, the "You" card would not find our paths. The parser then shows one "image"
  placeholder per image block of a Claude user entry, without the picture. An implementation task
  checks this against the real Claude and Pi before the web work and records the outcome here.

  > **Seen with Claude Code (2026-11-03).** It does: the prompt line holds the text with one
  > `[Image #n]` marker per image at its start, and an `image` block per image. A separate `isMeta`
  > user line right after it names each file as `[Image: source: <path>]`. The Claude parser puts
  > those paths back below the text, without the markers, so the "You" card shows the thumbnails as
  > for an agent that keeps the paths. Pi has not been checked yet.

- **Permission prompts.** Claude Code may ask to read a file outside its working folder. That is an
  ordinary approval in the approval panel, not a failure.
- **Disk use.** Shrunk images are about 0.5 MB; the 30-day sweep bounds the folder.
- **Uploads on a slow connection.** Each image uploads on its own, so one failure retries only that
  image.

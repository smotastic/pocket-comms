# Plan 027 — pocket-comms: voice messages in the brainstorm chat

- **Spec:** [spec.md](./spec.md)
- **Status:** `Approved` — approved with the spec by the owner (2026-11-08)

## 1. Affected projects

| Path                            | Change                                                                                                                                                  | Nx tags                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `packages/comms/domain`         | `speech.ts`: `parseClip(bytes)` checks a clip is not empty, at most 5 MB and audio by its content (MP4, WebM, Ogg, WAV, MP3), and names its format.     | `scope:comms`, `layer:domain`         |
| `packages/comms/application`    | `SpeechOutbound` (`available`, `transcribe(clip)`), `SpeechInbound` and its use case; `BrainstormStateDto.Ready.voice` from `SpeechOutbound.available`. | `scope:comms`, `layer:application`    |
| `packages/comms/infrastructure` | `speech/openai-speech.ts`: one multipart `POST {url}/audio/transcriptions` with `file` and `model`, a 90 s timeout, no redirects; a not-set-up adapter. | `scope:comms`, `layer:infrastructure` |
| `packages/comms/contract`       | A `speech` group with `POST /api/v1/speech/transcriptions`; `BrainstormState.Ready.voice`.                                                              | `scope:comms`, `type:contract`        |
| `packages/comms/api`            | The `speech` handlers and their problems.                                                                                                               | `scope:comms`, `layer:api`            |
| `apps/comms-server`             | `COMMS_SPEECH_URL` and `COMMS_SPEECH_MODEL` in `config.ts`; the composition picks the adapter; the regenerated OpenAPI document.                        | `scope:comms`, `type:app`             |
| `apps/comms-web`                | `useVoiceClip` (recording, transcribing, failed clip, the leave warning); the Record voice action; the recording and failed-clip rows in the composer.  | `scope:comms`, `type:app`             |
| `packages/comms/AGENTS.md`      | A rule for the speech service: the server is its only caller, no audio is written to disk.                                                              | —                                     |

One small design kit change in pocket-factory's `packages/design`: a `mic` icon, which the kit
lacks; it comes here as a catalog bump (ADR 0009). Otherwise the action menu of kit 0.13.0 (Gitea
#70) takes the item, and the rows compose `LiveIndicator`, `Text`, `Button` and `Alert` in the
composer's `attachments` slot.

## 2. Contract changes

Compatible within `/api/v1`: one new route and one new field in a response.

- **`POST /api/v1/speech/transcriptions`**: the body is the clip's raw bytes
  (`application/octet-stream`, as the image upload). Success `200` `{ text }`, the transcript
  trimmed, possibly empty. Errors: `Validation` (empty, over 5 MB, not audio) and
  `ServiceUnavailable` (not set up, unreachable, timed out, refused by the service). Behind the
  `TailscaleIdentity` and `Validation` middlewares, like every group.
- **`BrainstormState.Ready.voice`** (boolean): transcription is set up. Added last.

## 3. Migrations

None. Nothing is stored.

## 4. Design

- **Domain.** `parseClip` reads the first bytes: `ftyp` at offset 4 (MP4/M4A), `1A 45 DF A3`
  (WebM), `OggS`, `RIFF…WAVE`, `ID3` or an MPEG frame sync (MP3). Anything else, empty or over
  5 MB is an `InvalidInputError`. Five MB covers two minutes of what phones record (about 1 MB
  for AAC or Opus) with room for a WAV-recording browser of lower quality.
- **Application.** `SpeechInbound.transcribe(bytes)`: `parseClip`, then
  `SpeechOutbound.transcribe({ bytes, format })`, then trim. Errors: `InvalidInputError`,
  `SpeechNotSetUpError`, `SpeechUnavailableError` (with a reason free of URLs). The use case
  holds the bytes in memory only.
- **Infrastructure.** The OpenAI-compatible adapter posts `multipart/form-data` with `file`
  (named `clip.<ext>` from the format) and `model`, and no `language`, so the service detects it.
  It maps a connection error, a timeout and a non-2xx answer to `SpeechUnavailableError`. With
  `COMMS_SPEECH_URL` or `COMMS_SPEECH_MODEL` unset, the not-set-up adapter answers
  `available: false` and `SpeechNotSetUpError`.
- **Server config.** `COMMS_SPEECH_URL` (the API base, such as `http://localhost:4430/v1`) and
  `COMMS_SPEECH_MODEL` (such as `Systran/faster-whisper-small`), both optional; the start-up log
  says whether voice is on. pocket-cloud's `install-comms.sh` passes them on (a pocket-cloud
  change, after this ships).
- **Web.** `useVoiceClip(client)` holds one clip: `idle → recording → transcribing →
(idle | failed)`. Recording uses `MediaRecorder` with the browser's default type and a timer
  that stops it at 120 s; `getUserMedia` refusals and a missing `MediaRecorder` become the
  notice of requirement 4. `transcribing` posts the blob with `client.transcribe(blob)`; success
  calls `onText(text)`, which the `Footer` appends to `draft`. `failed` keeps the blob, its
  length and the reason; a `beforeunload` listener is active only then. The microphone's tracks
  stop as soon as recording ends. The `Footer` adds `{ id: 'voice', label: 'Record voice',
icon: 'mic', onAction }` to the action menu when `state.voice`, disabled unless the clip is
  `idle`, and renders the recording row (`LiveIndicator`, "Recording 0:12", Stop) or the failed
  row (`Alert` with the reason and length, Retry, Discard) in the `attachments` slot, next to the
  pictures.

## 5. Test strategy

- **Unit (domain):** `parseClip` accepts each format's header, refuses empty, 5 MB + 1 byte, a
  PNG and plain text.
- **Unit (application, fakes):** a clip goes to the port with its format and the text comes back
  trimmed; an invalid clip never reaches the port; not set up and unavailable map to their
  errors; `state` reports `voice` from the port.
- **Adapter:** against a local fake HTTP server, the adapter sends one multipart request with
  `file` and `model` and no `language`; it maps a refused connection, a 500 and a timeout to
  `SpeechUnavailableError` without the URL in the reason.
- **API and contract:** the route's success, validation and service problems; the OpenAPI
  document is regenerated and the diff gate passes without an accepted line.
- **Web (Testing Library, a fake `MediaRecorder` and `getUserMedia`):** the item shows only with
  `voice`; record, stop, and the text appended to an existing draft; auto-stop at two minutes
  with fake timers; a refused microphone; a failed transcription with Retry and Discard; the
  `beforeunload` listener only while a clip has failed; an empty transcript's notice.
- **Manual on the phone:** Safari and the installed app record and transcribe a German and an
  English clip against the pocket-cloud service.
- **Boundaries:** no new imports across layers; `pnpm verify:local`.

## 6. Risks

- **The installed iOS app and the microphone.** `getUserMedia` in a home-screen web app on iOS has
  had bugs and asks for permission again more often than Safari. The manual check covers it; if
  it fails, Safari still works.
- **The order with Gitea #70.** The action menu must be on `master` first; this branch rebases
  onto it.
- **Transcription time on the VM's CPU.** Measured: a 17 s clip takes 4–7 s with
  `small` (up to 19 s while the Mac was busy), so a two-minute clip may take 30–60 s; the 90 s timeout leaves room (raised from 60 s at approval), and a retry is one tap.
- **Recognition quality.** `small` is weaker on German and project jargon than larger models; the
  composer step lets the owner fix it, and pocket-cloud can switch the model by configuration.
- **Recognition on the pocket-cloud setup.** A test with synthetic voices transcribed English
  well but misheard "comms" as "comes", and German clips lost their first sentence. Check with the
  owner's real voice during the manual test; a Whisper `prompt` with the project's words is a
  possible follow-up, not part of this spec.

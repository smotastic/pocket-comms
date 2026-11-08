# Tasks 027 — pocket-comms: voice messages in the brainstorm chat

- **Plan:** [plan.md](./plan.md)

Each task is small and independently testable, a vertical slice where possible. Tick its checkbox
in the task's own commit.

- [x] **T01** — Domain: `parseClip` accepts MP4, WebM, Ogg, WAV and MP3 by their content, names
      the format, and refuses an empty clip, one over 5 MB and anything else.
  - Gate: `pnpm nx test comms-domain`

- [x] **T02** — Application: `SpeechOutbound`, `SpeechInbound` and the transcribe use case (parse,
      transcribe, trim; not-set-up and unavailable errors); the brainstorm state's `voice` from the
      port; fakes.
  - Gate: `pnpm nx test comms-application`

- [ ] **T03** — Infrastructure: the OpenAI-compatible speech adapter (multipart `file` and `model`,
      no `language`, 90 s timeout, no redirects, reasons without the URL) and the not-set-up
      adapter.
  - Gate: `pnpm nx test comms-infrastructure`

- [ ] **T04** — Contract, API and server: `POST /api/v1/speech/transcriptions`,
      `BrainstormState.Ready.voice`, the handlers and problems, `COMMS_SPEECH_URL` and
      `COMMS_SPEECH_MODEL` in the config and composition, the regenerated OpenAPI document, the
      `packages/comms/AGENTS.md` rule.
  - Gate: `pnpm nx run-many -t test,typecheck -p comms-contract comms-api comms-server`;
    `pnpm openapi:check`

- [ ] **T05** — Web: `client.transcribe` and `useVoiceClip` (record, auto-stop at two minutes,
      transcribe, failed clip with retry and discard, the leave warning, refused microphone).
  - Gate: `pnpm nx test comms-web`

- [ ] **T06** — Web: the Record voice item in the brainstorm composer's action menu (kit 0.14.0
      `mic` icon), the recording row and the failed-clip row; the text appended to the draft.
  - Gate: `pnpm nx test comms-web`; `pnpm verify:local`

- [ ] **T07** — Deploy and check on the phone: deploy through pocket-cloud with
      `COMMS_SPEECH_URL` and `COMMS_SPEECH_MODEL`; record a German and an English clip in Safari
      and the installed app.
  - Gate: `scripts/install-comms.sh status` in pocket-cloud; the owner's check on the phone

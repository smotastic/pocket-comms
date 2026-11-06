# Tasks 025 — pocket-comms: suggested replies and the owner's quick replies

- **Plan:** [plan.md](./plan.md)

Each task is small and independently testable, a vertical slice where possible. Tick its checkbox
in the task's own commit.

- [x] **T01** — Domain: `suggestedReplies`; `parseQuickReplies` and the default list
  - Gate: `pnpm nx test comms-domain`

- [x] **T02** — Application and adapters: `QuickRepliesOutbound` and its file store; the
      `QuickReplies` use case; `replies` on assistant entries of the transcript
  - Gate: `pnpm nx run-many -t test,typecheck -p comms-application comms-infrastructure`

- [x] **T03** — Contract, API and server: `GET`/`PUT /quick-replies`, the optional `replies` of
      an assistant entry, the composition, the OpenAPI document and any accepted change
  - Gate: `pnpm nx run-many -t test -p comms-contract comms-api comms-server`

- [x] **T04** — Web: the quick replies from the server; the suggested replies in the Chat view
  - Gate: `pnpm nx test comms-web`

- [ ] **T05** — Web: the Settings page and the overview's Settings button
  - Gate: `pnpm nx test comms-web`

- [ ] **T06** — Docs: the comms service guide; the spec's status `Done`
  - Gate: `pnpm verify:local`

# Tasks 024 — pocket-comms: typed answers and quick replies

- **Plan:** [plan.md](./plan.md)

Each task is small and independently testable, a vertical slice where possible. Tick its checkbox
in the task's own commit.

- [ ] **T01** — Domain: `parseTyped` and `MAX_TYPED_LENGTH`; the `typed` activity event
  - Gate: `pnpm nx test comms-domain`

- [ ] **T02** — Application and adapters: `HerdrOutbound.typeText` and `pane.send_text`;
      `Input.type` records `typed`; the activity file store keeps it
  - Gate: `pnpm nx run-many -t test,typecheck -p comms-application comms-infrastructure`

- [ ] **T03** — Contract and API: `TypeRequest`, `POST /agents/:agent/text`, the `typed`
      activity event; the OpenAPI document and the accepted change
  - Gate: `pnpm nx run-many -t test -p comms-contract comms-api comms-server`

- [ ] **T04** — Web: `CommsClient.type`, the quick replies, the blocked footer's
      Type into the dialog field and hint, "You typed: …" in the timeline
  - Gate: `pnpm nx test comms-web`

- [ ] **T05** — Docs: the comms service guide; the spec's status `Done`
  - Gate: `pnpm verify:local`

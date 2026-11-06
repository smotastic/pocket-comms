# Tasks 024 — pocket-comms: typed answers and quick replies

- **Plan:** [plan.md](./plan.md)

Each task is small and independently testable, a vertical slice where possible. Tick its checkbox
in the task's own commit.

- [x] **T01** — Domain: `parseTyped` and `MAX_TYPED_LENGTH`
  - Gate: `pnpm nx test comms-domain`

- [ ] **T02** — Application and adapters: `HerdrOutbound.typeText` and `pane.send_text`;
      `Input.type`
  - Gate: `pnpm nx run-many -t test,typecheck -p comms-application comms-infrastructure`

- [ ] **T03** — Contract and API: `TypeRequest`, `POST /agents/:agent/text`; the `typed`
      activity event in the domain, the recorder, the file store and the contract; the OpenAPI
      document and the accepted change
  - Gate: `pnpm nx run-many -t test -p comms-contract comms-api comms-server`

- [ ] **T04** — Web: `CommsClient.type`, the quick replies, the blocked footer's
      Type into the dialog field and hint, "You typed: …" in the timeline
  - Gate: `pnpm nx test comms-web`

- [ ] **T05** — Docs: the comms service guide; the spec's status `Done`
  - Gate: `pnpm verify:local`

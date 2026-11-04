# Tasks 021 — pocket-comms: additional information when implementing an issue

- **Plan:** [plan.md](./plan.md)

Each task is small and independently testable, a vertical slice where possible. Tick its checkbox
in the task's own commit.

- [x] **T01** — Domain: `parseAdditionalInformation` and `issueTask` with the optional text
  - Gate: `pnpm nx test comms-domain`

- [x] **T02** — Application, contract and API: the optional `additionalInformation` of the
      implement request reaches the first prompt
  - Gate: `pnpm nx test comms-application comms-api`

- [x] **T03** — Web: the Additional information field in the Implement sheet
  - Gate: `pnpm nx test comms-web`

- [ ] **T04** — Docs: the comms service guide; the spec's status `Done`
  - Gate: `pnpm verify:local`

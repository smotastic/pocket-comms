# Tasks 028 — pocket-comms: voice messages in the agent chat

- **Plan:** [plan.md](./plan.md)

Each task is small and independently testable, a vertical slice where possible. Tick its checkbox
in the task's own commit.

- [x] **T01** — Server: `SpeechInbound.available` and `GET /api/v1/speech`, with the regenerated
      OpenAPI document.
  - Gate: `pnpm nx run-many -t test -p comms-application comms-api comms-server`;
    `pnpm openapi:check`

- [x] **T02** — Web: `client.speech()` and `speechQuery`; Record voice in the agent chat's message
      composer with the clip row; a sent prompt clears only its own text.
  - Gate: `pnpm nx test comms-web`; `pnpm verify:local`

- [ ] **T03** — Deploy through pocket-cloud and check on the phone.
  - Gate: `scripts/install-comms.sh status`; the owner's check

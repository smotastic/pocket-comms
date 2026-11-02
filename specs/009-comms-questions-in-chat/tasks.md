# Tasks 009 — pocket-comms: an agent's questions in the chat

- **Plan:** [plan.md](./plan.md)

Each task is small and independently testable. Tick its checkbox in the task's own commit.

- [x] **T01** — Domain and adapter: the tool entry's questions, `activityOf`, the Claude parser;
      the contract field and OpenAPI document
  - Gate: `pnpm nx test comms-domain comms-infrastructure comms-contract`, `pnpm openapi:check`

- [x] **T02** — Design kit: `QuestionCard` with story and spec
  - Gate: `pnpm nx run-many -t lint test -p design-ui`

- [x] **T03** — Web: the chat shows a question entry with `QuestionCard`
  - Gate: `pnpm nx test comms-web`, `pnpm verify:local`

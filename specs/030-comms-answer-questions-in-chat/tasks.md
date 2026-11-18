# Tasks 030 — pocket-comms: answer Claude's questions in the chat

- **Plan:** [plan.md](./plan.md)

Each task is small and independently testable, a vertical slice where possible. Tick its checkbox
in the task's own commit.

- [x] **T01** — Options in the transcript: `Question.options` and `multiple` in the domain, the
      Claude reader and the contract; the OpenAPI document
  - Gate: `pnpm nx run-many -t test,test-typecheck -p comms-domain comms-infrastructure comms-contract comms-server`

- [x] **T02** — Domain: `answerKeys`, `showsQuestion`, `answerExcerpt` and `DialogKey`, pinned by
      the probed sequences
  - Gate: `pnpm nx test comms-domain`

- [x] **T03** — Application and adapters: `sendKeys` takes `DialogKey`s (the socket sends `4`);
      `QuestionNotWaitingError`; `Input.answer`; the `answered` activity event in the domain, the
      file store, the contract (with the accepted OpenAPI change) and the web app's timeline, so
      every commit builds
  - Gate: `pnpm nx run-many -t test,test-typecheck,lint -p comms-application comms-infrastructure comms-contract comms-api comms-web`

- [ ] **T04** — Contract and API: `AnswerRequest`, `POST /agents/:agent/answer` and its problems;
      the OpenAPI document
  - Gate: `pnpm nx run-many -t test -p comms-contract comms-api comms-server`

- [ ] **T05** — Web: `CommsClient.answer`; the answerable question card in place of the wrapped
      screen
  - Gate: `pnpm nx test comms-web`

- [ ] **T06** — Docs and live check: the comms service guide; checked live at 390 px; the spec's
      status `Done`
  - Gate: `pnpm verify:local`

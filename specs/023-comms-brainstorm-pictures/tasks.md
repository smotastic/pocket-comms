# Tasks 023 — pocket-comms: pictures in the brainstorm chat and its issues

- **Plan:** [plan.md](./plan.md)

Each task is small and independently testable, a vertical slice where possible. Tick its checkbox
in the task's own commit.

- [x] **T01** — Domain: a user entry's images, the chat's pictures by number, a proposal's
      pictures and attached pictures, the `attaching` state, `parsePictureChoice` and
      `withPictures`
  - Gate: `pnpm nx test comms-domain`

- [x] **T02** — Adapters: `GiteaOutbound.attachImage` and the multipart upload;
      `AgentRuntimeOutbound.seesImages` and the turn's images in the Pi adapter
  - Gate: `pnpm nx run-many -t test,typecheck -p comms-application comms-infrastructure`

- [x] **T03** — Application and storage: `send` with images and Pi's picture notes; the propose
      tools' `pictures`; `decide` uploads, retries and finishes without; the state's pictures;
      the chat file version 3
  - Gate: `pnpm nx run-many -t test,typecheck -p comms-application comms-infrastructure`

- [x] **T04** — Contract and API: the message's image ids, the new entry fields, the
      `attaching` state, the `Ready` pictures, the decisions' pictures and `FinishWithout`; the
      OpenAPI document and the accepted changes
  - Gate: `pnpm nx run-many -t test -p comms-contract comms-api comms-server`

- [x] **T05** — Web: attaching in the brainstorm composer, numbered thumbnails, the cards'
      Pictures section, the attaching card, the notice for a model without vision
  - Gate: `pnpm nx test comms-web`

- [x] **T06** — Docs: the comms service guide; the spec's status `Done`
  - Gate: `pnpm verify:local`

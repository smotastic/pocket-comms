# Tasks 014 — pocket-comms: images in the agent chat

- **Plan:** [plan.md](./plan.md)

Each task is small and independently testable. Tick its checkbox in the task's own commit.

- [x] **T01** — Domain: image ids, the content check, the limits, the prompt with paths, the prompt
      rule with images, and the images of a transcript `user` entry
  - Gate: `pnpm nx test comms-domain`

- [x] **T02** — Application: `ImagesOutbound` and its fake, `ImagesInbound` (upload, read, sweep),
      image ids on `prompt` and on task `create`
  - Gate: `pnpm nx test comms-application`

- [ ] **T03** — Infrastructure: the image folder store, and the transcript adapter with the images
      folder
  - Gate: `pnpm nx test comms-infrastructure`

- [ ] **T04** — Contract, API and server: the `images` group, `imageIds` on the prompt and task
      requests, `images` on the user entry, the sweep fiber, the composition and the OpenAPI
      document
  - Gate: `pnpm nx run-many -t test -p 'comms-*'`, `pnpm openapi:check`

- [ ] **T05** — Smoke check: send a prompt with an image path to a real Claude and Pi agent and
      record in the plan how each stores it in its session file
  - Gate: the plan's risk note says what was seen

- [ ] **T06** — Design kit: the `image` icon, `ImageThumb`, and the `Composer`'s attachments, attach
      button and `sendable`
  - Gate: `pnpm nx run-many -t lint test -p design-ui`

- [ ] **T07** — Web: attachments (pick, shrink, upload) in the conversation and the New task form,
      and thumbnails in the "You" card
  - Gate: `pnpm nx test comms-web`, `pnpm verify:local`

- [ ] **T08** — Docs: the service's `AGENTS.md` rules and the README, spec status `Done`
  - Gate: `pnpm verify:local`

# Tasks 029 — pocket buddy v1: capture ideas by voice into the brainstorm chat

- **Plan:** [plan.md](./plan.md)

Each task is small and independently testable, a vertical slice where possible. Tick its checkbox
in the task's own commit.

- [x] **T01** — The `apps/buddy` project (Nx, Vitest, build, `start` target), the `type:device`
      lint rule, config (`BUDDY_COMMS_URL` required), the ports, and a program that starts and
      stops cleanly.
  - Gate: `pnpm nx run-many -t build,lint,test -p buddy`; an import of `comms-application` fails
    lint

- [ ] **T02** — Recording into the outbox: press/release, the two-minute stop, the slip filter,
      `FileOutbox` that survives a restart.
  - Gate: `pnpm nx test buddy`

- [ ] **T03** — The sender: oldest first, wait while Pi answers, transcribe and send through
      `HttpComms`, the removal and retry rules with backoff.
  - Gate: `pnpm nx test buddy`

- [ ] **T04** — The follower and the screen: Pi's answer from the event stream, the view with its
      status line and the 280-character cut, proposals created with `y` and discarded with `n`.
  - Gate: `pnpm nx test buddy`

- [ ] **T05** — The laptop adapters (`TerminalButton`, `FfmpegRecorder`, `TerminalScreen`), the
      README section, and a manual run against the deployed comms.
  - Gate: `pnpm verify:local`; the manual run in plan §5

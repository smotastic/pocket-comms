# Tasks 035 — pocket-comms: missions to merge

- **Plan:** [plan.md](./plan.md)

Each task is small and independently testable, a vertical slice where possible. Tick its checkbox
in the task's own commit. Requirements are the spec's numbers (R1–R26).

## Pull request A — the server

- [ ] **T01** — Docs: ADR 0019, the glossary's new words, the vision's step 3, the service's
      AGENTS.md.
  - Serves: R1, R2, R9, R10, R14
  - Gate: `pnpm format:check`, review
- [ ] **T02** — Domain `mission.ts`: lanes and their labels, the mission and its file, send
      rules, the queue's next mission, facts → state, the log (order, 90 days, new count), first
      prompts.
  - Serves: R5–R7, R10–R12, R15, R17, R19–R22, R24, R25
  - Gate: `pnpm nx test comms-domain`
- [ ] **T03** — Domain `planet.ts`: the sixth check **mission bot**, choosing a level (autopilot
      refused).
  - Serves: R3, R4
  - Gate: `pnpm nx test comms-domain`
- [ ] **T04** — Ports and the missions file store; `AgentStart.args` passed by hc and Herdr.
  - Serves: R9, R14, R22
  - Gate: `pnpm nx test comms-infrastructure`
- [ ] **T05** — The bot adapter: Gitea as the bot (labels, comments, push permission, its user)
      and the worktree's git identity with the credential file.
  - Serves: R1, R2, R3, R7, R13, R16, R21
  - Gate: `pnpm nx test comms-infrastructure`
- [ ] **T06** — Preflight reads the bot; `Planets.choose`.
  - Serves: R3, R4
  - Gate: `pnpm nx test comms-application`
- [ ] **T07** — `makeMissions`: send, remove, list, seen.
  - Serves: R1, R5–R7, R9–R11, R24, R25
  - Gate: `pnpm nx test comms-application`
- [ ] **T08** — The advance loop: start (held, worktree, bot, Claude with the settings, prompt,
      label, comment), waiting, pull request, merged and cleanup.
  - Serves: R10, R12–R17, R19, R23
  - Gate: `pnpm nx test comms-application`
- [ ] **T09** — Abort, outcome (done, failed), a closed pull request, lost and resume.
  - Serves: R20–R22
  - Gate: `pnpm nx test comms-application`
- [ ] **T10** — Contract, handlers and problems: send, choose autonomy, missions (list, remove,
      abort, resume, seen), outcome; `mission` on an agent.
  - Serves: R4–R6, R11, R16, R20–R22, R24–R26
  - Gate: `pnpm nx test comms-api`, `pnpm verify:local` (OpenAPI lint and diff)
- [ ] **T11** — Server: the token setting, the mission settings file with the deny list, the
      `comms-mission` skill, the composition and the loop.
  - Serves: R1, R14, R15, R20
  - Gate: `pnpm nx test comms-server`, `pnpm verify:local`

## Pull request B — the cockpit

- [ ] **T12** — The Mission Control screen: the running mission (Abort, Resume), the queue
      (Remove), the log with new marks; the start screen's entry with the new count; seen on open.
  - Serves: R24–R26
  - Gate: `pnpm nx test comms-web`
- [ ] **T13** — **Send on a mission** with the lane picker on an issue (sheet and planet page);
      the **missions** level in the Preflight card; the mission tag on agents.
  - Serves: R4–R6, R16
  - Gate: `pnpm nx test comms-web`, `pnpm verify:local`

## Pull request C — the brainstorm's lane

- [ ] **T14** — Pi suggests a lane with a reason on issue and edit proposals; the decision takes
      a lane and sends the mission; the proposal card's lane picker.
  - Serves: R8
  - Gate: `pnpm nx test comms-application comms-web`, `pnpm verify:local`
- [ ] **T15** — The spec, plan and tasks marked Done.
  - Serves: —
  - Gate: review

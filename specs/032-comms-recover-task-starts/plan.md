# Plan 032 — pocket-comms: recover a task start that stopped before the first prompt

- **Spec:** [spec.md](./spec.md)
- **Status:** `Approved` — approved with the spec by the owner (2026-11-24)

## 1. Affected projects

| Path                            | Change                                                                                                                                                                                                                                                                                                                           | Nx tags                               |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `packages/comms/domain`         | A new `task-start.ts`: `TaskStart`, `Delivery`, `afterRestart` (`pending` → `uncertain`), `deliveryOf` (a prompt's outcome → delivery), `recoveryOf` (an issue's work plus the kept starts → the issue card's actions), `startFor` (the start of an agent by its `cwd` and name).                                                | `scope:comms`, `layer:domain`         |
| `packages/comms/application`    | A `TaskStartsStoreOutbound` port. `HerdrOutbound` gains `openShell(workspaceId)` (`tab.create`) and `openWorktree({ cwd, path })` (`worktree.open`). `makeCreateTask` records the start at each step; `close` forgets it. A new `TaskStartsInbound`: `forAgent`, `send`, `dismiss`, `startInWorktree`. New errors. Fakes follow. | `scope:comms`, `layer:application`    |
| `packages/comms/infrastructure` | A new `task-starts/file-store.ts`: `<state>/task-starts.json`, written atomically; `afterRestart` on load. `herdr/socket.ts`: `tab.create` and `worktree.open`, both with `focus: false`.                                                                                                                                        | `scope:comms`, `layer:infrastructure` |
| `packages/comms/contract`       | `TaskStartView`, `SendTaskStartRequest`, `StartAgentInWorktreeRequest`; `Issue.work[]` gains `recovery`; four endpoints.                                                                                                                                                                                                         | `scope:comms`, `type:contract`        |
| `packages/comms/api`            | The handlers and the error mapping.                                                                                                                                                                                                                                                                                              | `scope:comms`, `layer:api`            |
| `apps/comms-server`             | Wires the file store; the regenerated OpenAPI document.                                                                                                                                                                                                                                                                          | `scope:comms`, `type:app`             |
| `apps/comms-web`                | `CommsClient` methods and queries; a `TaskStartCard` in `Conversation` in place of the note; Resume and Start an agent here on `IssueCard`, with a `StartAgentSheet`. Kit components only.                                                                                                                                       | `scope:comms`, `type:app`             |
| `packages/comms/AGENTS.md`      | Names spec 032, the state file, the changed spec 021 rule and the recovery rules.                                                                                                                                                                                                                                                | —                                     |
| `specs/021-…/spec.md`           | A note that spec 032 keeps the additional information in the kept prompt until it is forgotten.                                                                                                                                                                                                                                  | —                                     |
| `GLOSSARY.md`                   | **Task start**, **Kept prompt**, **Delivery**.                                                                                                                                                                                                                                                                                   | —                                     |
| `.pocket-ci`                    | The accepted OpenAPI diff lines for the new endpoints and the new `recovery` field.                                                                                                                                                                                                                                              | —                                     |

No kit change is expected: the card is a `Card` with `Text`, a `TextArea`, `Button`s and the
existing confirmation pattern of `CloseAgent`; the sheet is `Sheet` with the agent kind switch of
`NewTask`. If a reusable piece is missing it goes to pocket-factory first (ADR 0009).

## 2. Contract changes

Compatible within `/api/v1`: four new endpoints and one new optional field.

- `GET /agents/:agent/task-start` → `TaskStartView | null`. The start of the agent's worktree, or
  for an issue worktree without one, the issue's rebuilt prompt (`source: 'issue'`).
- `POST /agents/:agent/task-start/send` with `{ prompt: string; anyway?: boolean }` → `200`
  `{ delivery: 'delivered' | 'not-sent' | 'uncertain'; reason?: string }`. `409` when the agent is
  not idle and ready, when there is nothing to send, or when the start is `uncertain` without
  `anyway`; `422` an invalid prompt (spec 004 rules).
- `POST /agents/:agent/task-start/dismiss` → `204`.
- `POST /projects/:project/issues/:number/worktrees/start-agent` with
  `{ branch: string; agent: 'claude' | 'pi' }` → `201` `TaskCreated` (the spec 005 answer). `404`
  the branch is not a linked worktree of the project; `409` it has a live agent or a `pending` start.

```ts
TaskStartView = {
  source: 'kept' | 'issue';
  delivery: 'pending' | 'not-started' | 'not-sent' | 'uncertain';
  reason?: string;
  prompt: string;
  branch: string;
  issue?: { number: int; inProgress: boolean };
  // Herdr's view now, so the card knows whether Send may be offered.
  agent: { status: AgentStatus; ready: boolean };
}
IssueWork.recovery?: 'resume' | 'start-agent' // absent when nothing needs recovering
```

## 3. Migrations

No database. A new state file, `<state>/task-starts.json`:
`{ version: 1, starts: { [worktreeFolder]: { project, branch, issue?, kind, agent?, prompt, delivery, reason?, at } } }`.
Absent means empty. Written to a temp file and renamed, as the other state files are. A broken file
fails the reads that need it with a `503` and is never replaced by a read.

## 4. Design

### Domain (`task-start.ts`)

- `Delivery = 'pending' | 'not-started' | 'not-sent' | 'uncertain' | 'delivered'`.
- `deliveryOf(outcome)`: a refused prompt (`HerdrRejectedError`) → `not-sent` with its message; an
  unanswered one (`HerdrUnavailableError`, a timeout) → `uncertain`; accepted → `delivered`; the
  spec 005 notes `blocked` and `unsettled` → `not-sent`.
- `afterRestart(starts)`: every `pending` → `uncertain`.
- `startFor(starts, agent)`: the start whose folder holds the agent's `cwd`; with several live agents
  in one folder only the one named in the start.
- `recoveryOf(work, starts)`: `start-agent` for a worktree without a live agent, `resume` for one
  with a kept start that is not `delivered`, else none.

### Application

- `TaskStartsStoreOutbound`: `load`, `put(folder, start)`, `forget(folder)`; serialised writes.
- `makeCreateTask` (spec 005) puts the start as `pending` right after `createWorktree` when an agent
  is to start, then the delivery after `startAgent` and the prompt; `delivered` forgets it. A store
  failure is logged and never fails the start (the worktree exists, as spec 005 requirement 14
  wants). `makeImplementIssue` passes the issue number through to it.
- `TaskStartsInbound`:
  - `forAgent(ref)`: the kept start, else for an agent in a linked worktree on an issue branch
    (`issueNumberOf`) the issue's task built with `issueTask` from a fresh Gitea read; with the
    agent's readiness from `readAgent`.
  - `send(ref, prompt, anyway)`: rechecks readiness (`readAgent`: `idle` and `ready`), refuses an
    `uncertain` start without `anyway`, sends through `HerdrOutbound.prompt` with
    `parsePrompt` (spec 004), records the delivery with `deliveryOf`.
  - `dismiss(ref)`: forgets.
  - `startInWorktree(project, issue, branch, kind)`: the linked worktree from
    `ProjectsOutbound.worktrees` by branch (never the primary), the workspace from the Herdr
    snapshot by `checkout`; `409` if a live agent's `cwd` is in it or its start is `pending`;
    `openShell` in the workspace, or `openWorktree` when there is none; then the agent start, wait
    and prompt of `makeCreateTask`, shared through one function so the rules are not copied. The
    prompt is the kept one, else the issue's.
- `close` forgets the start of the closed worktree. The issues use case adds `recovery` to each
  work entry and forgets starts whose folder git no longer lists.

### Infrastructure

- `task-starts/file-store.ts` after `pull-requests/file-store.ts`.
- `HerdrOutbound.openShell` → `tab.create { workspace_id, focus: false }` → its `root_pane`;
  `openWorktree` → `worktree.open { cwd, path, focus: false }` → `root_pane`. Both checked live
  against Herdr 0.9.5 in an isolated session (`herdr --session`) before the adapter is written, and
  each gets a fake-socket test of its request and answer shape.

### Web

- `TaskStartCard` above the composer, from the `task-start` query, refetched on the agent's events.
  The `TaskCreated` note of spec 005 is no longer shown once the card has data.
- `IssueCard`: per work entry with `recovery`, a Resume link to `/agents/<ref>` or a Start an agent
  here button opening `StartAgentSheet` (project, branch, folder, Claude/Pi, Start); on success it
  navigates to the conversation as New task does.

## 5. Test strategy

- Unit (domain): `deliveryOf`, `afterRestart`, `startFor` with several agents in one folder,
  `recoveryOf`.
- Use cases on the fakes: every delivery a start can end in, including a store failure; send
  refused while blocked, working or `uncertain` without `anyway`; send once, then forgotten; a
  prompt from the composer keeps the start; close forgets; `startInWorktree` refuses a folder with a
  live agent and a branch that is not a linked worktree, and calls no `createWorktree`; the issue's
  rebuilt prompt for a worktree without a start.
- Infrastructure: the file store (missing, broken, atomic write, `pending` → `uncertain` on load);
  the two Herdr requests against the fake socket.
- API: the four routes through `commsServerLayer` with the identity guard, and their error codes.
- Web: the card's states (pending, not sent, blocked, uncertain with Send anyway, dismiss
  confirmation), the issue card's actions, the sheet; 390 px layout with ladle or the built app.
- Live: the spec's recovery check against an isolated Herdr session, for Claude and Pi, including a
  server restart between the partial start and the recovery.
- Boundaries: dependency-cruiser and the ports check prove the layering; no new import across
  services.

## 6. Risks

- Herdr's `tab.create` and `worktree.open` shapes are not yet used by the app; checking them live is
  the first task, and a mismatch is raised with the owner before the design changes.
- Several agents in one worktree: the card shows only for the agent the start names, so a second
  agent the owner started by hand never gets the prompt offered.
- Storing the additional information (spec 021 change) is a deliberate privacy trade-off, limited to
  the state folder and to the time until delivery or dismissal.

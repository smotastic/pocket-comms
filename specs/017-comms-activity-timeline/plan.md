# Plan 017 — pocket-comms: an activity timeline across agents

- **Spec:** [spec.md](./spec.md)
- **Status:** `Done` — approved by the owner (2026-11-03); checked locally at 390 px on 2026-11-03

## 1. Affected projects

| Path                            | Change                                                                                                                  | Nx tags                               |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `packages/comms/domain`         | `activity.ts`: event and subject shapes, `activityBetween` (snapshot diff), `promptExcerpt`, `keepActivity`, `isLiveIn` | `scope:comms`, `layer:domain`         |
| `packages/comms/application`    | `ActivityStoreOutbound` port, `ActivityInbound` port and use case with the background recorder; `Input` records; fakes  | `scope:comms`, `layer:application`    |
| `packages/comms/infrastructure` | `Activity.layerFile`: `activity.json` in the state folder, serialised atomic writes, unreadable file kept as `.bad`     | `scope:comms`, `layer:infrastructure` |
| `packages/comms/contract`       | `activity` group: `GET /api/v1/activity` and `GET /api/v1/activity/events`; `ActivityEvent`, `Activity` schemas         | `scope:contracts`                     |
| `packages/comms/api`            | `activity.handlers.ts`; acceptance tests                                                                                | `scope:comms`, `layer:infrastructure` |
| `apps/comms-server`             | Wires `Activity.layerFile` and `ActivityInbound.layer`; OpenAPI document                                                | `scope:comms`, `type:app`             |
| `packages/design/ui`            | `AgentRow`: `href`/`onNavigate` optional; without them the row is a plain, non-interactive row                          | `scope:design`                        |
| `apps/comms-web`                | Client methods, query and live hook, `/activity` route and `ActivityPage`, Activity link in `ProjectsSheet`             | `scope:comms`, `type:web`             |
| comms `AGENTS.md`, README       | The timeline file and what it records                                                                                   | —                                     |

### Shapes

- **Domain.** `ActivitySubject = { paneId, ref, name?, workspace, project?, worktree? }` and
  `ActivityEvent = { id, at, agent: ActivitySubject } & (appeared | gone | status{status: working
| blocked | done} | prompt{excerpt, images} | keys{keys})`. `activityBetween(before, after)`
  compares two lists of `{ agent, subject }` by pane id and answers the changes without id and
  time, in the order gone, appeared, status. `keepActivity(events, now)` answers the newest 100
  within 24 h, oldest first. `promptExcerpt(text)` takes the first non-blank line, collapses
  whitespace and cuts at 80 characters with "…". `isLiveIn(subject, agents)` is a pane id and ref
  match.
- **Ports.** `ActivityStoreOutbound { events, update(f), changes }`: the adapter holds the list,
  applies `update` atomically, saves after each update and emits on `changes`. Trimming stays in
  the application (it passes `keepActivity` within `update`). `ActivityInbound { activity,
activityChanges }` with `ActivityDto = { events: ReadonlyArray<ActivityEvent & { live }> }`,
  newest first.
- **Recorder.** `ActivityInbound.layer` is scoped; it forks a fiber that follows
  `HerdrOutbound.changes`, reads a snapshot, keeps the previous list, and records
  `activityBetween` through a shared `makeRecordActivity` (stamps `crypto.randomUUID()` and
  `Clock`). A failed snapshot is skipped and keeps the previous list. `makeInput` records a prompt
  or keys after Herdr took them through the same helper.
- **Wire.** `ActivityEvent` is a union tagged by `type` with `id`, `at` (`Millis`), `agent`
  (`ActivityAgent`) and `live`. The SSE stream sends `activity` events with the whole list; it is
  re-read after each Herdr tick or store change and repeated only when it changed.
- **Web.** `followActivity`, `activityQuery`/`activityKey`, `useActivityLive`. `ActivityPage`
  renders `AgentList` of `AgentRow`s: the dot from the event, the visible line from
  `activityText(event)`, `since(at, now)`. A row links to `/agents/$ref` when `live`, to
  `/projects/$project` when it has a project, else to nothing. `ProjectsSheet` gets an Activity
  `Link` above the projects.

## 2. Contract changes

Additive within `/api/v1`: a new `activity` group with two `GET` endpoints. No request changes, no
new problem type.

## 3. Migrations

None. `activity.json` is a new file with a `version: 1` field.

## 4. Test strategy

- **Domain:** `activityBetween` for appear, gone, each recorded status, idle/unknown skipped, a new
  completion while done, nothing for an unchanged list; `keepActivity` for the 100 and 24 h limits;
  `promptExcerpt` for blank lines, whitespace and the cut; `isLiveIn`.
- **Use case (fakes, `TestClock`):** baseline records nothing; ticks record status changes; an
  unavailable Herdr records nothing and later compares with the last snapshot; prompt and keys are
  recorded only when Herdr took them; `live` follows the snapshot; the stream repeats only changes.
- **Adapter (temp folder):** round trip; atomic file with `0600`; a broken file is renamed `.bad`
  and the list starts empty; concurrent updates do not lose events.
- **API / acceptance:** `GET /api/v1/activity` answers the list.
- **Web (fake client):** the Activity link in the sheet; the page lists rows newest first with
  their texts; empty state; tapping a live, gone-with-project and gone-without-project event;
  live updates; `AgentRow` without a link in the kit.
- **Local check:** the built app at 390 px with `agent-browser` on the in-memory dev setup.

## 5. Risks

- The recorder reads a snapshot on every Herdr tick, as the overview stream already does for each
  open overview; one more reader at a few seconds' interval is cheap.
- Pane id reuse after a Herdr restart could, in theory, make an old event look live; the ref
  check makes that need the same name as well.

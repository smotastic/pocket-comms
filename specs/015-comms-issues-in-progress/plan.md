# Plan 015 — pocket-comms: mark started issues in progress and show them apart

- **Spec:** [spec.md](./spec.md)
- **Status:** `Done` — approved by the owner (2026-11-02); checked locally at 390 px with a fake Gitea on 2026-11-02

## 1. Affected projects

| Path                            | Change                                                                                                                                                        | Nx tags                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `packages/comms/domain`         | `IN_PROGRESS_LABEL`, `IN_PROGRESS_LABEL_STYLE` (colour, description, exclusive), `hasInProgressLabel(issue)`, `isInProgress(issue, work)`                     | `scope:comms`, `layer:domain`         |
| `packages/comms/application`    | `GiteaOutbound.markInProgress`; `implement` marks after `create` and reports a failure as a note; `IssueDto.inProgress`; the fake Gitea records labels/writes | `scope:comms`, `layer:application`    |
| `packages/comms/infrastructure` | `Gitea.layerHttp.markInProgress`: list labels (paged), create the label when missing, `POST …/issues/{n}/labels` with its id; spans                           | `scope:comms`, `layer:infrastructure` |
| `packages/comms/contract`       | `Issue.inProgress: boolean`; Implement's success `IssueTaskCreated` = `TaskCreated` + optional `markNote`                                                     | `scope:contracts`                     |
| `packages/comms/api`            | Handler passes the new fields through; acceptance tests                                                                                                       | `scope:comms`, `layer:infrastructure` |
| `apps/comms-server`             | OpenAPI document                                                                                                                                              | `scope:comms`, `type:app`             |
| `apps/comms-web`                | `groupIssues` helper; grouped lists in `ProjectPage` and `ProjectsSheet`; hide the label tag; `markNote` joins the start's notes                              | `scope:comms`, `type:web`             |
| `README.md`, comms `AGENTS.md`  | The adapter's writes; the label the app sets                                                                                                                  | —                                     |

### Shapes

- **Domain.** `isInProgress(issue, work) = hasInProgressLabel(issue) || work.length > 0`; the
  label match is `label.toLowerCase() === 'status/in-progress'`. This is the business rule, so it
  lives here, and `toDto` in `issues.use-case.ts` sets `inProgress` from it.
- **Port.** `GiteaOutbound.markInProgress(repository, number): Effect<void, GiteaNotConfiguredError
| GiteaUnavailableError | IssueNotFoundError>`. The port's comment lists it among the writes.
- **Use case `implement`.** Unchanged up to `create`. Then, when the issue read before has no
  in-progress label, `markInProgress`; any failure is caught and turned into
  `markNote: "#<n> was not marked in progress: <reason>"`. The answer is `{ ...created, markNote? }`.
  A failing `create` fails before any mark (spec requirement 5).
- **Adapter.** `send` already takes `GET | PATCH | POST`. `markInProgress` pages through
  `GET /repos/{o}/{r}/labels?limit=50&page=n` (decoded `{ id, name }`), picks the first name match
  in any case, else `POST /repos/{o}/{r}/labels` with
  `{ name, color: '#e3b341', description, exclusive: true }` and decodes its `id`; then
  `POST /repos/{o}/{r}/issues/{n}/labels` with `{ labels: [id] }`. `404` on the issue →
  `IssueNotFoundError`; the rest maps as today (`401`/`403`/`3xx`/timeouts → unavailable). `PUT`
  and `DELETE` are not added to `send`'s method type, so the adapter cannot replace or remove
  labels.
- **Web.** `groupIssues(issues) → { inProgress, open }` keeps the server's order. `ProjectPage`'s
  `Issues` renders two `SectionHeader`s with counts (`In progress`, `Open`) and one `List` each,
  skipping an empty group; `ProjectsSheet`'s issue stack does the same with its smaller headers.
  The row's tags filter out the in-progress label. `ImplementIssue`'s success passes `markNote`:
  `onStarted(ref, joinNotes(agent.note, markNote))` and `startedNotice` appends it.

## 2. Contract changes

Additive within `/api/v1`: `Issue` gains the required output field `inProgress`; Implement's
`201` body gains the optional `markNote`. No request changes, no new endpoint, no new problem type.

## 3. Migrations

None.

## 4. Test strategy

- **Domain:** `isInProgress` for label only, worktree only, both, neither, and a label in other
  case.
- **Use case (fakes):** implement marks an issue without the label once; skips the mark when the
  label is there; a failing mark still returns the task with the note; a failing `create` marks
  nothing; `issues` sets `inProgress` from label or worktree.
- **Adapter (local fake HTTP server):** existing label reused (no create); label in other case
  reused; missing label created with the exact body then added; label paging past 50; `403` on
  the add → unavailable without the token; `404` on the issue → `IssueNotFoundError`; the only
  methods ever sent are `GET`, `PATCH`, `POST`.
- **API / acceptance:** `inProgress` in the list; `markNote` in Implement's `201`.
- **Web (fake client):** the two groups with counts and order; empty group left out; "No open
  issues."; no in-progress tag; the projects sheet groups too; the mark note appears after a start.
- **Local check:** the built app at 390 px with `agent-browser` and the fake Gitea; no real issue
  is labelled.

## 5. Risks

- Creating a label in the owner's repositories is a visible side effect; it happens only on the
  first start in a repository and the label says it was set by pocket-comms.
- Two starts at the same moment in a repository without the label could create it twice; Gitea
  allows duplicate names, and later lookups take the first. Acceptable for a single owner.

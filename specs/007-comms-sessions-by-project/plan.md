# Plan 007 — pocket-comms: the overview by project

- **Spec:** [spec.md](./spec.md)
- **Status:** `Approved` — approved by the owner with the spec (2026-11-01)

## 1. Affected projects

| Path                            | Change                                                                                                                                                                                             | Nx tags                               |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `packages/comms/domain`         | `Workspace` gains `project` and `worktree` (both optional); `buildOverview` puts every workspace without a project into one Other group, last; `OTHER_GROUP` key                                   | `scope:comms`, `layer:domain`         |
| `packages/comms/application`    | `AgentDto` gains `project` and `worktree`; `agents.ts` fills them from the snapshot's workspaces                                                                                                   | `scope:comms`, `layer:application`    |
| `packages/comms/infrastructure` | `toWorkspace` reads `worktree.repo_name` as the project and, when `is_linked_worktree`, the label as the worktree; `ownGroup` is no longer used for workspaces                                     | `scope:comms`, `layer:infrastructure` |
| `packages/comms/contract`       | `Agent` gains optional `project` and `worktree`; the `OverviewGroup` key documents `other`                                                                                                         | `scope:contracts`                     |
| `apps/comms-server`             | OpenAPI document regenerated                                                                                                                                                                       | `scope:comms`, `type:app`             |
| `packages/design/ui`            | Icon `menu`; `IconButton` gains an optional `marked` dot; `AgentRow` gains an optional `tag` before the detail, cut at half the line; `Card` holds a section header and rows as the overview needs | `scope:design`, `type:ui`             |
| `apps/comms-web`                | `Overview.tsx`: project cards, Needs you card, row name and tag rules, the menu button and the filter `Sheet`; filter state in the component (not in the URL, not stored)                          | `scope:comms`, `type:web`             |
| comms `AGENTS.md`, spec 004     | A pointer from spec 004 requirement 2 to this spec                                                                                                                                                 | —                                     |

### Shapes

- **Domain.** `Workspace` becomes `{ id, label, group, root?, project?, worktree? }`. A workspace
  with `project` keeps its repository group (`repo_key`, `repo_name`); one without gets the shared
  group `{ key: 'other', name: 'Other' }`. `buildOverview` keeps Herdr's order and moves the
  Other group to the end. An agent whose workspace Herdr did not list also lands in Other.
- **Application.** `agents.ts` already maps workspace ids to labels; it maps them to the whole
  `Workspace` instead and sets `project` and `worktree` on every `AgentDto`. Every place that
  sends an agent (overview, agent, events) uses that mapping, so requirement 3 holds everywhere.
- **Contract.** `project` and `worktree` are `optional(Schema.String)` on `Agent`. Additive; the
  web app is the only client.
- **Web.** The tag rules of requirement 7 live in one pure function `rowTag(agent, section)`
  next to `labels.ts`, with its own tests. The filter is a pure function
  `filterOverview(overview, project)`; the sheet lists the projects from the overview data (group
  names and the Needs you agents' projects), counts and the Needs-you mark.
- **Design.** No look is drawn in the app (the prototype's inline styles and `☰` glyph are not
  kept). The new props come with stories and tests in the design system.

## 2. Contract changes

Additive within `/api/v1`: two optional fields on `Agent`, and the group key `other` for the Other
group (the key was free text before). No endpoint changes.

## 3. Migrations

None. The service has no database.

## 4. Test strategy

- **Unit (domain):** `buildOverview` with a repository and two worktrees (one group), two
  workspaces without a project (one Other group, last), an unlisted workspace (Other), Needs you
  unchanged.
- **Adapters:** `toWorkspace` against the recorded `workspace.list` fixture extended with a linked
  worktree, a main checkout and a plain workspace (anonymised).
- **Application:** the overview and agent use cases set `project` and `worktree`.
- **API / acceptance:** the overview answer carries the new fields and the `other` group.
- **Web:** `rowTag` and `filterOverview` as unit tests; `overview.spec.tsx` with a fake client for
  every acceptance criterion of the spec (cards, Other, names, tags, filter, reset on reload,
  the menu button's mark and name).
- **Design:** stories and tests for `menu`, `marked` and the row tag (cut at half the line).
- **Local check:** the built app at 390 px with `agent-browser` against live Herdr.
- **Boundaries:** dependency-cruiser and the Nx tags; nothing crosses a layer that did not before.

## 5. Risks

- Herdr's `is_linked_worktree` and `repo_name` are undocumented fields; the adapter treats them as
  optional, so a missing field puts a workspace in Other instead of failing.
- A chosen filter can hide a Needs you agent of another project. The mark in the sheet and the
  reset on reload keep that short; accepted by the owner (2026-11-01).

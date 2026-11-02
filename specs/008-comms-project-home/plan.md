# Plan 008 — pocket-comms: one home, one page per project

- **Spec:** [spec.md](./spec.md)
- **Status:** `Done` — approved by the owner with the spec (2026-11-02); checked locally at 390 px against the live Herdr on 2026-11-02

## 1. Affected projects

| Path                 | Change                                                                                                                                                                                                                                                                                                              | Nx tags                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `packages/design/ui` | `SectionHeader` gains an optional `link` (`href`, `label`, `onNavigate`) on its title with a `›` chevron; the plain-click check is shared with `AgentRow`                                                                                                                                                           | `scope:design`, `type:ui` |
| `apps/comms-web`     | `Overview.tsx` without filter and actions, linked card headers, the Projects list; `ProjectPage.tsx` replaces `ProjectIssues.tsx` with Agents and Issues; `NewTask` takes a fixed project; `/projects` redirects to `/`; `Projects.tsx`, `ProjectFilter.tsx` and `project-filter.ts`'s choices removed where unused | `scope:comms`, `type:web` |

No backend change: the overview and projects endpoints already carry what the pages need.

### Shapes

- **Overview.** Project cards link when their name is in the projects query. The Projects list is
  the projects query minus every project with an agent (cards and Needs you).
- **Project page.** Agents are `filterOverview(overview, name)`: Needs you's agents of the project
  first, then its card's. The issue section is spec 006's list, moved as is. An unknown name shows
  "<name> is not a project." once the projects have loaded.
- **New task.** `NewTask` takes `project: string`; the picker and the projects query go.

## 2. Contract changes

None.

## 3. Migrations

None.

## 4. Test strategy

- **Design:** `SectionHeader` with a link: its name, the click handler, axe.
- **Web:** `overview.spec.tsx` (no actions, linked header, Other not linked, Projects list),
  a project page spec (agents, live, empty state, issues, New task names the project, unknown
  name), `new-task.spec.tsx` without the picker, the `/projects` redirect.
- **Local check:** the built app at 390 px against live Herdr.

# Plan 012 — pocket-comms: a flat list of agents and a projects sheet

- **Spec:** [spec.md](./spec.md)
- **Status:** `Approved` — approved by the owner with the spec (2026-11-02)

## 1. Affected projects

| Path                     | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Nx tags                   |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `packages/design/tokens` | A project palette in `theme.{light,dark}`: `color.project.1`–`color.project.5` and `color.project.neutral`, readable on the surface, the sheet and both tints                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `scope:design`            |
| `packages/design/ui`     | `AgentRow` reworked to spec 012's row (`status` with `tone` and `label`, `name`, optional `worktree`, `since`, optional `project` with `label` and `hue`, `title`, `attention`); the kind tile and status slot go. New `FilterChips` (pressed buttons, optional hue per option). `Sheet` gains `side: 'bottom' \| 'end'`, the end sheet sliding in from the right at a fixed width; its modal rules stay. New `Disclosure` (a button with `aria-expanded`, a hue edge and a panel). New `IssueCard` (number and clamped title, a meta line, an actions slot, and a slot that replaces the meta line for an in-place question) | `scope:design`, `type:ui` |
| `apps/comms-web`         | `Overview.tsx` renders the two groups, the filter and the Projects action, and drops the Projects list; a new `ProjectsSheet.tsx` with one `Disclosure` per project and an `IssueCard` per issue; `CloseIssue.tsx` exports the close mutation and the still-working list it already has, so the sheet's in-place question and the project page's sheet share them; `AgentItem` maps an agent to the new row; `rows.ts` drops the per-section tag; `ProjectPage.tsx` passes no project label                                                                                                                                   | `scope:comms`, `type:web` |

### Shapes

- **Groups.** Needs you is `overview.needsYou`; Everything else is `overview.groups.flatMap(g =>
g.agents)`, already in Herdr's order with Other last.
- **Filter.** A pure `filterChoices(groups)` returns the projects present (Other last); the chosen
  key is component state, reset to All when it leaves the choices.
- **Colour.** A pure `projectHue(name, projects)` returns `1`–`5` from the index in the projects
  query, or `neutral`; neutral until the projects query loads.
- **Projects sheet.** Counts come from the overview query; issue counts from `issuesQuery` per
  project, enabled while the sheet is open. The expanded project is sheet state, reset on close.
  Implement and New task reuse `ImplementIssue` and `NewTask`, mounted by the overview; Close uses
  spec 010's endpoint through the shared mutation and invalidates the project's issues; starting
  closes the projects sheet and navigates as the project page does (its notice moves with the
  navigation state to the project page).

## 2. Contract changes

None.

## 3. Migrations

None.

## 4. Test strategy

- **Tokens:** `pnpm tokens:check`; the palette exists in both themes.
- **Design:** specs for `IssueCard` (two-line clamp, actions named by the issue, the question
  slot, axe) and for `AgentRow` (accessible name with the status wording, worktree hidden when
  equal to the name, optional project label, tints, axe), `FilterChips` (one pressed, keyboard,
  axe), `Sheet` with `side="end"` (modal, Escape, focus return, axe) and `Disclosure` (expanded
  state, keyboard, axe); stories in light and dark.
- **Web:** `overview.spec.tsx` for the groups, the filter and the Projects action;
  `projects-sheet.spec.tsx` for the counts, one entry open at a time, the issue states, "is on
  it", Implement and New task closing the sheets and opening the conversation, Close asking in
  place, Cancel, success with the notice, failure keeping the issue; unit specs for
  `filterChoices` and `projectHue`; `project-page.spec.tsx` asserts no project label; `issues.spec.tsx` (spec 010's Close sheet)
  still passes with the shared mutation.
- **Local check:** the built app at 390 px against the live Herdr and Gitea, compared with
  prototype variant I.

## 5. Risks

- Five colours must stay readable on every background in both themes; the token check and a
  look in Ladle decide the values.
- A side sheet opening a bottom sheet (Implement, New task) stacks two modals; the inner one must
  own focus and Escape, and closing it must return focus to the projects sheet.

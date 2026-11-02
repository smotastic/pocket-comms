# Spec 008 — pocket-comms: one home, one page per project

- **Status:** `Done` — approved by the owner (2026-11-02); checked locally at 390 px against the live Herdr on 2026-11-02
- **Changes:** [spec 005](../005-comms-new-task/spec.md) (the New task sheet's project picker and
  its place on the overview), [spec 006](../006-comms-gitea-issues/spec.md) (requirement 4, the
  Projects screen) and [spec 007](../007-comms-sessions-by-project/spec.md) (requirements 4 and
  8–11, the cards and the project filter)

## 1. Problem / intent (WHY)

The owner uses the app on the phone to do three things: see which agents need them, steer one
agent, and start work in a project, from a Gitea issue or from a task they type. Each of these
happens in a project, but the app makes the owner pick the project in three places: the filter
sheet on the overview, the Projects screen that leads to a project's issues, and the project
picker in the New task sheet. The overview already lists the projects as cards, so the menus
repeat what the page shows.

This feature makes the overview the only menu. Every project is on it; tapping a project opens
its page, which holds its agents, its issues and the start of a new task there. The filter, the
Projects screen and the New task project picker go away.

## 2. Scope

- **In scope:** the overview's cards and top bar, a list of projects without agents on the
  overview, the project page (`/projects/<name>`) with its agents, its issues and a New task
  action, and New task without a project picker.
- **Out of scope:** a bottom tab bar, page transitions, capturing ideas as Gitea issues (a
  separate issue), closing sheets with the back gesture, press feedback, the conversation screen,
  and any change to how a task, a worktree or an agent is created (spec 005 and 006 rules stay).

## 3. Requirements (WHAT)

### Overview (`/`)

1. The top bar shows the title and the live indicator only: no filter, no Projects action and no
   New task action.
2. **Needs you** stays the first card (spec 004, requirement 3).
3. The project cards and the Other card stay as spec 007 requirements 4, 6 and 7 define them.
4. A project card's header opens the project page when the project is one of spec 005's projects
   (spec 005, requirements 1–3). Its accessible name is "Open <project>". A card of a project that
   is not in that list, and the Other card, open nothing.
5. After every card, a **Projects** list shows every spec 005 project that has no agent, in spec
   005's order, one compact row per project with its name. A row opens the project page. The list
   is not shown when every project has an agent.
6. The overview shows no filter; spec 007 requirements 8–11 no longer apply.

### Project page (`/projects/<name>`)

7. The top bar has a back action to the overview, the project's name as title, the Gitea
   repository as subtitle when there is one (spec 006), and a **New task** action.
8. The page shows two sections, in this order:
   - **Agents:** the project's agents as rows, as in its overview card (tag, name, status, last
     change), each opening its conversation; "No agents are running." when there is none. The
     project's agents in Needs you are among them, marked by their status.
   - **Issues:** the project's open Gitea issues with Implement with Claude, as spec 006
     requirements 6–13 define them.
9. The agents update live, as the overview does.
10. A name that is not one of spec 005's projects shows "<name> is not a project." and a way back
    to the overview.

### New task

11. New task opens only from a project page. Its sheet shows the project by name and has no
    project picker; every other spec 005 rule stays.
12. A started agent opens its conversation, as today; a task without a started agent shows its
    notice on the project page.

### Removed

13. The Projects screen (`/projects`) is gone; the address leads to the overview.

## 4. Acceptance criteria

- Given agents in `pocket-home` and `pocket-comms`, when the overview loads, then its top bar has
  no filter, Projects or New task action, and the `pocket-home` card's header opens
  `/projects/pocket-home`.
- Given the spec 005 projects `alpha`, `beta` and `gamma` and agents only in `alpha`, when the
  overview loads, then after the cards a Projects list shows `beta` and `gamma`, and `beta` opens
  `/projects/beta`.
- Given the Other card, when the owner taps its header, then nothing opens.
- Given `/projects/pocket-home` with one working and one blocked agent, when the page loads, then
  the Agents section lists both, and a change of an agent's status shows without a reload.
- Given `/projects/beta` without agents, then the Agents section says "No agents are running." and
  the Issues section lists beta's open issues.
- Given the project page of `pocket-home`, when the owner opens New task, then the sheet names
  `pocket-home` and has no project picker, and the task is created in `pocket-home`.
- Given `/projects`, when it loads, then the overview shows.
- Given `/projects/../etc` or an unknown name, then the page says it is not a project.

## 5. Notes

- A Herdr project (spec 007, the `repo_name` of a workspace) and a spec 005 project (a folder
  below `COMMS_PROJECTS_ROOT`) are matched by name. A repository outside the projects root has a
  card on the overview but no page.
- The project page replaces the issue screen of spec 006 at the same address, so links to
  `/projects/<name>` keep working.
- The overview's agents and the project list come from the existing overview and projects
  endpoints; no new endpoint is expected.

## 6. Open questions

None.

# Spec 007 — pocket-comms: the overview by project

- **Status:** `Done` — approved by the owner (2026-11-01); checked locally at 390 px against the live Herdr on 2026-11-01
- **Changes:** [spec 004](../004-pocket-comms-v1/spec.md) (requirements 2, 3 and 4 of the
  overview)
- **Prototype:** branch `chore/prototype-group-sessions-by-project` (variant E won, 2026-11-01)

## 1. Problem / intent (WHY)

On the phone the overview should answer "what is happening in which project". Today it groups by
Herdr workspace: worktrees already join their repository's group, but every workspace without a
repository (a folder that is no git repository, or an agent started from the projects' parent
folder) becomes a group of its own, named by its free-text label. The **Needs you** section does
not say which project an agent belongs to, and a row of an agent without a Herdr name shows its
pane id (`w25:p1`). The owner cannot tell at a glance which project a session is about.

This feature groups the overview by project as cards, collects every session without a project
into one **Other** card, names each row's project and worktree, and adds a project filter that
takes no room on the page.

## 2. Scope

- **In scope:** the project and worktree of each agent in the API, the overview's project cards
  and the Other card, the row's tag and name, and a project filter behind a top bar menu.
- **Out of scope:** guessing a project from a label or terminal title, assigning a session to a
  project by hand, changing how agents or workspaces are started, collapsing cards, sorting cards
  by status, status summaries on a card's header, remembering the filter across reloads, and the
  conversation, projects and New task screens.

## 3. Requirements (WHAT)

### Project of an agent

1. An agent's **project** is the `worktree.repo_name` Herdr reports for the agent's workspace. A
   workspace without worktree data has no project; the app never infers one from a label, a title
   or a path.
2. An agent's **worktree** is its workspace's label when Herdr reports the workspace as a linked
   worktree (`worktree.is_linked_worktree`); an agent in a repository's main checkout has none.
3. The API's agent carries the project and the worktree when they exist, wherever it carries an
   agent (overview, Needs you, an agent's page, the live events).

### Overview (`/`) — changes spec 004, requirements 2–4

4. The overview shows one **card per project**, in Herdr's workspace order of the project's first
   workspace. Every agent without a project is in one **Other** card, always last. A card with no
   agents is not shown. A card's header shows its name and its number of agents.
5. **Needs you** stays the first card and keeps its rules (spec 004, requirement 3).
6. A row's name is the agent's Herdr name, or its workspace label when it has none (no longer its
   pane id).
7. A row shows a **tag** before its title:
   - in Needs you: `<project> · <worktree>`, or `<project>` for a main checkout, or the workspace
     label for an agent without a project;
   - in a project's card: the worktree, or no tag for a main checkout;
   - in the Other card: the workspace label;
   - never when it equals the row's name.

   The tag never takes more than half of the row's second line; a longer tag is cut with an
   ellipsis.

### Project filter

8. A **menu button** in the overview's top bar opens a sheet that lists "All projects" and every
   project with at least one agent (Other last), each with its number of agents and a mark when
   one of its agents is in Needs you. The page itself shows no filter.
9. Choosing a project shows only that project's card, and only that project's agents in Needs
   you. Choosing "All projects" shows everything. The sheet closes on a choice.
10. While a project is chosen, the menu button shows a mark. The filter starts as "All projects"
    on every load and is not remembered.
11. The menu button has the accessible name "Filter by project".

## 4. Acceptance criteria

- Given a repository workspace and two of its linked worktrees, when the overview loads, then it
  shows one card named after the repository holding all their agents, and the worktree agents'
  rows carry their worktree label as the tag, the main checkout's row none.
- Given two workspaces without worktree data, when the overview loads, then their agents are in
  one Other card after every project card, each row tagged with its workspace label.
- Given an agent without a Herdr name, when the overview shows it, then the row is named by its
  workspace label, not by its pane id.
- Given a blocked agent in a linked worktree `ingestor-mvp` of `pocket-home`, when the overview
  loads, then it is in Needs you with the tag `pocket-home · ingestor-mvp`.
- Given agents in `pocket-home` and `pocket-comms` and one of each in Needs you, when the owner
  picks `pocket-home` in the filter sheet, then only the `pocket-home` card and the `pocket-home`
  agent in Needs you are shown, and the menu button shows a mark.
- Given a chosen filter, when the owner reloads the page, then all projects are shown again.
- Given the overview at 390 px width, then no row's tag pushes its title out of the line
  completely.

## 5. Notes

- Herdr already reports `worktree.repo_key`, `repo_name`, `repo_root` and `is_linked_worktree`
  per workspace (`workspace.list`); the server reads more of what it already gets.
- An agent started from the projects' parent folder, or in a folder that is no repository, lands
  in Other by design. The remedy is to start it inside the repository or a worktree; the app does
  not guess.
- The menu button needs a `menu` icon in the design system (`packages/design`); the app does not
  draw its own.

## 6. Open questions

None.

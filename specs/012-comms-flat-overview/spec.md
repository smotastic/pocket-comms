# Spec 012 — pocket-comms: a flat list of agents and a projects sheet

- **Status:** `Done` — approved by the owner (2026-11-02); checked locally at 390 px against the live Herdr and Gitea on 2026-11-02
- **Changes:** [spec 007](../007-comms-sessions-by-project/spec.md) (requirements 4 and 7, the
  cards per project and the row tags) and [spec 008](../008-comms-project-home/spec.md)
  (requirement 1, the top bar without actions; requirements 3–5, the cards, their linked headers
  and the Projects list; requirement 11, New task only from a project page), and adds a second
  place to close an issue to [spec 010](../010-comms-close-issues/spec.md)
- **Prototype:** branch `chore/prototype-overview-variants`, variant I (`/?variant=I&fake=1`),
  approved by the owner on 2026-11-02

## 1. Problem / intent (WHY)

The overview shows a card per project. The owner works in about two projects at a time, so the
cards split a short list into boxes and push agents below the fold without helping to find one.
The owner wants one plain list: what needs them first, then every other agent, each row naming
its project.

Without cards, the overview loses its way to a project. The owner opens projects from a sheet
that slides in from the side; a project opens there in place to show its open issues and the
actions to start work, so most visits need no page change. The project page stays for now; it
may be dropped later if the owner stops using it.

## 2. Scope

- **In scope:** the overview's groups, the look and content of an agent row (on the overview and
  on the project page), a project filter on the overview, the projects sheet with each project's
  issues, Implement with Claude, Close and New task, and removing the Projects list from the
  overview.
- **Out of scope:** the project page apart from its rows, the conversation screen, the order and
  rules of Needs you (spec 004, requirement 3), the rules of a task, of Implement with Claude and
  of closing an issue (specs 005, 006 and 010 stay), closing an agent (spec 011, conversation
  only), and any API change.

## 3. Requirements (WHAT)

### Overview (`/`)

1. The overview shows two groups and no project cards:
   - **Needs you**, as today (spec 004, requirement 3); not shown when empty.
   - **Everything else**: every other agent, by project in Herdr's workspace order of the
     project's first workspace, agents without a project last (spec 007, requirement 4). Not
     shown when empty.

   Each group's heading shows its name and its number of agents. "No agents are running." shows
   when both are empty. The overview shows no Projects list.

2. **Project filter.** When Everything else holds agents of at least two projects (agents without
   a project count as one, **Other**), a row of filter buttons follows its heading: **All**, then
   each of those projects in the group's order, Other last. Exactly one is pressed. Choosing a
   project shows only its agents in Everything else, and the heading's number counts them; All
   shows every agent. The filter never narrows Needs you.
3. The filter starts as All on every load and is not remembered. When the chosen project has no
   agent left in Everything else, the filter returns to All.
4. The top bar has a **Projects** action (accessible name "Projects") at its end that opens the
   projects sheet.

### Agent row (overview and project page)

5. A row opens the agent's conversation, as today. It has two lines:
   - first line: a **status dot**, the agent's name (spec 007, requirement 6), its worktree when
     it has one that differs from the name, and at the end how long ago it last changed;
   - second line: the agent's **project label**, then its title, cut with an ellipsis.

   The row shows no kind tile and no status pill.

6. The status dot's colour follows the status (working, needs you, done, idle, unknown); a working
   dot pulses unless the reader prefers reduced motion. The status's wording (spec 004,
   requirement 4) is part of the row's accessible name.
7. The **project label** is the agent's project, or its workspace label when it has no project.
   The project page's rows show no project label.
8. A project has a **colour**: the n-th spec 005 project takes the n-th colour of a fixed palette,
   starting again after the last. A project outside spec 005's list and an agent without a
   project are neutral. A row's left edge and its project label show that colour, and so do the
   project's filter button and its entry in the projects sheet. Colour is never the only mark of a
   project: the label names it.
9. A blocked agent's row is tinted as needing an answer and an unseen done agent's row as done,
   in Needs you and on the project page alike. A blocked agent shows its title, not "Needs your
   answer".

### Projects sheet

10. The sheet slides in from the right over the overview, which stays in view behind it. It is
    titled **Projects**, is modal, and closes on its Close action, on Escape and on a tap on the
    overview behind it; focus returns to the Projects action.
11. It lists every spec 005 project in spec 005's order. A project's entry shows its name, its
    number of live agents ("No agents" when none), how many of them are in Needs you when any,
    and its number of open issues once they have loaded. A project without a Gitea repository
    shows no issue count.
12. Tapping an entry **expands** it in place, below its line, and collapses any other; tapping it
    again collapses it. The entry is a button whose expanded state a screen reader announces.
    Every sheet opening starts with all entries collapsed.
13. An expanded entry shows, in this order:
    - the project's open issues in spec 006's order (requirements 7–8), each as a compact
      **issue card**, the cards apart from each other;
    - "No open issues." when there are none, or the not-configured, no-remote or unavailable
      state of spec 006 requirements 3, 6 and 9;
    - **New task**, which opens spec 005's New task sheet for the project, as on the project page;
    - **Project page**, a link that opens `/projects/<name>`.
14. An issue card has two lines and no link to Gitea:
    - first line: `#<number>` and the title, at most two lines, then cut with an ellipsis;
    - second line: the labels by name, or the live agent on the issue's branch ("<agent> is on
      it") when there is one, cut with an ellipsis; at its end **Implement** (spec 006's
      Implement with Claude, absent while an agent is on it) and **Close** (spec 010). Their
      accessible names name the issue, such as "Close #24".
15. Implement opens spec 006's Implement sheet for the issue. Starting an implementation or a
    task from the projects sheet closes both sheets and opens the started agent's conversation, as
    on the project page; a task without a started agent shows its notice on the project's page
    (spec 008, requirement 12).
16. Close asks in place: the card's second line becomes "Close #<number> in Gitea?" with
    **Close issue** and **Cancel**, adding "<agent> keeps running." for each agent or worktree still
    on the issue (spec 010, requirement 2). Close issue closes the issue as spec 010 requirements
    3–4 do: progress on the button, a failure's reason in the card with the issue kept, and on
    success the issue leaves the list and the expanded entry says "#<number> closed.". Collapsing
    the entry or closing the sheet cancels a pending question. The project page keeps spec 010's
    confirmation sheet.

## 4. Acceptance criteria

- Given a blocked agent in `pocket-comms` and working agents in `pocket-comms` and `pocket-home`,
  when the overview loads, then Needs you lists the blocked agent, Everything else lists the two
  working agents with the `pocket-comms` agent first, and neither a project card nor a Projects
  list is shown.
- Given that overview, then the filter shows All, `pocket-comms` and `pocket-home` with All
  pressed; choosing `pocket-home` leaves one agent in Everything else, its heading counts 1, and
  Needs you still lists the blocked agent.
- Given Everything else with agents of only `pocket-home`, then no filter is shown.
- Given the filter on `pocket-home` and its last agent ends, then the filter is on All.
- Given an agent `comms-notch` in `pocket-comms` on worktree `fix-pwa-notch`, working, then its
  row's first line reads `comms-notch · fix-pwa-notch` with its last change, its second line
  `pocket-comms` and its title, and its accessible name includes "Working".
- Given an agent without a project in workspace `scratch`, then its project label is `scratch`,
  it is neutral and listed after every project's agents.
- Given `/projects/pocket-home`, then its rows show no project label.
- Given the spec 005 projects `alpha` and `beta`, two agents in `alpha` with one in Needs you,
  and three open issues in `beta`, when the owner opens Projects, then `alpha` reads "2 agents ·
  1 needs you" and `beta` reads "No agents · 3 issues", both collapsed.
- Given the open sheet, when the owner taps `beta`, then its three issues, New task and Project
  page show below it; tapping `alpha` collapses `beta` and expands `alpha`; Escape closes the sheet.
- Given `beta`'s issue #7 with a live agent `beta-7` on its branch, then its card reads "beta-7 is
  on it" and offers Close but no Implement.
- Given `beta` expanded, when the owner chooses Implement on #8 and starts it, then the sheets
  close and the new agent's conversation opens.
- Given `beta` expanded, when the owner taps Close on #8, then the card asks "Close #8 in Gitea?"
  and nothing is sent; Cancel restores the card; Close issue closes #8 through spec 010's endpoint,
  #8 leaves the list and the entry says "#8 closed.".
- Given closing #8 fails with "Gitea refused the token (403)", then the card shows that reason and
  #8 stays listed.
- Given a phone at 390 px, then the open sheet with its issue cards fits without sideways
  scrolling.

## 5. Notes

- The overview's data already arrives as Needs you plus groups in the right order; Everything
  else is the groups' agents in order. No endpoint changes: the sheet uses the projects, overview
  and issues endpoints.
- The colour follows spec 005's project list rather than a hash of the name, so the owner's
  projects never share a colour while there are no more of them than colours.
- Opening the sheet loads every project's issues for the counts; with a handful of projects this
  is a handful of Gitea reads, cached as the project page caches them.

## 6. Open questions

None.

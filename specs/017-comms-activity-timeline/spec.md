# Spec 017 — pocket-comms: an activity timeline across agents

- **Status:** `Done` — approved by the owner (2026-11-03); checked locally at 390 px on 2026-11-03
- **Changes:** [spec 012](../012-comms-flat-overview/spec.md) (the projects sheet gets an
  Activity entry)
- **Issue:** Gitea #27

## 1. Problem / intent (WHY)

When the owner checks pocket-comms from the phone, the overview shows how every agent is _now_.
It does not say what _happened_ since the owner last looked: which agent finished, which one asked
for something and was answered, which one went away. To learn that today the owner opens each
conversation or watches every screen. An activity timeline gives an at-a-glance account of what
changed across all agents, so the owner spots progress or a need for attention in one place.

## 2. Scope

- **In scope:** recording the events the server can observe reliably for every agent kind
  (agents that appear or go, status changes to working, blocked and done, prompts and key answers
  sent from the app), keeping them in a file in the state folder, a live Activity page that lists
  them newest first, and an Activity entry in the overview's projects sheet.
- **Out of scope:** prompts typed on the desktop, the agents' replies from their session files,
  changes to idle or unknown, a project filter, an unread count or badge, notifications, events of
  the brainstorm chat, Gitea events, and anything that happened while the server was not running.

## 3. Requirements (WHAT)

### Recording

1. From the moment it starts, the server watches Herdr and records an event when, compared with
   the last snapshot it saw:
   - an agent appears (**New agent**);
   - an agent is gone (**Gone**);
   - a known agent's status changes to `working` (**Working**), `blocked` (**Needs you**) or
     `done` (**Finished**). A `done` agent that completes another turn without the server seeing
     it work in between is also recorded as **Finished**.

   Changes to `idle` or `unknown` are not recorded. It records whether or not anyone has the app
   open.

2. The first snapshot after the server starts records nothing: it is the baseline the next
   snapshot is compared with. While Herdr cannot be reached nothing is recorded; when Herdr comes
   back, its snapshot is compared with the last one before, so the agents that went or came in
   between are recorded then.
3. When the owner sends a prompt to an agent from the app and Herdr takes it, the server records
   **You:** with the prompt's first non-blank line, at most 80 characters (longer ones are cut and
   end in "…"), and the number of attached images. Nothing else of the prompt is kept.
4. When the owner sends keys from the app (an approval, an answer, Esc, …) and Herdr takes them,
   the server records **You pressed** with the keys.
5. Every event keeps when it happened and the agent as it was then: its name or pane id, its
   workspace, its project and its worktree.

### Keeping

6. The server keeps the newest 100 events from the last 24 hours and drops the rest.
7. The events are kept in one file in the server's state folder, so they survive a restart or a
   deploy. A file that cannot be read is set aside and the timeline starts empty.

### Showing

8. The projects sheet of the overview has an **Activity** link at its top that opens the Activity
   page (`/activity`).
9. The Activity page lists the kept events newest first. Each row shows what happened, the agent's
   name and worktree, the project in the project's colour, and how long ago it was ("4m"). It
   updates live while open, and says when it is not connected.
10. Tapping an event opens the agent's conversation when the agent is still live (a chat or its
    screen, as the conversation does today). For an agent that is gone, it opens the agent's
    project page; an event of a gone agent without a project cannot be tapped.
11. With no events, the page says "Nothing happened in the last 24 hours."
12. The Activity page has a back action to the overview and the Brainstorm action of spec 016.

## 4. Acceptance criteria

- Given two agents, when one turns from idle to working and the other from working to blocked,
  then the timeline lists "Needs you" and "Working" for them, newest first.
- Given a working agent, when it turns idle, then nothing is recorded.
- Given a done agent, when its completion counter grows while it stays done, then "Finished" is
  recorded again.
- Given a server that just started with three running agents, then the timeline has no new
  events for them.
- Given Herdr unreachable for a while, when it comes back without one of the agents, then that
  agent is recorded as gone once.
- Given the owner sends "Fix the failing test\nand run it" with two images, then the timeline
  shows "You: Fix the failing test" with "+2 images".
- Given the owner presses Enter on an approval, then the timeline shows "You pressed Enter".
- Given 120 events, or events older than 24 hours, then the page lists only the newest 100 from
  the last 24 hours.
- Given a restart of the server, then the page shows the same events as before.
- Given an event of a live agent, when the owner taps it, then its conversation opens. Given an
  event of a gone agent in a project, then the project page opens.
- Given no events, then the page says "Nothing happened in the last 24 hours."
- Given a phone at 390 px width, then the page fits without sideways scrolling.

## 5. Notes

- **Why the server records, not the app:** the owner checks from the phone now and then; events
  between two looks only exist if the server records them while nobody watches.
- **Persistence:** chosen over memory only by the owner (2026-11-03), so a deploy keeps the
  history. The file holds prompt excerpts of at most 80 characters; it is written like the
  brainstorm chat (owner-only permissions, atomic rename).
- **Known limit:** when Herdr restarts, its pane ids change, so every agent is recorded as gone
  and as new once.
- The look comes from the design system: `TopBar`, `IconButton`, `LiveIndicator`, `AgentList` and
  `AgentRow`, whose link becomes optional so an event that leads nowhere is a plain row.

## 6. Open questions

None. The owner's decisions of 2026-11-03 are folded in: a JSON file in the state folder; status
changes, agents that appear or go and the app's prompts and keys; a page of its own linked from
the projects sheet; 100 events and 24 hours; working, blocked and done only; prompt excerpts;
gone agents open their project; no project filter.

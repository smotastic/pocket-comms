# Spec 019 — pocket-comms: show an agent's background work and its subagents

- **Status:** `Done` — approved by the owner (2026-11-03); the owner's check on the phone at 390 px is still open
- **Changes:** [spec 004](../004-pocket-comms-v1/spec.md) (requirement 3: which agents need the
  owner), [spec 012](../012-comms-flat-overview/spec.md) (requirement 5: what an agent row shows)
  and the conversation of spec 004 (an `Agent` tool call becomes a link)

## 1. Problem / intent (WHY)

Herdr reports a Claude agent as done as soon as it is back at its prompt. Often it is not done at
all: it started a background shell that waits for CI, a monitor that watches a server, or a
background subagent that reviews a branch. When that work ends, Claude wakes up and carries on by
itself. Comms shows such an agent as done and puts it under Needs you, so the owner opens it,
finds nothing to do, and cannot tell what the agent is still waiting for.

Subagents are opaque as well, background or not. The parent only says it delegated; what the
subagent does, and whether it is still running, stays hidden.

The owner wants to see, at a glance, which agents still have work running in the background, what
that work is, and to read a subagent's conversation from comms.

## 2. Scope

- **In scope:** Claude agents only. Their background shells, monitors and subagents (background
  and foreground); a background marker on agent rows; a strip of running work in the
  conversation; Needs you leaving out agents whose work still runs; a read-only conversation for
  a Claude subagent, opened from the strip or from the parent's delegation.
- **Out of scope:** Pi and other agent kinds (Pi has no background tools); stopping or killing
  background work from comms; showing a shell's or monitor's output; a notification when
  background work ends; scheduled wakeups (`/loop`, `ScheduleWakeup`), which wait rather than
  work; writing to a subagent; a subagent's own subagents (it may show them, but this spec does
  not require it).

## 3. Requirements (WHAT)

### Background work

1. **Background work** of a Claude agent is each of these, from the moment Claude reports it
   started until it ends:
   - a shell started in the background (`Bash` with `run_in_background`);
   - a monitor (`Monitor`);
   - a subagent (`Agent`), whether started in the background or not.

   Each item has a **kind** (shell, monitor or subagent), its **description** as the tool call
   gives it, and the time it started.

2. A background item **ends** when the first of these happens:
   - Claude records that it completed, failed or was stopped (its task notification, or a
     `TaskStop` for it);
   - for a foreground subagent, its tool call returns;
   - for a monitor, the expiry it announced when it started passes;
   - the agent's pane is gone from Herdr, or the agent now runs a different session than the one
     the item started in.

   A shell has no time limit of its own: a long wait for CI stays running for as long as it runs.

3. Background work counts over the agent's whole session, not only over the latest entries a
   conversation shows: an item started long ago that has not ended still counts.
4. Background work is separate from the agent's status. The status stays what Herdr reports
   (spec 004); an agent can be working or done, and have background work at the same time.

### Needs you

5. An agent that is done and still has background work does not need the owner: it is not in
   Needs you, and its completion is not counted as unseen until its background work has ended.
   When the work ends and the agent is done again, spec 004's rules apply as before. A blocked
   agent needs the owner whatever runs in the background.

### Agent row (overview and project page)

6. A row whose agent has background work shows a **background marker** next to its status dot: an
   icon and the number of running items. The marker's wording ("2 running in the background") is
   part of the row's accessible name. A row without background work shows no marker.

### Conversation

7. While the agent has background work, the conversation shows a **background strip** right above
   the composer, whatever the agent's status. Collapsed, it reads "N running in the background".
   Expanded, it lists each item, oldest first, with its kind, its description and how long it has
   been running. The strip is separate from the "Running …" / "Thinking…" activity of spec 004
   and does not replace it.
8. An item that ends leaves the strip without a message; when the last one ends, the strip goes.
   The strip and the row marker follow the session as the conversation does, without a reload.
9. A subagent in the strip opens that subagent's conversation (requirement 11) when the owner
   taps it. Shells and monitors open nothing.
10. In the parent's conversation, the entry for an `Agent` tool call ("Delegated …") opens that
    subagent's conversation. While the subagent runs, the entry shows that it is running and,
    when it was started in the background, that it runs in the background. A subagent whose
    conversation comms cannot find shows its entry as today, without a link.

### A subagent's conversation

11. A subagent's conversation has its own address under its parent's conversation, so it can be
    reloaded and linked. It shows the subagent's entries the way spec 004 shows an agent's, and
    follows them live while the subagent runs.
12. Its top bar names the subagent by its description and its kind of subagent, says it is a
    subagent of the parent agent, and leads back to the parent's conversation.
13. It is read-only: no composer, no approval panel, no Close, no Chat/Screen switch.
14. A subagent's conversation stays readable after the subagent ended, for as long as the session
    file exists. An address for a subagent that does not exist shows a plain "This subagent was
    not found." with the way back to the parent.

## 4. Acceptance criteria

- Given a Claude agent that started a background shell and is back at its prompt, then its row
  shows a done dot and a marker "1 running in the background", and the agent is not in Needs you.
- Given that agent, when the shell's completion is recorded and Claude finishes its next turn,
  then the marker is gone and the agent is in Needs you as a fresh completion.
- Given a background shell started before the latest 300 entries of the session, when it has not
  ended, then it still counts.
- Given an agent with a monitor that announced an expiry of 10 minutes, when 10 minutes pass
  without a notification, then the monitor no longer counts.
- Given an agent with a running background shell, when its Herdr pane closes or the agent starts
  a new session, then the shell no longer counts.
- Given a working agent with a running foreground subagent, then its row shows the marker and the
  conversation's strip lists the subagent next to the activity line.
- Given the conversation of an agent with a background shell and a background subagent, then the
  strip reads "2 running in the background"; expanded, it lists both with kind, description and
  running time. When the owner taps the subagent, its conversation opens; tapping the shell does
  nothing.
- Given a subagent's conversation, then it shows the subagent's prompt, replies and tool calls,
  updates while the subagent runs, has no composer, and its top bar leads back to the parent.
- Given a parent conversation with a finished subagent, when the owner taps its "Delegated …"
  entry, then the subagent's conversation opens.
- Given a blocked agent with background work, then it is in Needs you.
- Given a Pi agent, then it never shows a marker or a strip.
- Given a phone at 390 px width, then a row with a marker and the expanded strip fit without
  sideways scrolling.

## 5. Notes

- **What Claude Code writes** (seen in Claude Code 2.1.302 session files, 2026-11-03):
  - A background `Bash` call has `"run_in_background": true`. Its result arrives at once, with
    `toolUseResult.backgroundTaskId` and the text "Command running in background with ID: …".
    Claude also moves a long command into the background by itself; its call has no flag, but
    its result has the same `backgroundTaskId`.
  - A background `Agent` call has `"run_in_background": "true"` (a string). Its result has
    `toolUseResult.isAsync: true` and `agentId`.
  - A `Monitor` result reads "Monitor started (task …, expires in 10m unless the source ends
    first; …)".
  - Each ends with a `<task-notification>` that holds a `<status>` (`completed`, `failed`, …),
    `<task-id>` and, mostly, `<tool-use-id>`. Claude writes it up to three times: as a
    `queue-operation` enqueue the moment the task ends, as an `attachment` line
    (`commandMode: "task-notification"`) when it arrives during a turn, and as a user line with
    `origin.kind: "task-notification"` between turns. Any copy ends the task; repeats change
    nothing.
  - A monitor also notifies on each event it sees, with `<task-id>`, `<summary>` and `<event>` but
    no `<status>`. Such a notice does not end it.
  - `TaskStop` takes `{"task_id": …}`.
  - A subagent's entries are in `<session>/subagents/agent-<agentId>.jsonl` (lines with
    `isSidechain: true`). Next to it, `agent-<agentId>.meta.json` holds `description`,
    `agentType`, `toolUseId`, `requestShape` and `finished`.
- The meta file is Claude Code's internal format and may change. Comms uses it only to find a
  subagent's conversation from the tool call; whether a subagent runs comes from the parent's
  session (requirement 2). Without the meta file, the subagent still counts and shows in the
  strip, but cannot be opened (requirement 10).
- Today the Claude parser drops task notifications and `isSidechain` lines, and keeps the
  latest 300 entries. Requirement 3 means background work is worked out from the whole session,
  separately from that cap.
- **Ordering:** spec 012 orders Everything else by project, not by status, so requirement 5
  is the only ordering change: an agent with background work stays in Everything else.
- The marker and the strip come from the design system (`packages/design`). The marker extends
  the agent row of spec 012; the look is decided there, not in the app.

## 6. Open questions

None. The owner's decisions of 2026-11-03 are folded in: Claude only; shells, monitors and all
subagents count; background work is a marker on top of Herdr's status, not a status of its own;
a done agent with background work is not in Needs you; the marker on rows and a collapsible strip
in the conversation; items leave quietly; no stop, output, notification or Pi; subagents open
read-only under their parent's address, also after they ended; meta files only to find a
subagent's conversation; a crash, a closed pane or a new session ends the work, a monitor ends at
its expiry, a shell has no time limit.

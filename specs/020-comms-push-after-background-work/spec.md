# Spec 020 — pocket-comms: hold the done push while background work runs

- **Status:** `Approved` — approved by the owner (2026-11-04)
- **Changes:** [spec 018](../018-comms-push-notifications/spec.md) (requirement 4: when a done
  change notifies), building on the background work of
  [spec 019](../019-comms-background-activity/spec.md)

## 1. Problem / intent (WHY)

Spec 019 taught comms that a Claude agent back at its prompt is often not done: a background
shell, monitor or subagent still runs, and Claude carries on by itself when it ends. The overview
already leaves such an agent out of Needs you and marks it as having background work.

The push notifications of spec 018 do not know this. Ten seconds after the turn ends, the phone
still buzzes with "`<agent>` is done", the owner opens it, and there is nothing to do yet. The
owner wants the done push to come when the agent is really done, as the overview already shows it.

## 2. Scope

- **In scope:** when a done change of spec 018 notifies, for agents with background work.
- **Out of scope:** the blocked push; the notification's title, body, tag and link; a push when
  background work ends by itself; keeping a held push across a server restart; Pi and other agent
  kinds, which have no background work (spec 019).

## 3. Requirements (WHAT)

1. **Background work** is what spec 019 counts for an agent: its running background shells,
   monitors that have not expired, and subagents, the same count as the overview's background
   marker.
2. A done change (spec 018, requirement 2) whose agent has background work does not notify
   while that work runs, however long it runs.
3. Once the agent has no background work, the change waits the usual 10 seconds and then
   notifies only if spec 018's check still holds: the agent is still done, with the same
   completion, and the owner has not marked it seen. Background work that starts again within
   those 10 seconds holds the change again.
4. A change that no longer holds sends nothing. When the agent resumed and finished a new turn,
   that new completion is its own done change and notifies by these same rules, so the owner gets
   one push for the real end, not two.
5. A done change of an agent without background work notifies exactly as in spec 018.
6. A blocked change notifies exactly as in spec 018, whatever runs in the background.
7. The notification itself is unchanged: the same title, body, tag and link as in spec 018.
8. A change still held when the server stops is dropped. As in spec 018, what the server sees in
   its first reading after it starts is not a change.

## 4. Acceptance criteria

- Given an agent that finishes a turn with no background work, when the owner does not mark it
  seen within 10 s, then each subscribed device shows "`<agent>` is done", as before.
- Given an agent that finishes a turn while a background shell runs, then no notification goes
  out while the shell runs, even after 10 s.
- Given that agent, when the shell ends and the agent stays done with the same completion and
  unseen for 10 s, then each subscribed device shows "`<agent>` is done" once.
- Given that agent, when the shell ends and the agent starts a new turn and finishes it, then
  exactly one "`<agent>` is done" goes out, for the new turn.
- Given that agent, when the owner marks it seen while the shell runs, then no notification goes
  out for that turn.
- Given an agent with background work that becomes blocked, when it is still blocked 10 s later,
  then each subscribed device shows "`<agent>` needs you", as before.
- Given a server restart while a done push is held, then that push is not sent.

## 5. Notes

- **One rule for Needs you:** after this spec, a done push goes out only for an agent the
  overview would list under Needs you: done, unseen, and nothing running in the background
  (spec 019, requirement 6).
- **Why the push waits rather than drops:** when background work ends, Claude usually wakes up
  and runs a new turn, whose own done change notifies. But a monitor can expire, or the agent can
  ignore the result, and then no new turn follows. Waiting and checking the completion covers both
  without a second push.
- **Owner's decisions of 2026-11-04:** hold the done push while background work runs; wait with
  no cap, then the usual 10 s; check the same completion; blocked pushes unchanged; the same
  notification; a held push is lost on a restart.

## 6. Open questions

None.

# Spec 032 — pocket-comms: recover a task start that stopped before the first prompt

- **Status:** `Approved` — approved by the owner (2026-11-24)
- **Changes:** [spec 005](../005-comms-new-task/spec.md) (requirements 13 and 14),
  [spec 006](../006-comms-gitea-issues/spec.md) (implementing an issue),
  [spec 021](../021-comms-issue-additional-information/spec.md) (the additional information is never
  stored)
- **Issue:** smotastic/pocket-comms#54

## 1. Problem / intent (WHY)

Starting a task, or implementing an issue, can stop partway: the worktree exists, the agent runs
and the issue is marked in progress, but the agent never got its first prompt. Today the app says
so once, in a note on the conversation, and then forgets the prompt. After a reload, or a restart
of the server, nothing tells the owner that the agent is still waiting for its task, and the
in-progress label suggests that it has it. Recovering means retyping the task, or the issue with
its `Closes #…` line, on the phone. Starting again would make a second worktree and agent.

Pull request #104 fixed the most common cause: a started agent, Pi in particular, was prompted
before Herdr let it take input. Other causes remain: a dialog the owner must answer first, an agent
that takes longer than the settle time, Herdr not answering, an agent that did not start at all.
This spec keeps every first prompt that was not delivered and lets the owner send it later, from
the agent's conversation or from the issue, into the same worktree and agent.

## 2. Scope

- **In scope:** keeping each task start and its first prompt in the state folder until it is
  delivered; the **Task not sent** card in an agent's conversation; **Resume** and **Start an
  agent here** on an in-progress issue; starting a Claude or Pi agent in an existing worktree of an
  issue; offering the issue's prompt for a worktree on an issue's branch that has no kept start.
- **Out of scope:** a free picker of agents or worktrees (matching is by the issue's branch only);
  starting an agent in a worktree of a task that has no issue (its agent, once running, gets the
  card); answering an agent's dialog for the owner; resending a prompt without the owner's tap;
  recovering a start whose worktree was not created (nothing changed, the sheet keeps its fields);
  agents on other machines.

## 3. Requirements (WHAT)

### Keeping a start

1. A **task start** is kept for every task the server creates (spec 005, and spec 006 through it)
   as soon as its worktree exists. It names the project, the worktree's branch and folder, the
   issue number when the task implements an issue, the agent kind, the agent's name when one was
   started, the first prompt exactly as it would be sent (with the image paths and, for an issue,
   the additional information of spec 021), and its **delivery**.
2. The delivery is one of:
   - `pending`: the server is still starting the agent or waiting for it;
   - `not-started`: the agent did not start;
   - `not-sent`: the agent started but did not get the prompt, with the reason (it waits for an
     answer, it did not report itself ready in time, or Herdr refused the prompt);
   - `uncertain`: Herdr did not answer the prompt request, so the prompt may or may not have
     arrived;
   - `delivered`: Herdr accepted the prompt.
3. A task without an agent keeps no start. A start whose delivery becomes `delivered` is forgotten.
4. The starts live in `task-starts.json` in the state folder, one per worktree folder, so they
   survive a restart of the server. A start that was `pending` when the server stopped reads as
   `uncertain` after the restart. A broken file is reported and never replaced by a read; only the
   next change writes over it.
5. This changes spec 021: the additional information is stored in the kept prompt until the start
   is forgotten, and nowhere else. It still never goes to Gitea.
6. A start is forgotten when Herdr accepts its prompt from the card (requirement 10), when the owner
   dismisses it, when the agent is closed through the app (spec 011), and when the server finds no
   git worktree at its folder any more. A prompt the owner types in the conversation does not forget
   it.

### The Task not sent card

7. The conversation of an agent whose worktree has a kept start that is not `delivered` shows a
   **Task not sent** card above the composer. It says what exists (worktree, agent, issue and
   whether it is marked in progress) and what did not happen, in the words of the delivery:
   - `not-sent` and `not-started`: "The task was not sent" with the reason;
   - `uncertain`: "The task may not have arrived. Check the conversation before you send it again.";
   - `pending`: "Starting the agent…", without actions.
8. The card shows the kept prompt in an editable text field (the whole prompt, scrollable), and the
   actions **Send**, **Dismiss** and, for `uncertain`, **Send anyway** in place of Send.
9. Send is offered only while the agent is idle and ready for input, as Herdr reports it now (the
   readiness of pull request #104). While the agent is blocked the card says "Answer the agent's
   question first" and keeps the prompt; while it is working or unknown it says so. The app never
   presses a key or answers a dialog for the owner.
10. Send submits the field's text as a prompt, with the same rules as a prompt from the composer
    (spec 004). The server checks again that the agent is idle and ready and that the start is still
    kept; if not, it sends nothing and says why. When Herdr accepts the prompt the start is forgotten
    and the card goes away; when Herdr refuses it the start stays `not-sent` with the new reason;
    when Herdr does not answer it becomes `uncertain`.
11. An `uncertain` start is sent only through Send anyway, which the card shows after the owner has
    seen the conversation's latest entries above it. The server never resends on its own.
12. Dismiss forgets the start without sending anything, after a confirmation in the card.

### Recovering from the issue

13. An issue in progress (spec 015) shows, per worktree of its work (spec 006, requirement 15):
    - a worktree with a kept start that is not `delivered` and a live agent: **Resume**, which
      opens that agent's conversation, where the card of requirement 7 is;
    - a worktree without a live agent: **Start an agent here**;
    - a worktree with a live agent and no kept start: a quiet **Send the issue's task…** link,
      which opens the agent's conversation with the card of requirement 16.
14. Start an agent here opens a sheet that names the project, the branch and the worktree folder,
    and offers Claude or Pi (Claude by default) and a **Start** button. It never creates a worktree
    or a branch.
15. Start starts the agent in a new shell of that worktree's Herdr workspace, or, when Herdr has no
    workspace for the worktree, opens the existing worktree as one first. The agent is named and
    waited for as in spec 005 (requirements 12 and 13), and gets the kept prompt when it is idle and
    ready, so the start is recorded and delivered under the same rules. The app then opens the
    agent's conversation, with the card when the prompt was not delivered.
16. A worktree on the issue's branch that has no kept start (a start by hand, one from before this
    spec, or one whose prompt was delivered) is recovered with the issue's prompt: the server reads
    the issue from Gitea again and builds its task (spec 006, requirement 13) with no additional
    information. Start an agent here sends it as a new start's prompt. For a live agent, the card
    opened by Send the issue's task… offers it, labelled "Prompt built from the issue", as
    `uncertain`: the agent may have it already, so only Send anyway sends it. Nothing is kept until
    the owner sends it or starts an agent.
17. The server takes the worktree only from the project's own git worktree list, matched by the
    issue's branch, and the workspace only from Herdr; never a path from a request. Only a linked
    worktree is used, never the primary checkout.
18. Starting an agent in a worktree that already has a live agent is refused (`409`), so recovery
    never makes a second agent. A second Start while one is `pending` is refused the same way.

### After a partial start

19. The answer of a start (spec 005, requirement 15) and of an issue start stays as it is; the note
    in the conversation is replaced by the card, which carries the same reason.
20. The in-progress label is never read as proof of delivery: an issue is in progress by spec 015,
    and whether its agent has the task comes only from the kept start.

## 4. Acceptance criteria

- Given an issue start whose agent waits at a trust dialog, when the start answers, then
  `task-starts.json` holds the start with delivery `not-sent`, the issue's prompt with `Closes #N`
  and the additional information, and the agent's conversation shows the Task not sent card with
  "Answer the agent's question first" and no enabled Send.
- Given that start, when the owner answers the dialog in Screen view and the agent becomes idle and
  ready, then Send is enabled, and Send submits the field's text once, forgets the start and removes
  the card.
- Given a kept `not-sent` start and a restart of the server, when the owner opens the agent's
  conversation, then the card shows the same prompt.
- Given a start whose prompt request timed out, then the card says the task may not have arrived and
  offers only Send anyway; no prompt is sent until the owner taps it.
- Given a start that was `pending` when the server stopped, when the server starts again, then the
  start reads `uncertain`.
- Given an in-progress issue whose worktree has no live agent, when the owner taps Start an agent
  here and chooses Pi, then Herdr receives no `worktree.create`, one new shell in the worktree's
  workspace and one `agent.start` of kind `pi` there, and the kept prompt reaches that agent once it
  is idle and ready.
- Given a worktree with a live agent, when Start an agent here is requested for it, then the server
  answers `409` and Herdr receives no `agent.start`.
- Given a worktree on `fix/12-login` with an agent and no kept start, when the owner taps Send the
  issue's task… on issue #12, then the card offers the issue's prompt built from Gitea, and sends
  it only on Send anyway.
- Given a request naming a branch that is not a linked worktree of the project, then the server
  answers `404` and calls neither git's write commands nor Herdr.
- Given a kept start, when the owner sends a prompt from the composer, then the start is still kept
  and the card stays.
- Given a kept start, when the owner closes the agent through the app, then the start is forgotten.
- Given the built app at 390 px, then the card and the Start an agent here sheet fit without
  horizontal scrolling.

## 5. Notes

- A start is keyed by the worktree folder because the agent's `cwd` lies in it, it outlives Herdr's
  workspace and pane ids, and git lists it. The agent of a start is the live agent whose `cwd` is in
  that folder; when there are several, the one with the start's agent name, else none (the card
  shows on none and the issue card offers Resume per agent).
- Herdr calls for requirement 15: `tab.create` in the worktree's workspace gives a new root pane at
  a shell; `worktree.open` opens an existing worktree as a workspace when Herdr has none. Both
  without focus (spec 004, requirement 18). The exact parameters are checked against Herdr 0.9.5
  before the adapter is written.
- The words follow the glossary; "task start", "kept prompt" and "delivery" are added to it.

## 6. Open questions

None. Resolved with the owner on 2026-11-24: keep the whole prompt in the state folder until it is
delivered or dismissed; show recovery in the conversation and on the issue card; match by the
issue's branch only; send an uncertain prompt only on an explicit Send anyway; let the owner pick
Claude or Pi for Start an agent here; offer the issue's rebuilt prompt where no start was kept;
forget a start on delivery from the card, on Dismiss, and on closing the agent.

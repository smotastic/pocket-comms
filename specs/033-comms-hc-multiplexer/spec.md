# Spec 033 — pocket-comms: run the agents in herdr-core (hc)

- **Status:** `Approved` — approved by the owner (2026-11-25)
- **Changes:** [spec 004](../004-pocket-comms-v1/spec.md) (the agents come from Herdr),
  [spec 005](../005-comms-new-task/spec.md) (a new task starts in Herdr)
- **Decision:** [ADR 0015](../../docs/architecture/adr/0015-a-multiplexer-port-with-switchable-herdr-hc-and-rex-adapters.md)

## 1. Problem / intent (WHY)

pocket-comms only works with agents that the Herdr TUI runs. Herdr's makers have published
herdr-core (`hc`), a headless server for terminals that stay alive, and the new Herdr desktop app
is one client of it. Agents in hc report their own status through OSC 7501, which Claude Code and
Pi both send, instead of the multiplexer guessing it. ADR 0015 decided that the server picks its
multiplexer by configuration, so the owner can try hc and keep the one that feels best. This spec
adds hc as the second multiplexer. The phone app looks and works the same with either.

## 2. Scope

- **In scope:** the setting that picks Herdr or hc; listing, reading, prompting, answering,
  starting and closing agents in hc; the session of a Claude or Pi agent in hc, so its
  conversation shows; naming the active multiplexer in the web app's texts.
- **Out of scope:** Rex (ADR 0015 waits until it can be installed); colours and bold on the
  screen of an hc agent; hc's other machines (`--on`); showing the agents of Herdr and hc at once;
  moving running agents from one multiplexer to the other; trusting a folder from the phone.

## 3. Requirements (WHAT)

1. `COMMS_MULTIPLEXER` picks the multiplexer: `herdr` (the default) or `hc`. Any other value
   stops the server at start with a message that names the allowed values. The server talks to
   one multiplexer; the agents of the other stay where they are and do not show.
2. With `herdr`, everything behaves as before this spec.
3. With `hc`, an **agent** is a live hc terminal that the app started, or one whose program
   reports a status as Claude Code (`claude-code`) or Pi (`pi`). Plain shells and other programs
   are not agents.
4. An hc agent's **status** comes only from its OSC 7501 report: `idle`, `working`, `blocked` and
   `done` as they are, `error` as `blocked`, and no report as `unknown`. The app never reads a
   status from the screen.
5. An hc agent's **workspace** is the one the app gave it when it started the agent, or else the
   folder it runs in. Workspaces group by project as they do with Herdr: a workspace on a
   worktree of a project belongs to that project, any other to **Other**.
6. A **new task** with hc works as with Herdr: git adds the worktree, and the app starts the
   chosen agent in hc in that folder, with the task as its first prompt once the agent reports
   `idle`. The app never answers a dialog for the owner (spec 005, requirement 13). **Start an
   agent here** (spec 032) works the same way in an existing worktree.
7. With hc, the owner can do what they can do with Herdr: read an agent's screen, send a prompt,
   type an answer without submitting it, press the keys of a dialog, and close an agent with its
   worktree. Closing removes the checkout with git and ends every hc terminal of that workspace.
8. An hc agent's **screen** is its text, without colours or bold.
9. The **conversation** of a Claude or Pi agent in hc shows as with Herdr. Its session is known
   from the agent itself, also after `/clear` or `/resume`. An agent whose session is not known
   shows its screen only, as today.
10. A finished turn of an hc agent counts as a **completion** for **Needs you** and the push
    notification, as a Herdr completion does.
11. The overview names the active multiplexer, and the web app uses that name where it names Herdr
    today: when it cannot be reached ("hc is not running"), in **New task** and in **Close**.
12. The `comms-attach-pull-request` skill, and the server's Claude hook, find their agent in hc
    as they do in Herdr.
13. With hc, nothing in the app moves the owner's focus or trusts a repository, as with Herdr.

## 4. Acceptance criteria

- Given `COMMS_MULTIPLEXER=hc` and a Claude agent started from **New task**, when it starts in hc,
  then git has the worktree in `COMMS_WORKTREES_DIR`, the agent shows under its project with
  status **idle** then **working**, and it got the task as its first prompt.
- Given an hc Claude agent that asks a question, when it waits, then it shows in **Needs you** as
  **blocked**, and the owner can answer it from the conversation as with Herdr.
- Given an hc terminal running only a shell, when the overview loads, then it does not show it.
- Given `hc run claude` started by the owner in a project folder, when Claude reports its status,
  then the agent shows under that project, with its conversation.
- Given an hc agent, when the owner closes it with **Close**, then git removes its worktree and hc
  no longer lists its terminals; with changes, nothing is removed unless the owner chose
  **Discard changes and close**.
- Given hc is not running, when the owner opens the app, then it says "hc is not running" and keeps
  trying.
- Given `COMMS_MULTIPLEXER=rex` or `tmux`, when the server starts, then it stops with a message
  that names `herdr` and `hc`.
- Given no `COMMS_MULTIPLEXER`, when the owner uses the app, then it works with Herdr as before.

## 5. Notes

- hc 0.1.21, protocol generation 1: JSON-RPC 2.0 on `~/.local/state/herdr-core/default/default.sock`
  (`HC_SOCKET` overrides), described by `hc schema`. Terminals have an address (`t7`), an optional
  unique name (1–32 of `a-z 0-9 - _`), free-form labels, a foreground program (`agent`), a title,
  a turn counter and the OSC 7501 status record.
- hc sends a prompt once the program is quiet, and refuses to type into a `blocked` program
  unless forced; the app does not force.
- Claude Code reports nothing while it shows its folder-trust dialog (ADR 0015). Every pocket
  repository is trusted, and a worktree inherits its project's trust.
- The glossary gets **multiplexer**: the program that runs the agents in terminals, such as Herdr
  or hc. Its **agent** entry stops naming a pane.

## 6. Open questions

None. Resolve questions with the human owner before approval and fold the answers into the spec.

# Spec 004 — pocket-comms v1: read and drive Herdr agents from the phone

- **Status:** `Done` — approved by the owner in advance (2026-10-30); smoke-checked against the real Herdr on 2026-10-30

## 1. Problem / intent (WHY)

The owner runs coding agents (Claude, Pi and others) in Herdr on a Mac mini and checks on them from
an iPhone over Tailscale. Herdr's split panes are unreadable at phone width, and typing into a
terminal on a phone is painful. pocket-comms is a phone web app, installed to the home screen, that
shows every live agent, renders Claude and Pi sessions as a chat, and sends prompts and key presses
to an agent. It complements the Moshi terminal app, which keeps push notifications, approvals and
the raw terminal; it does not replace it.

The approved click-through mockup is [`mockup.html`](./mockup.html). The app matches its layout,
states, wording and its dark "Midnight" look (the design kit's dark theme).

## 2. Scope

- **In scope:** the overview, the conversation view, the terminal view, the composer, the approval
  panel, live updates, the Tailscale identity check, the installable web app, and the docs to run it
  behind `tailscale serve`.
- **Out of scope (later):** creating worktrees or new tasks from the app (v2), push notifications
  (Moshi does them), more than one machine, a native app, any database, and changing the machine's
  Tailscale or launchd configuration.

## 3. Requirements (WHAT)

### Overview (`/`)

1. The overview lists every live agent that Herdr reports.
2. Agents are grouped by Herdr workspace. A repository and its worktree workspaces form one group:
   the group key is the workspace's `worktree.repo_key`, its name `worktree.repo_name`; a workspace
   without a worktree is its own group, named by its label. Groups keep Herdr's workspace order.
3. A **Needs you** section on top holds every `blocked` agent and every `done` agent whose current
   completion the app has not shown yet. An agent listed there is not listed in its group again.
4. Each row shows the agent kind (Claude, Pi or the raw kind for others), the agent's name (its
   Herdr name, or its pane id when it has none), a status pill (`working`, `blocked`, `done`,
   `idle`, `unknown`, labelled "Working", "Needs you", "Done", "Idle", "Unknown"), the terminal
   title, and the time since the agent last changed. A blocked row says "Needs your answer"
   instead of the title.
5. The time since the last change is the newer of the modification time of the agent's session
   file and the moment the server saw the agent's status change. An agent the server sees for the
   first time counts from its session file's modification time, or from that moment when it has
   no session file.
6. The overview updates live, without a reload, when an agent appears, disappears, changes status
   or changes its title. A small "live" indicator says whether the live connection is up.

### Conversation view (`/agents/$agent`)

7. `$agent` is the agent's Herdr name, or its pane id when it has none.
8. For Claude and Pi agents the view renders the agent's current session file as a chat:
   - the user's prompts as "You" cards;
   - the assistant's replies as Markdown;
   - each tool call as one collapsed line: a verb, a target and an outcome, such as "Edited
     `foo.ts` +12 −3", "Ran `pnpm test` ✓", "Read `bar.ts`"; a failed call shows ✗;
   - while the agent is `working`, the `Activity` indicator with the latest tool step ("Running
     `pnpm test`…") or "Thinking…".
     Thinking blocks, system and meta entries, and injected skill or tool text are not shown. The view
     shows at most the latest 300 entries.
9. New entries appear live while the view is open, because the server watches the session file.
10. A **Chat | Screen** toggle switches to the **terminal view**: the pane's visible screen
    (`agent.read`, `source: visible`, `format: ansi`) rendered with its ANSI colours and styles. The
    screen refreshes about once a second while it is shown. Agents of other kinds get only the
    terminal view, without the toggle.
11. Opening the view of a `done` agent marks its current completion as seen, so it leaves Needs you.
    The seen state lives in server memory and is lost when the server restarts.
12. The header shows a back button, the agent name, the status pill, the kind and the working
    directory.

### Input

13. A composer (Enter sends, Shift+Enter starts a new line, works with iOS dictation) sends the
    trimmed text as a prompt (`agent.prompt`, without waiting). Empty text cannot be sent.
14. While the agent is `blocked`, the composer is replaced by an **approval panel**: the agent's
    current screen and big key buttons `1`, `2`, `3`, `↑`, `↓`, `Enter`, `Esc` (`agent.send_keys`).
    A `Ctrl-C` button sends only after a long press (about 600 ms); a short tap sends nothing.
15. The terminal view shows the same key row above the composer.
16. A failed send shows its reason and keeps the draft. A successful send clears the draft.
17. Only these keys can be sent: `1`, `2`, `3`, `up`, `down`, `enter`, `esc`, `ctrl+c`.

### Desktop untouched

18. Reading in the app never moves the owner's Herdr focus: the server never calls `agent.focus`,
    `pane.focus`, `tab.focus` or `workspace.focus`.

### Security

19. The server listens only on `127.0.0.1` (port `COMMS_PORT`, default `4410`).
20. It is reached through `tailscale serve`, which adds the `Tailscale-User-Login` header. The
    server rejects with `403` every request (API, live stream, web app and health routes) whose
    header is missing or is not the allowed login.
21. The allowed login is `COMMS_ALLOWED_LOGIN`, default `smotastic@`. A value that ends in `@`
    allows that user name with any identity provider (`smotastic@github`, `smotastic@passkey`);
    any other value must match exactly.
22. The README explains how to run it behind `tailscale serve` (HTTPS). The app does not change the
    Tailscale or launchd configuration itself.

### Installable

23. The web app has a web app manifest, icons, a dark theme colour and `viewport-fit=cover` with
    safe-area padding, so Safari's "Add to Home Screen" opens it full screen. No service worker.

### Herdr unavailable

24. When the Herdr socket is unreachable, the overview says "Herdr is not running" and keeps
    retrying; a command answers `503` with the reason.

## 4. Acceptance criteria

- Given two workspaces of the same repository and one plain workspace, when the overview loads, then
  it shows two groups, the repository group holding the agents of both workspaces.
- Given a `blocked` agent, then it is listed under Needs you with a "Needs you" pill and not in its
  group.
- Given a `done` agent the app has not shown, when the owner opens its conversation and goes back,
  then it is listed in its group, not under Needs you, until it completes again.
- Given a Claude session with a prompt, a reply, an `Edit` and a failed `Bash` call, then the chat
  shows a "You" card, the Markdown reply, "Edited `<file>` +a −r" and "Ran `<command>` ✗".
- Given the same for a Pi session, then the chat shows the same kinds of entries.
- Given an open conversation, when a line is appended to the session file, then the new entry
  appears without a reload.
- Given a `working` agent whose last entry is a pending `Bash` call, then the Activity indicator
  reads "Running `<command>`…".
- Given a `blocked` agent, when the owner taps `1`, then the server sends `agent.send_keys` with
  `["1"]` to that agent; a short tap on Ctrl-C sends nothing, a long press sends `ctrl+c`.
- Given a prompt "hello", when the owner presses Enter, then the server sends `agent.prompt` with
  `text: "hello"` and the composer clears.
- Given a request without `Tailscale-User-Login`, or with `someone@github` while the allowed login
  is `smotastic@`, then the server answers `403`; with `smotastic@github` it answers normally.
- Given any use of the app, then the Herdr adapter never sends a `*.focus` method.
- Given the built app at a 390 px wide viewport, then the overview and a conversation fit without
  horizontal scrolling of the page, and the manifest is served.

## 5. Notes

- Herdr API (protocol 17): a Unix socket at `$HERDR_SOCKET_PATH` or `~/.config/herdr/herdr.sock`;
  one newline-delimited JSON request `{"id","method","params"}` per connection, answered by one line
  with `result` or `error`. `events.subscribe` keeps its connection open and streams events;
  `pane.agent_status_changed` needs one subscription per `pane_id`, so the subscription is rebuilt
  when the pane set changes, and the list is re-read every few seconds as a fallback. Commands take
  the agent's name or pane id as `target`.
- Session files: `agent.list` returns `agent_session.value` (the session id) and `cwd`. Claude:
  `~/.claude/projects/<cwd with / and . replaced by ->/<session-id>.jsonl`, falling back to a search
  of `~/.claude/projects/*/`. Pi: `~/.pi/agent/sessions/--<cwd with / replaced by ->--/<timestamp>_<session-id>.jsonl`.
  Tests use small anonymised fixtures; real transcripts are never committed.
- Live updates use server-sent events; commands use REST. The web app feeds the events into its
  TanStack Query cache.

## 6. Open questions

None. The brief of 2026-10-30 answers the product questions. Two details it left open were decided
conservatively: the `smotastic@` default is read as "this user name with any provider"
(requirement 21), because the owner's Tailscale login is `smotastic@github`; and seen state is keyed
by the agent's pane and Herdr's `completion_seq`, so a new completion shows again.

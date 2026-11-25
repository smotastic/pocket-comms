# Plan 033 — pocket-comms: run the agents in herdr-core (hc)

- **Spec:** [spec.md](./spec.md)
- **Status:** `Draft` — spec and plan await one human approval

## 1. Affected projects

| Path                                      | Change                                                                                                                                                                                                                                                | Nx tags                              |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `packages/comms/domain`                   | `Multiplexer` (`herdr`, `hc`) and its display name; the OSC 7501 status mapping (`statusOf`); the doc comments of `Agent` and `Workspace` lose "Herdr"                                                                                                | `scope:comms`, `type:domain`         |
| `packages/comms/application`              | `MultiplexerOutbound` names its program (`multiplexer`); the overview use case passes it on                                                                                                                                                           | `scope:comms`, `type:application`    |
| `packages/comms/infrastructure`           | New `hc/` adapter: JSON-RPC client of the hc socket, `layerSocket`; a fake hc server for its tests (`testing/hc-server.ts`)                                                                                                                           | `scope:comms`, `type:infrastructure` |
| `packages/comms/contract`                 | `OverviewState` gets `multiplexer` (both variants)                                                                                                                                                                                                    | `scope:comms`, `type:contract`       |
| `packages/comms/api`                      | Pass `multiplexer` into the overview state                                                                                                                                                                                                            | `scope:comms`, `type:api`            |
| `apps/comms-server`                       | `COMMS_MULTIPLEXER` and `HC_SOCKET` config; the composition picks `Herdr.layerSocket` or `Hc.layerSocket`; the Claude hook labels the hc terminal with its session; a Pi extension does the same; the attach skill reads `HC_TERMINAL_ID` too; README | `scope:comms`, `type:app`            |
| `apps/comms-web`                          | The texts that name Herdr use the overview's multiplexer                                                                                                                                                                                              | `scope:comms`, `type:app`            |
| `GLOSSARY.md`, `packages/comms/AGENTS.md` | **Multiplexer**; the hc rules                                                                                                                                                                                                                         | —                                    |

### The hc adapter

- **Connection.** One request per connection, as the Herdr adapter does; a long-lived
  `events.subscribe` connection feeds `changes`, plus a relist every few seconds and while hc is
  unreachable. A missing socket is `MultiplexerUnavailableError`; a JSON-RPC error with a
  `data.kind` is `MultiplexerRejectedError` with that kind as its code.
- **Snapshot.** `terminal.list`. An agent is a terminal with the label `comms.agent`, or with a
  status record whose `app` is `claude-code` or `pi` (spec requirement 3). Agent fields: `paneId`
  is the address (`t7`), `name` the hc name, `kind` `claude` or `pi` from the record's `app`, else
  hc's foreground program, `status` from `statusOf`, `title`, `cwd`, `completion` hc's `turn`,
  `session` the label `comms.session`.
- **Workspaces.** A terminal's workspace id is its label `comms.workspace`, else its `cwd`; its
  label is `comms.label`, else the folder's name. Root, project and checkout come from git
  (`rev-parse --show-toplevel --git-common-dir`, argument arrays, cached by folder), so grouping
  matches Herdr's. Order: by the oldest terminal of each workspace.
- **Opening.** `openWorktree` and `openShell` start a login shell in the folder (`terminal.run`
  with no argv) with the labels `comms.workspace` and `comms.label`, `no_parent`, and give its
  address as the pane. `alreadyOpen` is true when a live terminal already has that workspace.
- **Starting.** `startAgent` starts the agent program itself with `terminal.run`: argv
  `[kind, ...COMMS_AGENT_ARGS]`, never a shell line; the pane's folder and labels plus
  `comms.agent`; the agent's name; `keep`, so it becomes a shell when the agent ends; `no_parent`.
  It then ends and removes the shell terminal it was given. `readAgent` is `terminal.get`: ready
  once a status is reported and it is not `blocked`.
- **Input.** `prompt` is `terminal.send` without `force`. `typeText` and `sendKeys` write raw
  bytes as DATA frames through `terminal.attach` on a framed connection
  (`[channel u32 LE][kind u8][len u32 LE][payload]`), attached with the terminal's own size so
  it is never resized, with the key sequences the Herdr adapter already encodes, one key per
  write, `keyGap` apart, then CLOSE. `terminal.keys` is not used: it waits for ~3 s of quiet
  while the program prints. `readScreen` is `terminal.read`.
- **Closing.** `closeWorkspace` kills and then removes every terminal of the workspace.

### The session of an hc agent

- The server's Claude hook (`claude-hook.ts`), on `SessionStart`, runs
  `hc label $HC_TERMINAL_ID comms.session=<session>` when `HC_TERMINAL_ID` is set: Node built-ins
  only, a 2 s limit, no output, exit `0` whatever happens.
- A Pi extension in `apps/comms-server/pi-extensions/comms-session.ts` does the same on Pi's
  session start and switch. It is set up once per machine like the skill (README, AGENTS.md).

## 2. Contract changes

`OverviewState` gets a required `multiplexer: "herdr" | "hc"` on both variants. It is an added
response field, compatible within `/api/v1`. The OpenAPI document is regenerated and committed.
The web app shows `Herdr` or `hc`.

## 3. Migrations

None. The server has no database.

## 4. Test strategy

- **Spike, done 2026-11-25 against hc 0.1.21:** raw DATA through `terminal.attach` typed text
  into a shell without Enter in 0.02 s, a raw Enter submitted it, a raw arrow moved the choice of
  Claude Code's folder-trust dialog, and the terminal kept its size. `terminal.keys` took effect
  at once on a quiet terminal. `terminal.send` did not wait for text typed without Enter: it was
  pasted after it and both were submitted. The app types without Enter only into a waiting dialog,
  whose agent is `blocked`, and hc refuses a prompt to a blocked agent without `force`.
- **Domain:** `statusOf` for every OSC 7501 state, `error`, `clear` and no record; the display
  name of each multiplexer.
- **Adapter:** `hc/socket.spec.ts` against a scripted fake hc server (Unix socket, JSON-RPC,
  framed attach): which terminals are agents; workspaces and grouping; `terminal.run` arguments
  (argv, labels, `keep`, `no_parent`, never a shell line); prompt without `force`; raw input
  bytes; close kills then removes; unavailable and rejected errors; `changes` on events and while
  hc is away; no request ever asks hc to focus or trusts a repository.
- **Shared port behaviour:** the Herdr and hc adapter tests share one set of cases for what the
  application relies on (snapshot shapes, prompt, typed text, keys, open, start, read, close),
  each against its own fake.
- **Server:** config (`COMMS_MULTIPLEXER` default, `hc`, a refused value), composition picks the
  layer, the hook labels the terminal only inside hc and never fails.
- **Web:** the three texts name the overview's multiplexer.
- **Live check before the pull request:** with `COMMS_MULTIPLEXER=hc` on a dev server, start a
  Claude task from the app, answer a question, read the conversation, close it.
- **Boundaries:** only `infrastructure` talks to the hc socket; dependency-cruiser and the ports
  check stay green.

## 5. Risks

- hc is 0.1.x and its protocol may change; the adapter checks `hello`'s protocol generation and
  reports an unknown one as unavailable.
- A Claude agent on its folder-trust dialog reports nothing and shows as **unknown**; only an
  untrusted project hits this (spec, notes).
- The owner's Claude hook and Pi extension must be set up for conversations in hc; without them an
  hc agent shows its screen only.

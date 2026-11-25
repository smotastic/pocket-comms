# ADR 0015 — A multiplexer port with switchable Herdr, hc and Rex adapters

- **Status:** Accepted
- **Date:** 2026-11-25
- **Related:** constitution principles 1, 9, 10; ADR 0003, ADR 0012

## TL;DR

The comms server talks to the program that runs the agents through a neutral
`MultiplexerOutbound` port, with one adapter each for the Herdr TUI, herdr-core (`hc`) and Rex. The
server's configuration picks one, so the owner can try each one and keep the one that feels best.
The API and the web app do not change. Agent status comes from the Program Status Protocol
(OSC 7501), which hc and Rex both read and Claude Code and Pi both send.

## Context

Comms watches and prompts agents that the Herdr TUI runs, through Herdr's socket API
(`packages/comms/infrastructure/src/herdr/socket.ts`) behind the `HerdrOutbound` port. Two
newer programs run agents the same way:

- **herdr-core (`hc`)**, from the makers of Herdr. It is a headless server for terminals that
  stay alive, and the new Herdr desktop app is one client of it. It is open source (Apache-2.0)
  and at version 0.1.21. Its API is JSON-RPC 2.0 on a local socket, described by an OpenRPC
  document (`hc schema`), with an event stream (`events.subscribe`). It has terminals with
  free-form labels, and no workspaces, tabs or worktrees. It runs terminals on other machines
  over SSH (`--on`). `hc attach` shows a terminal in any terminal emulator. Herdr's site says the
  Herdr TUI and hc do not share agents, and says nothing about the TUI moving onto hc.
- **Rex**, from Superlogical. It is a terminal and multiplexer built on libghostty. It is a
  closed-source beta: a macOS and iOS app, and servers for Linux, FreeBSD and Windows. Its API is
  self-describing (`rex api list`, `rex api describe`) and is reached through a local Unix
  socket or the `rex` CLI. It has sessions, windows and blocks with labels, `rex capture`
  (`text`, `html` or `vt`), and events such as `terminal.program_status_changed`. It has no
  worktrees either. It is not installed on the owner's machine yet.

Superlogical also published the **Program Status Protocol (OSC 7501)**, revision 0.4: a program
reports `idle`, `working`, `blocked` (with `kind` `permission`, `question` or `auth`), `done` or
`error`. Claude Code sends it from 2.1.295, Pi from 1.1.0, and only after the terminal answers
the `OSC 7501 ; ?` query. A check on 2026-11-25 under hc 0.1.21 reported `{app: claude-code,
state: idle}` and `{app: pi, state: idle}`. Claude Code reported nothing while it showed its
folder-trust dialog.

The current port is shaped by Herdr: it has workspaces with panes, and it creates and removes git
worktrees through Herdr. Neither hc nor Rex can do either.

In scope: the port, its adapters and the server's configuration. Out of scope: the API, the web
app, and running two multiplexers at once.

## Options

| Criterion                     | Herdr only               | Switch to hc              | Switch to Rex             | Neutral port, switchable adapters |
| ----------------------------- | ------------------------ | ------------------------- | ------------------------- | --------------------------------- |
| Owner can compare in practice | ❌                       | ❌                        | ❌                        | ✅ one setting                    |
| Agent status source           | ⚠️ Herdr's own detection | ✅ OSC 7501               | ✅ OSC 7501               | ✅ OSC 7501 where offered         |
| Open source and available     | ✅                       | ✅ Apache-2.0             | ❌ closed beta            | ⚠️ depends on the adapter         |
| Workspaces and worktrees      | ✅ built in              | ❌ labels, no worktrees   | ⚠️ sessions, no worktrees | ✅ comms owns worktrees           |
| Terminal UI to look in        | ✅ the TUI               | ⚠️ `hc attach`, Herdr app | ✅ Rex app                | ✅ follows the adapter            |
| Maturity                      | ✅ in use since spec 004 | ⚠️ 0.1.x, protocol gen. 1 | ⚠️ beta                   | ⚠️ the least mature one is chosen |
| Code to maintain              | ✅ one adapter           | ✅ one adapter            | ✅ one adapter            | ⚠️ three adapters, one contract   |

## Decision

We will make the multiplexer a port with one adapter per program, and pick the adapter in the
server's configuration:

- **The port.** `HerdrOutbound` becomes `MultiplexerOutbound`, and `HerdrUnavailableError` and
  `HerdrRejectedError` become `MultiplexerUnavailableError` and `MultiplexerRejectedError`. The
  port keeps its operations: a snapshot of agents and workspaces, a change stream, reading the
  screen, prompting, typing, pressing dialog keys, starting and reading an agent, and opening and
  closing workspaces. Its words come from the glossary (agent, workspace, screen), never from
  one program (pane, block, terminal). An agent is addressed by an opaque id that the adapter
  owns.
- **Worktrees leave the port.** A new `WorktreesOutbound` port, with a git adapter, creates and
  removes worktrees. The multiplexer only opens a workspace on a path and closes it. With Herdr,
  this replaces Herdr's own worktree commands.
- **Workspaces.** Each adapter maps a workspace onto what its program has:
  - Herdr: a workspace.
  - hc: labels on each terminal (`comms.workspace`, `comms.project`), grouped by comms. hc has
    nothing to show the group in.
  - Rex: a session per workspace, labelled with it, and one window per agent.
- **Status.** The hc and Rex adapters take agent status only from OSC 7501 records and never read
  it from the screen: `idle`, `working`, `blocked` and `done` map one to one, `error` maps to
  `blocked` (an agent stopped on an error needs the owner, as one waiting on a question does),
  and no record maps to `unknown`. The Herdr adapter keeps Herdr's own status.
- **Which agents.** With hc and Rex, an agent is a terminal that comms started (it carries the
  `comms.agent` label) or one that reports a status record from `claude-code` or `pi`. Plain
  shells are not agents.
- **Choosing.** `COMMS_MULTIPLEXER` is `herdr` (the default), `hc` or `rex`. One server talks to
  one multiplexer. Agents started under another one stay where they are and do not show; the
  owner accepts this and switches when no agent is busy.
- **Trusted folders.** Comms starts Claude Code agents only in projects that Claude Code already
  trusts. A worktree of a trusted project needs no trust of its own (checked on 2026-11-25: Claude
  Code showed no trust dialog in a worktree without its own entry), and every pocket repository is
  trusted today. The owner trusts a new project once, on the desktop. Trusting a folder from the
  phone would be a later feature with its own spec.
- **Order.** hc is the first new adapter, because it is open source, already installed and has a
  typed schema. Its first step moves today's Herdr code behind `MultiplexerOutbound` without a
  change in behaviour, so that `herdr` stays the default while hc is built. The Rex adapter waits
  until the owner can install Rex. This ADR fixes the port so that it fits Rex, but does not
  require the adapter.
- **Tests.** One contract suite for `MultiplexerOutbound` runs against every adapter, each against
  a scripted fake of its program's socket (like `testing/herdr-server.ts` today). No test in CI
  needs a real multiplexer.

## Consequences

- **Positive:** the owner can switch between Herdr, hc and Rex with one setting, and the phone app
  stays the same. Status from OSC 7501 is reported by the agent itself, which is the same across
  hc and Rex and can replace the readiness workarounds of specs 032 and #104. hc and Rex both
  bring remote machines for later. Worktrees belong to comms and no longer depend on Herdr.
- **Negative / trade-offs:**
  - Three adapters must keep one contract.
  - hc 0.1.x and the Rex beta can change their APIs without notice.
  - The hc adapter shows no workspaces in hc's own tools, and the Herdr desktop app may group
    agents differently from comms.
  - A switch hides the agents that the other multiplexer runs, so the owner switches when no
    agent is busy.
  - Some details differ between adapters. hc's `terminal.read` gives text without ANSI escapes (a
    raw stream needs `terminal.attach`), and Rex's `capture` gives `vt`. hc sends keys only after
    about 3 s of quiet, and holds prompts while the owner types in the terminal.
  - A Claude Code agent on its folder-trust dialog reports no status. In a project that is not
    trusted yet, a task start shows the agent as **unknown** until the owner trusts the folder on
    the desktop.
- **Follow-ups:**
  - Make the Claude hook and the `comms-attach-pull-request` skill find their agent without
    `HERDR_PANE_ID`: the adapter passes a `COMMS_AGENT_ID` to the agents it starts.
  - Update the glossary: the **agent** entry names a pane, and the glossary has no word for the
    multiplexer yet.
  - Recheck hc and the Herdr TUI when Herdr says whether the TUI moves onto hc.
  - Maybe: a spec to trust a project's folder from the phone.

# ADR 0012 — An agent runtime port with a Pi adapter

- **Status:** Accepted (amended by ADR 0014)
- **Date:** 2026-11-02
- **Related:** constitution principles 1, 9, 10; ADR 0002, ADR 0003; spec 013

## TL;DR

A service that runs an LLM agent itself does it through an outbound `AgentRuntimeOutbound` port:
"run one turn with this history, these instructions and these tools, and emit events". The first
adapter runs Pi's agent core (`@earendil-works/pi-agent-core`) in process. The tools, the approval
rules and the storage stay in the service; the adapter only drives the model. This is the shape
of pocket-learning's coach (its ADR 0012).

## Context

Until now pocket-comms only watched and prompted agents that Herdr runs. Spec 013 adds a
brainstorm chat with Pi that needs no project, worktree or terminal, and that may only read a few
things and propose issues. The owner is already signed in to Pi.

Constraints: the domain and application know no framework (principle 1, ADR 0003); the model
gets only the tools the service defines, never file or shell access; a turn can pause for the
owner (a proposal) and continue after a restart; credentials stay on the server.

## Options

| Criterion                        | Agent runtime port, Pi adapter | A Herdr agent in a workspace   | Model port, own loop        |
| -------------------------------- | ------------------------------ | ------------------------------ | --------------------------- |
| Only service-defined tools       | ✅ the core has none           | ❌ a coding agent's full tools | ✅                          |
| Approval before a write          | ✅ a tool ends the turn        | ⚠️ the agent's own dialogs     | ✅                          |
| Works without a project or Herdr | ✅                             | ❌                             | ✅                          |
| Uses Pi's loop, events and state | ✅                             | ✅                             | ❌ the service rewrites it  |
| Code to maintain                 | ⚠️ a thin adapter              | ✅ little                      | ❌ a loop, retries, streams |

## Decision

We will put an outbound `AgentRuntimeOutbound` port in the application layer of a service that
runs an agent, and adapters for it in the infrastructure layer:

- The port takes the stored runtime state (opaque JSON), the instructions, the input and a tool
  set, and returns a stream of runtime events: text deltas, complete messages, tool calls and
  results, and the end of the turn with the new state. A failed turn fails the stream.
- Tools are defined in the application as a name, a description, parameters as an Effect Schema
  and an Effect to run. A tool can end the turn (to wait for the owner); the next turn continues
  from the stored state.
- The first adapter uses `@earendil-works/pi-agent-core` and `@earendil-works/pi-ai`, pinned to an
  exact version. It does not use `pi-coding-agent`, whose file, shell and edit tools the service
  must never offer.
- Provider, model and credentials come from the server's configuration. The Pi adapter may use the
  owner's Pi login: it reads and refreshes Pi's `auth.json` through its own `CredentialStore`,
  under Pi's file lock. Unlike a service whose only job is the agent, the comms server starts
  without a model and reports the feature as not set up.
- Only `infrastructure` imports `@earendil-works/*` (a dependency-cruiser rule).
- Tests use a scripted fake runtime; the adapter has a test with pi-ai's faux provider. No test in
  CI calls a model.

## Consequences

- **Positive:** the service's rules (what a tool may read, approval, storage) are tested without a
  model; Pi stays in one adapter; another runtime is a new adapter.
- **Negative / trade-offs:** the port follows the shape of agent loops like Pi's. Pi's runtime state
  is stored in Pi's message format. The service now has stored state (a file), where before it had
  only memory.
- **Follow-ups:** none.

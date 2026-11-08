# ADR 0014 — Run the brainstorm chat on the shared agent package

- **Status:** Accepted
- **Date:** 2026-11-07
- **Related:** constitution principles 1, 6, 9 and 10; ADRs 0003, 0012 (amended), 0013;
  pocket-factory ADR 0015 and spec 014; pocket-learning ADR 0018; spec 013, spec 023; issue #64

_Structure only. The lifecycle rules are in [`README.md`](README.md#lifecycle)._

> **As-built note (2026-11-08).** Since spec 026 (agent package 0.3.0) the brainstorm chat streams
> through the package's chat feed and sink. The contract, the chat file store and the web app import
> the package's browser-safe `./chat` entry (the stream schema and its fold); the application also
> takes `./chat`. The adapter entries stay where the Layers bullet puts them.

## TL;DR

The brainstorm chat takes its agent runtime port, tool definition, turn engine and Pi adapter from
`@smotastic/pocket-agent` (pocket-factory ADR 0015) instead of its own copy, as pocket-learning's
coach does (its ADR 0018). ADR 0012's decision stands. The runtime is still a port with Pi as its
adapter, and the service still owns the tools, the approvals and the storage. Only the port's and
the adapter's code moves into the package.

## Context

ADR 0012 put the model behind a port in the comms service. That code was copied from
pocket-learning's coach, and the copies drift. pocket-factory now publishes the common agent code
once. Its 0.1.0 lacked three things the brainstorm chat has: pictures for a model that takes them
(spec 023), failure reasons without the API key (spec 013, requirement 21), and stopping a running
turn on New chat. 0.2.0 adds them. The comms service must stay hexagonal: the application layer
knows no Pi and no Node module.

## Decision

- **Version.** The catalog pins `@smotastic/pocket-agent`. A framework change is a bump there, as
  for `pocket-ci` and `pocket-design`.
- **What moves.** The package's `AgentRuntime`, `AgentTool`, `defineTool`, `ToolRefusal` and
  `RuntimeState` replace `AgentRuntimeOutbound`, `RuntimeTool`, `ToolOutcome`, `RuntimeState`,
  `defineTool` and `ToolRefusal`. The brainstorm use case keeps its job: the chat, its entries,
  proposals and pictures. It hands admission to the background, the one turn per chat, the
  5-minute deadline and the ended/failed guarantee to the package's `makeTurnEngine`. When the end
  of a turn cannot be stored, the chat records the failure itself. `infrastructure/src/agent` is
  deleted.
- **Settings.** The server wires `layerPiRuntime({ prefix: 'COMMS_BRAINSTORM', required: false })`,
  so the chat still starts without a model and reports `notSetUp`. The `COMMS_BRAINSTORM_*`
  settings keep their names and meaning. Pi's credential file becomes
  `COMMS_BRAINSTORM_PI_AUTH_FILE` (was `COMMS_PI_AUTH_FILE`), because the package reads every
  setting under the app's prefix. `PI_CODING_AGENT_DIR` still applies.
- **Layers.** `packages/comms/application` imports the package's root entry only. The server imports
  `./pi`, and tests and the application's fakes import `./testing`. The domain imports none of it,
  and no code here imports `@earendil-works/*`. Dependency-cruiser enforces all of this.
- **Amends ADR 0012:** its port and adapter now live in the package. Its rules hold unchanged,
  except that infrastructure no longer imports Pi.

## Consequences

- **Positive:** the brainstorm chat and the coach share one tested runtime; comms loses about
  1,200 lines of adapter code.
- **Negative / trade-offs:** a framework fix waits for a package release; the package's API is a
  contract comms must follow on every bump. A turn past its deadline now reads "The agent did not
  answer in time.", and an unset model reads "Set COMMS_BRAINSTORM_PROVIDER and
  COMMS_BRAINSTORM_MODEL.", both in the package's words. An unknown `COMMS_BRAINSTORM_THINKING`
  now leaves the chat not set up instead of stopping the server.
- **Follow-ups:** pocket-cloud renames `COMMS_PI_AUTH_FILE` in its install script. Offering the
  package's `fetch_url` and `web_search` to the brainstorm chat is new behaviour and needs a spec.

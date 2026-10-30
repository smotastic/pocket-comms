# Plan 004 — pocket-comms v1

- **Spec:** [spec.md](./spec.md)
- **Status:** `Approved` — approved by the owner in advance (2026-10-30)

## 1. Affected projects

The service is `comms`. Packages are named `@pocket-comms/comms-…`, service keys
`comms/application/…`.

| Path                             | Change                                                                                                                                                                                                            | Nx tags                               |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `packages/comms/domain`          | `AgentStatus`, `AgentKind`, `AgentKey`, `Prompt`; `Agent`, `Workspace`; `buildOverview` (groups, Needs you, seen); `TranscriptEntry` and `activityOf`; `isSeen`/completion key                                    | `scope:comms`, `layer:domain`         |
| `packages/comms/application`     | `AgentsInbound` (one method per use case), outbound ports `HerdrOutbound`, `TranscriptOutbound`, `SeenOutbound`, `ChangeClockOutbound`; DTOs, port errors, fakes in `src/testing`                                 | `scope:comms`, `layer:application`    |
| `packages/comms/infrastructure`  | `Herdr.layerSocket` (Unix socket client, event subscription with re-subscribe and periodic re-list), `Transcript.layerFiles` (Claude and Pi readers and watchers), `Seen.layerMemory`, `ChangeClock.layerMemory`  | `scope:comms`, `layer:infrastructure` |
| `packages/comms/contract`        | `CommsApi` (`HttpApi`) at `/api/v1` with wire schemas and the SSE streams                                                                                                                                         | `scope:contracts`                     |
| `packages/comms/api`             | Handlers, Problem Details mapping, the Tailscale identity middleware, health routes, static web app route, OpenAPI document, acceptance suite                                                                     | `scope:comms`, `layer:infrastructure` |
| `apps/comms-server`              | Composition root: `main.ts` (listens on `127.0.0.1`), `openapi.ts`, config (`COMMS_PORT`, `COMMS_ALLOWED_LOGIN`, `HERDR_SOCKET_PATH`, `COMMS_WEB_DIST`)                                                           | `scope:comms`, `type:app`             |
| `apps/comms-web`                 | React + Vite + TanStack Router/Query web app: `/` and `/agents/$agent`, the SSE bridge into the query cache, manifest and icons                                                                                   | `scope:comms`, `type:web`             |
| `packages/design/ui`             | New kit components: `StatusPill`, `AgentRow`, `SectionHeader`, `Segmented`, `ToolLine`, `UserMessage`, `TerminalScreen` (ANSI renderer), `KeyPad` (with long-press key), `TopBar`, `LiveIndicator`; no app styles | `scope:design`, `type:ui`             |
| `eslint.config.mjs`              | `scope:comms` constraint                                                                                                                                                                                          | —                                     |
| `blueprints/bookmarks`, spec 001 | Removed once the comms server exists (TEMPLATE.md step 3), with every listed follow-up                                                                                                                            | —                                     |

### Shapes

- **Domain** is pure: it builds the overview from plain agent and workspace records, the seen set
  and the change times; it derives the activity label from transcript entries; it validates keys
  and prompts with `Result`.
- **Ports.** `HerdrOutbound`: `listAgents`, `listWorkspaces`, `readScreen(target)`,
  `prompt(target, text)`, `sendKeys(target, keys)`, `changes` (a `Stream` that emits whenever the
  agent or workspace set may have changed). It has no focus method, so no use case can move the
  owner's focus. `TranscriptOutbound`: `read(session)` (latest entries and the file's modification
  time) and `follow(session)` (a `Stream` of new entries). `SeenOutbound` and
  `ChangeClockOutbound` are in-memory stores.
- **Use cases** (`AgentsInbound`): `overview`, `overviewChanges` (a `Stream` of overviews, de-duplicated),
  `agent`, `transcript`, `transcriptChanges`, `screen`, `prompt`, `sendKeys`, `markSeen`.
- **Transcript parsing** lives in the infrastructure adapters (it is file-format mapping): one
  parser per format turns JSON lines into domain `TranscriptEntry` values, with tool summaries
  (`Ran`, `Edited +a −r`, `Wrote`, `Read`, `Searched`, `Delegated`, `Used`) and outcomes matched
  by tool call id.
- **API.** `GET /agents`, `GET /agents/{agent}`, `GET /agents/{agent}/transcript`,
  `GET /agents/{agent}/screen`, `POST /agents/{agent}/prompt`, `POST /agents/{agent}/keys`,
  `POST /agents/{agent}/seen`, and two SSE streams: `GET /events` (overview snapshots) and
  `GET /agents/{agent}/events` (agent snapshot and new transcript entries). Errors are Problem
  Details (`404` unknown agent, `422` invalid input, `503` Herdr unreachable).
- **Identity.** An `HttpRouter` middleware in front of every route answers `403` Problem Details
  unless `Tailscale-User-Login` matches `COMMS_ALLOWED_LOGIN` (spec requirement 21). The matching
  rule is a pure function with its own tests.
- **Web app.** The server serves the built web app (`COMMS_WEB_DIST`, SPA fallback to
  `index.html`) behind the same middleware, so production is one process on one port. In
  development (`pnpm dev`) Vite listens on `127.0.0.1:4200` and proxies `/api` to the server,
  adding the allowed login header the way `tailscale serve` does; neither listens on the network.
- **Live data in the web app.** One `EventSource` per stream; each message decodes with the
  contract's schema and is written into the TanStack Query cache with `setQueryData`. The screen is
  polled with `refetchInterval: 1000` while shown.

## 2. Contract changes

New: `CommsApi` at `/api/v1`, committed at `apps/comms-server/api/openapi.json`. No existing
contract changes.

## 3. Migrations

None. The service has no database.

## 4. Test strategy

- **Unit (domain):** overview grouping, Needs you, seen, ordering; activity label; key and prompt
  validation; login matching.
- **Use cases:** with fakes of every outbound port, including "never focuses" (the fake records
  every Herdr call).
- **Adapters:** the Herdr adapter against a fake Unix socket server speaking the protocol (request
  shapes, error replies, subscription rebuild on a pane change, re-list fallback, no `*.focus`
  method ever sent); the transcript adapters against anonymised Claude and Pi fixtures and a temp
  directory (path resolution, parsing, following appended lines).
- **API / acceptance:** every endpoint through `HttpApiTest` with the in-memory ports; `403` for a
  missing or foreign login; SSE delivers an overview change.
- **Web:** route tests with a fake client (`renderApp`): overview groups and Needs you, the chat
  entries, the Chat | Screen toggle, the approval panel replacing the composer, long-press Ctrl-C,
  live updates through a fake event source.
- **Kit:** each new component with roles, names, keyboard use and `axeViolations`.
- **Boundaries:** dependency-cruiser and the Nx tags (`scope:comms`); `pnpm ports:check`.
- **Smoke:** the built app against the real Herdr socket with `agent-browser` at 390 px.

## 5. Risks

- Herdr's API is young (protocol 17) and may change; the adapter decodes only the fields it uses
  and ignores the rest.
- Claude's and Pi's session formats are undocumented; unknown entry types are skipped, never fatal.
- Large Claude session files (several MB): the reader parses once and then follows appended bytes
  only.

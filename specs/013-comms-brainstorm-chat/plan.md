# Plan 013 — pocket-comms: a floating brainstorm chat

- **Spec:** [spec.md](./spec.md)
- **Status:** `Approved` — approved by the owner (2026-11-02)
- **ADR:** [0012 — an agent runtime port with a Pi adapter](../../docs/architecture/adr/0012-an-agent-runtime-port-with-a-pi-adapter.md)
  (`Accepted` with this plan)

## 1. Affected projects

| Path                            | Change                                                                                                                                                                                          | Nx tags                               |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `packages/comms/domain`         | `brainstorm.ts`: entries, proposals and their rules (one decision, title rules), the project doc names                                                                                          | `scope:comms`, `layer:domain`         |
| `packages/comms/application`    | `AgentRuntimeOutbound`, `BrainstormStoreOutbound`, `GiteaOutbound.createIssue`, `ProjectsOutbound.readDoc`; the brainstorm tools and turn runner; `BrainstormInbound` with its use cases; fakes | `scope:comms`, `layer:application`    |
| `packages/comms/infrastructure` | `agent/`: the Pi runtime, its config and Pi's auth file (from pocket-learning); `brainstorm/`: the JSON file store; Gitea `POST …/issues`; git `readDoc`                                        | `scope:comms`, `layer:infrastructure` |
| `packages/comms/contract`       | The `brainstorm` group: state, events, messages, decisions, new chat                                                                                                                            | `scope:contracts`                     |
| `packages/comms/api`            | Handlers and the problems `brainstorm-not-set-up`, `brainstorm-busy`, `proposal-not-found`, `proposal-decided`, `issue-not-created`                                                             | `scope:comms`, `layer:api`            |
| `apps/comms-server`             | Settings, the runtime layer (or "not set up"), the state folder, the OpenAPI document, `.env.example`                                                                                           | `scope:comms`, `type:app`             |
| `packages/design/ui`            | A `FloatingButton`, the `brainstorm` icon, a `ProposalCard`                                                                                                                                     | `scope:design`, `type:ui`             |
| `apps/comms-web`                | The bubble in the root route, the `Brainstorm` sheet, its client calls and live stream                                                                                                          | `scope:comms`, `type:web`             |
| `.dependency-cruiser.cjs`       | Only `infrastructure` imports `@earendil-works/*`                                                                                                                                               | —                                     |
| `pnpm-workspace.yaml`           | Catalog: `@earendil-works/pi-agent-core` and `pi-ai` 1.4.0, `typebox`, `proper-lockfile`                                                                                                        | —                                     |

### Shapes

- **Domain.** `BrainstormEntry` = `user { id, at, text }` | `assistant { id, at, text }` |
  `proposal { id, at, project, title, body, state }` | `failed { id, at, reason }` (a turn's
  failure), with `state` = `open` | `created { number, url }` | `discarded`. `decide(entry, decision)` refuses a
  decided proposal; `parseIssueDraft({ project, title, body })` trims, refuses a blank title or one
  over 255 characters and a body over 20 000. `PROJECT_DOCS = ['README.md', 'AGENTS.md']`.
- **Runtime port** (ADR 0012). `runTurn({ state: Option<RuntimeState>, instructions, input,
tools }) → Stream<RuntimeEvent, AgentRuntimeError>` with `textDelta`, `message`, `toolCall`,
  `toolResult` and `ended { state }`. A `BrainstormTool` is `{ name, description, parameters:
Schema, run: (input) => Effect<{ output: Json, isError, pause }> }`.
- **Tools.** `list_projects` (name, `onGitea`), `list_open_issues(project)` (number, title),
  `read_project_doc(project, file ∈ PROJECT_DOCS)` (cut to 20 000 characters),
  `propose_issue(project, title, body)` (adds an open proposal entry, pauses). A project is only a
  name from `ProjectsOutbound.list`; `readDoc` reads `join(project.path, file)` and refuses a
  symlink.
- **Store port.** `BrainstormStoreOutbound { load: Effect<Option<StoredChat>>, save(chat) }`;
  `StoredChat = { entries, runtime: Option<RuntimeState> }`. The adapter writes
  `<state>/brainstorm.json` through a temporary file and a rename. `COMMS_STATE_DIR`, default
  `~/.pocket-comms`.
- **Use cases** on `BrainstormInbound` (one service, held by the server for its lifetime):
  - `state` → `NotSetUp { reason }` | `Ready { entries, answering }`.
  - `send(text)`: refuses while a turn runs (`BrainstormBusyError`); stores the user entry; forks
    the turn in the server's scope. Each event is published to a `PubSub`; the chat is saved after
    each complete message and at the end. A failed turn adds a `failed` entry.
  - `decide(id, { create: { project, title, body } } | { discard })`: checks the proposal and the
    draft; `create` resolves the project's Gitea repository like spec 006 and calls
    `GiteaOutbound.createIssue`, then marks the card and starts a turn whose input tells Pi the
    outcome. A busy turn refuses a decision too.
  - `reset`: interrupts a running turn, empties the chat and saves it.
  - `events`: the state at once, then `entries` and `delta` events.
- **Settings.** `COMMS_BRAINSTORM_PROVIDER`, `COMMS_BRAINSTORM_MODEL`,
  `COMMS_BRAINSTORM_API_KEY` (redacted, optional), `COMMS_PI_AUTH_FILE`, `PI_CODING_AGENT_DIR`,
  `COMMS_BRAINSTORM_THINKING` (default `off`). A missing or unknown model or missing credentials
  give a runtime layer whose `state` is `NotSetUp` with the setting's name; the server starts.
- **Gitea.** `createIssue(repository, { title, body })` sends `POST /api/v1/repos/{owner}/{repo}/
issues` with exactly `{ title, body }`, the token in the header, no redirect; answers `{ number,
url }` from `number` and `html_url`.
- **API** (group `brainstorm`, under `/api/v1/brainstorm`): `GET /` state; `GET /events` SSE;
  `POST /messages { text }` 202; `POST /proposals/:proposal/decision` 204; `POST /reset` 204. 409
  `brainstorm-not-set-up`, `brainstorm-busy`, `proposal-decided`; 404 `proposal-not-found`; 400 the
  validation problem; 409 `no-gitea-remote`, `gitea-not-configured`; 502 `issue-not-created`; 503
  `gitea-unavailable`.
- **Web.** `__root.tsx` renders the outlet plus `<Brainstorm />`: a `FloatingButton` (bottom right,
  raised by a CSS variable that screens with a composer or action bar set) and a full-height
  `Sheet` with a `TopBar` (title, New chat, close), the entries (`UserMessage`, `Markdown`,
  `ProposalCard`), the live delta and a `Composer` disabled while answering. Server data through
  TanStack Query; the SSE stream like `live.ts`.

## 2. Contract changes

Additive within `/api/v1`: a new `brainstorm` group with five endpoints. Nothing existing changes.

## 3. Migrations

None. The service has no database; the chat is one JSON file in the state folder.

## 4. Test strategy

- **Domain:** proposal decisions, draft rules, entry codec.
- **Application:** with a scripted fake runtime, in-memory store, fake Gitea and projects: send
  streams and saves; busy refusal; a failing turn keeps entries and adds `failed`; the tools read
  only listed projects and the two doc names; `propose_issue` pauses and adds a card; create,
  discard, decided, unknown, no Gitea remote, Gitea refusal; reset interrupts; not set up.
- **Infrastructure:** the Pi adapter with pi-ai's faux provider (text, a tool call that pauses, a
  failure, a state round-trip); the auth file (copied tests); the file store round-trip and the
  missing file; Gitea `createIssue` against the fake server checks method, path and exact body;
  `readDoc` with a temporary repository, a symlink refused.
- **API:** `comms-api.spec.ts` for the new routes and problems; the contract spec lists the paths.
- **Design:** the icon, `FloatingButton` and `ProposalCard` specs and stories.
- **Web:** `brainstorm.spec.tsx`: the bubble on every route, open and close, send, streaming,
  busy, a proposal edited and created, discard, a Gitea refusal shown, not set up, New chat.
- **Boundaries:** the dependency-cruiser rule for `@earendil-works/*`; the layer tags as before.

## 5. Risks

- **A model with tools.** It reads only through the four tools; none takes a path, none writes.
  The only write is the owner's Create issue.
- **New dependencies.** Pi's packages are pinned to the version pocket-learning runs. If the
  registry is unreachable, implementation stops and asks.
- **State on disk.** A corrupt `brainstorm.json` starts an empty chat and keeps the bad file as
  `brainstorm.json.bad`, so nothing is silently lost.
- **The bubble on small screens.** Each screen with a bottom bar sets the offset; the web spec
  checks it on the conversation.

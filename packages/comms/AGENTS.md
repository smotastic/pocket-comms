# comms service

The backend of pocket-comms: it reads Herdr's agents and the agents' session files and serves
them over `CommsApi`, it starts new tasks in Herdr worktrees and closes them, it reads,
closes and marks in progress the projects' Gitea issues, and it runs the brainstorm chat with Pi. Its behaviour is [spec 004](../../specs/004-pocket-comms-v1/spec.md),
[spec 005](../../specs/005-comms-new-task/spec.md),
[spec 006](../../specs/006-comms-gitea-issues/spec.md),
[spec 007](../../specs/007-comms-sessions-by-project/spec.md),
[spec 010](../../specs/010-comms-close-issues/spec.md),
[spec 011](../../specs/011-comms-close-agent/spec.md),
[spec 013](../../specs/013-comms-brainstorm-chat/spec.md) and
[spec 015](../../specs/015-comms-issues-in-progress/spec.md).
It has no database. Seen completions and last status changes live in server memory; the brainstorm
chat is one JSON file in the state folder.

## Where each file type goes

| What                                                                | Where                                                       |
| ------------------------------------------------------------------- | ----------------------------------------------------------- |
| `CommsApi`, wire schemas (shared by server and web)                 | `contract`                                                  |
| Agents, the overview rules, input rules, transcript entries, access | `domain`                                                    |
| New task rules (projects order, branch, task, agent name)           | `domain` (`src/task.ts`)                                    |
| Issue rules (remote, order, branch, task text, work per issue)      | `domain` (`src/issue.ts`)                                   |
| Brainstorm entries, proposals, issue drafts, project docs           | `domain` (`src/brainstorm.ts`)                              |
| Pi's tools and instructions, the brainstorm turns                   | `application` (`src/tools`, `src/use-cases/brainstorm*`)    |
| Pi's runtime and login, the chat file                               | `infrastructure` (`src/agent`, `src/brainstorm`)            |
| `AgentsInbound`, `TasksInbound`, `IssuesInbound`, ports, use cases  | `application` (`src/ports`, `src/use-cases`, `src/testing`) |
| Herdr socket, git, Gitea over HTTP, session files, memory           | `infrastructure`                                            |
| HTTP handlers, problems, identity guard, health, web app route      | `api`                                                       |
| Composition root, config, OpenAPI document                          | `apps/comms-server`                                         |
| Web app                                                             | `apps/comms-web`                                            |

## Rules of this service

- `HerdrOutbound` has no focus method on purpose: the app never moves the owner's Herdr focus
  (requirement 18). Do not add one. `worktree.create` always sends `focus: false`.
- `git` and Herdr run with argument arrays, never through a shell. A project is only ever a folder
  the projects port lists; never accept a path from a request.
- A new agent gets its first prompt only while it is idle and ready: the app never answers an
  agent's dialog for the owner (spec 005, requirement 13). Never send `trust_repository`.
- `GiteaOutbound` reads, and writes only `closeIssue` (spec 010), `createIssue` (spec 013) and
  `markInProgress` (spec 015): the HTTP adapter sends `GET`, a `PATCH` with exactly
  `{"state":"closed"}`, a `POST` with exactly `{"title","body"}`, a `POST` that creates the
  `status/in-progress` label and a `POST` that adds it to an issue; never a `PUT` (it would replace
  an issue's labels) or a `DELETE`, and it follows no redirect. The token (`COMMS_GITEA_TOKEN`) stays in the `Authorization`
  header; never log it, put it in an error or send it to the browser. Tests use the anonymised
  fixtures in `infrastructure/src/testing/fixtures` and a local fake server, never a real token.
- Closing an agent removes only a workspace that both Herdr and git know as a linked worktree of
  a project, through `worktree.remove`; never the primary checkout, never a path from a request.
  Without `force`, the server asks git for changes first and removes nothing when there are any.
  `force` comes only from the owner's explicit Discard changes and close.
- Implementing an issue goes through the spec 005 `create` use case; do not copy its rules. It
  marks the issue in progress only after the task exists, and a failed mark never fails the start.
  Whether an issue is in progress is `isInProgress` in the domain; the web app only groups by it.
- Pi runs through `AgentRuntimeOutbound` (ADR 0012); only `infrastructure` imports
  `@earendil-works/*`, never `pi-coding-agent`. Pi's tools only read (projects, open issues,
  `README.md` and `AGENTS.md`), none takes a path, and `propose_issue` ends the turn. Only the
  owner's decision on a proposal creates an issue. Do not give Pi a tool that writes.
- The brainstorm chat is optional: without its model settings the server starts and the chat says
  it is not set up. No test in CI calls a model; the Pi adapter is tested with pi-ai's faux
  provider.
- Every route goes through the Tailscale identity guard (`api/src/identity.ts`), and the server
  listens on `127.0.0.1` only. Do not add a route outside `commsServerLayer`.
- Session file formats are undocumented. Parsers skip what they do not know; tests use the
  anonymised fixtures in `infrastructure/src/testing/fixtures`. Never commit a real transcript.
- After a contract change run `pnpm nx run comms-server:openapi` and commit the document.

## Run and test

`pnpm dev` and `pnpm start` from the repository root; see the [README](../../README.md).
`pnpm nx run-many -t test -p 'comms-*'` runs the service's tests. Herdr adapter tests start a fake
Unix socket server; no test needs a running Herdr.

# comms service

The backend of pocket-comms: it reads Herdr's agents and the agents' session files and serves
them over `CommsApi`, it starts new tasks in Herdr worktrees and closes them, it reads,
closes and marks in progress the projects' Gitea issues, it runs the brainstorm chat with Pi, which proposes new issues and edits of existing ones, it keeps the images
the owner attaches to a prompt or a brainstorm message and attaches the chosen ones to approved issues in Gitea, it pushes a notification to the owner's devices when an agent
needs them, and it follows the background work and the subagents of Claude agents. Its behaviour is [spec 004](../../specs/004-pocket-comms-v1/spec.md),
[spec 005](../../specs/005-comms-new-task/spec.md),
[spec 006](../../specs/006-comms-gitea-issues/spec.md),
[spec 007](../../specs/007-comms-sessions-by-project/spec.md),
[spec 010](../../specs/010-comms-close-issues/spec.md),
[spec 011](../../specs/011-comms-close-agent/spec.md),
[spec 013](../../specs/013-comms-brainstorm-chat/spec.md),
[spec 014](../../specs/014-comms-images-in-chat/spec.md),
[spec 015](../../specs/015-comms-issues-in-progress/spec.md),
[spec 017](../../specs/017-comms-activity-timeline/spec.md),
[spec 018](../../specs/018-comms-push-notifications/spec.md),
[spec 019](../../specs/019-comms-background-activity/spec.md),
[spec 020](../../specs/020-comms-push-after-background-work/spec.md),
[spec 022](../../specs/022-comms-brainstorm-edits-issues/spec.md),
[spec 023](../../specs/023-comms-brainstorm-pictures/spec.md),
[spec 024](../../specs/024-comms-typed-answers/spec.md) and
[spec 025](../../specs/025-comms-quick-replies/spec.md).
It has no database. Seen completions, last status changes and the background work read from each
session file live in server memory; the brainstorm chat and the activity timeline are JSON files in
the state folder, attached images are files in its `images` folder, the push devices and the
VAPID key pair are two JSON files in its `push` folder, and the owner's quick replies are
`quick-replies.json` in the state folder.

## Where each file type goes

| What                                                                              | Where                                                       |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `CommsApi`, wire schemas (shared by server and web)                               | `contract`                                                  |
| Agents, the overview rules, input rules, transcript entries, access               | `domain`                                                    |
| New task rules (projects order, branch, task, agent name)                         | `domain` (`src/task.ts`)                                    |
| Issue rules (remote, order, branch, task text, work per issue)                    | `domain` (`src/issue.ts`)                                   |
| Brainstorm entries, proposals, issue drafts and edits, issue reads, chat pictures | `domain` (`src/brainstorm.ts`)                              |
| Image rules (kinds, ids, limits, paths in a prompt)                               | `domain` (`src/image.ts`)                                   |
| Suggested replies, the quick replies' rules and default list                      | `domain` (`src/replies.ts`)                                 |
| The quick replies file                                                            | `infrastructure` (`src/quick-replies`)                      |
| The image store                                                                   | `infrastructure` (`src/images`)                             |
| Activity rules (snapshot diff, what is kept, prompt excerpts)                     | `domain` (`src/activity.ts`)                                |
| The activity recorder and timeline                                                | `application` (`src/use-cases/activity*`)                   |
| The activity file                                                                 | `infrastructure` (`src/activity`)                           |
| When an agent notifies, the notification's text                                   | `domain` (`src/notification.ts`)                            |
| The push watcher, subscribe and unsubscribe                                       | `application` (`src/use-cases/notify*`, `push*`)            |
| The push devices and keys, the Web Push sender                                    | `infrastructure` (`src/push`)                               |
| Pi's tools and instructions, the brainstorm turns                                 | `application` (`src/tools`, `src/use-cases/brainstorm*`)    |
| Pi's runtime and login, the chat file                                             | `infrastructure` (`src/agent`, `src/brainstorm`)            |
| `AgentsInbound`, `TasksInbound`, `IssuesInbound`, ports, use cases                | `application` (`src/ports`, `src/use-cases`, `src/testing`) |
| Herdr socket, git, Gitea over HTTP, session files, memory                         | `infrastructure`                                            |
| HTTP handlers, problems, identity guard, health, web app route                    | `api`                                                       |
| Composition root, config, OpenAPI document                                        | `apps/comms-server`                                         |
| Web app                                                                           | `apps/comms-web`                                            |

## Rules of this service

- `HerdrOutbound` has no focus method on purpose: the app never moves the owner's Herdr focus
  (requirement 18). Do not add one. `worktree.create` always sends `focus: false`.
- `git` and Herdr run with argument arrays, never through a shell. A project is only ever a folder
  the projects port lists; never accept a path from a request.
- Typed text (spec 024) goes through `HerdrOutbound.typeText` (`pane.send_text`), which never
  presses Enter: the owner submits a waiting dialog with the `enter` key. Do not add Enter to it,
  and do not route it through `prompt`, which submits.
- Suggested replies (spec 025) come from fixed rules in `suggestedReplies`, never from a model,
  and travel on the assistant entries. The web app offers them only in the Chat view of an idle
  or done agent and sends one only as a prompt: a suggestion never presses a key, never types
  into a waiting dialog and never answers a blocked agent. A broken `quick-replies.json` is
  reported and a read never replaces it; only the owner's next save writes over it.
- A new agent gets its first prompt only while it is idle and ready: the app never answers an
  agent's dialog for the owner (spec 005, requirement 13). Never send `trust_repository`.
- `GiteaOutbound` reads, and writes only `closeIssue` (spec 010), `createIssue` (spec 013),
  `markInProgress` (spec 015), `updateIssue` (spec 022) and `attachImage` (spec 023): the HTTP
  adapter sends `GET`, a `PATCH` with exactly `{"state":"closed"}`, a `PATCH` with exactly
  `{"title","body"}`, a `POST` with exactly `{"title","body"}`, a `POST` that creates the
  `status/in-progress` label, a `POST` that adds it to an issue and a multipart `POST` of one
  picture to an issue's `assets`; never a `PUT` (it would replace an issue's labels) or a
  `DELETE`, and it follows no redirect. The token (`COMMS_GITEA_TOKEN`) stays in the `Authorization`
  header; never log it, put it in an error or send it to the browser. Tests use the anonymised
  fixtures in `infrastructure/src/testing/fixtures` and a local fake server, never a real token.
- Closing an agent removes only a workspace that both Herdr and git know as a linked worktree of
  a project, through `worktree.remove`; never the primary checkout, never a path from a request.
  Without `force`, the server asks git for changes first and removes nothing when there are any.
  `force` comes only from the owner's explicit Discard changes and close.
- Implementing an issue goes through the spec 005 `create` use case; do not copy its rules. It
  marks the issue in progress only after the task exists, and a failed mark never fails the start.
  Whether an issue is in progress is `isInProgress` in the domain; the web app only groups by it.
- The owner's additional information for an issue start (spec 021) lives only in that agent's
  first prompt, through `issueTask`: never write it to Gitea and never store it.
- Pi runs through `AgentRuntimeOutbound` (ADR 0012); only `infrastructure` imports
  `@earendil-works/*`, never `pi-coding-agent`. Pi's tools only read (projects, open issues, one
  issue, `README.md` and `AGENTS.md`), none takes a path, and `propose_issue` and
  `propose_issue_edit` end the turn. Only the owner's decision on a proposal creates or changes an
  issue. Do not give Pi a tool that writes.
- An edit applies only while the issue's title and body equal the ones Pi read (`baseChanged`);
  the server re-reads the issue right before the `PATCH`, and before uploading any picture.
- Brainstorm pictures (spec 023) are images of the image store, numbered across the chat
  (`chatPictures`). Pi names them by number; only the owner's choice on the card goes to Gitea,
  and only on approval. Each upload is saved on the proposal (`attached`) before the next, so a
  retry never uploads one twice and never creates a second issue; the `## Pictures` block is
  appended to the body last. Pi gets the bytes only when the runtime `seesImages`. Pi may propose an edit only for an
  issue it read in this chat, and never for one whose body was cut.
- The brainstorm chat is optional: without its model settings the server starts and the chat says
  it is not set up. No test in CI calls a model; the Pi adapter is tested with pi-ai's faux
  provider.
- Every route goes through the Tailscale identity guard (`api/src/identity.ts`), and the server
  listens on `127.0.0.1` only. Do not add a route outside `commsServerLayer`.
- Session file formats are undocumented. Parsers skip what they do not know; tests use the
  anonymised fixtures in `infrastructure/src/testing/fixtures`. Never commit a real transcript.
- Background work comes from Claude's session file only (`transcript/claude-background.ts`); Herdr's
  status stays as Herdr reports it, and the background work only keeps a done agent out of Needs
  you and holds its done push (spec 020). The overview and the push count it with the same
  `makeBackgroundOf`. A subagent id from a request must match `^[a-z0-9]{1,64}$` before it names a file, and
  only files below the session's own `subagents` folder are read.
- Images go to an agent as absolute paths in the prompt (Herdr takes text only). The image store
  names every file itself (`<id>.<ext>`), opens only names of that shape that are plain files, and
  an image id from a request is only ever looked up, never joined into a path. The server checks
  an upload by its content (JPEG or PNG), never by its name or declared type.
- The activity recorder runs in `ActivityInbound`'s layer scope from server start and records only
  what the server observes: Herdr snapshots and the prompts, keys and typed text Herdr took from
  the app. The
  timeline keeps a prompt's first line, at most 80 characters, never the whole prompt.
- Only `infrastructure/src/push` imports `web-push`. The VAPID private key stays between the push
  store and the sender (`Push.layer` puts out the three ports only); never log it, put it in an
  error or send it to the browser. A device's endpoint is its address: keep it out of logs too.
  A broken `push/` file is reported, never replaced, because new keys end every subscription.
- A push carries only the agent's name, its project and at most 120 characters of its question
  or last message. Every push must show a notification on the device (the service worker in
  `apps/comms-web/public/sw.js` never skips one), or the browser drops the subscription.
- After a contract change run `pnpm nx run comms-server:openapi` and commit the document.

## Run and test

`pnpm dev` and `pnpm start` from the repository root; see the [README](../../README.md).
`pnpm nx run-many -t test -p 'comms-*'` runs the service's tests. Herdr adapter tests start a fake
Unix socket server; no test needs a running Herdr.

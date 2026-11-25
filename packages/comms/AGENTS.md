# comms service

The backend of pocket-comms: it reads Herdr's agents and the agents' session files and serves
them over `CommsApi`, it starts new tasks in Herdr worktrees and closes them, it reads,
closes and marks in progress the projects' Gitea issues, it runs the brainstorm with Pi, which proposes new issues and edits of existing ones, it keeps the images
the owner attaches to a prompt or a brainstorm message and attaches the chosen ones to approved issues in Gitea, it pushes a notification to the owner's devices when an agent
needs them, it follows the background work and the subagents of Claude agents, and it keeps the
pull requests agents attach to their conversation and reads their changes from Gitea. Its behaviour is [spec 004](../../specs/004-pocket-comms-v1/spec.md),
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
[spec 024](../../specs/024-comms-typed-answers/spec.md),
[spec 025](../../specs/025-comms-quick-replies/spec.md),
[spec 026](../../specs/026-comms-brainstorm-chat-stream/spec.md),
[spec 027](../../specs/027-comms-brainstorm-voice/spec.md),
[spec 030](../../specs/030-comms-answer-questions-in-chat/spec.md),
[spec 031](../../specs/031-comms-attached-pull-requests/spec.md) and
[spec 032](../../specs/032-comms-recover-task-starts/spec.md).
It has no database. Seen completions, last status changes and the background work read from each
session file live in server memory; the brainstorm and the activity timeline are JSON files in
the state folder, attached images are files in its `images` folder, the push devices and the
VAPID key pair are two JSON files in its `push` folder, the owner's quick replies are
`quick-replies.json` in the state folder, and the agents' attached pull requests are
`pull-requests.json` there, by the session id of each agent's conversation, and the task starts
whose first prompt is not yet delivered are `task-starts.json` there, by worktree folder.

## Where each file type goes

| What                                                                           | Where                                                       |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| `CommsApi`, wire schemas (shared by server and web)                            | `contract`                                                  |
| Agents, the overview rules, prompt and key rules, conversation entries, access | `domain`                                                    |
| New task rules (projects order, branch, task, agent name)                      | `domain` (`src/task.ts`)                                    |
| Issue rules (remote, order, branch, task text, work per issue)                 | `domain` (`src/issue.ts`)                                   |
| Brainstorm entries, issue and edit proposals, issue reads, brainstorm images   | `domain` (`src/brainstorm.ts`)                              |
| Image rules (kinds, ids, limits, paths in a prompt)                            | `domain` (`src/image.ts`)                                   |
| Voice message rules, the speech-to-text service                                | `@smotastic/pocket-agent` (`./speech`), wired by the server |
| Suggested replies, the quick replies' rules and default list                   | `domain` (`src/replies.ts`)                                 |
| The quick replies file                                                         | `infrastructure` (`src/quick-replies`)                      |
| Pull request rules (pages, the list, the unified diff and its limits)          | `domain` (`src/pull-request.ts`)                            |
| The attached pull requests file                                                | `infrastructure` (`src/pull-requests`)                      |
| Task start rules (delivery, the start of an agent, an issue's recovery)        | `domain` (`src/task-start.ts`)                              |
| Starting an agent and its first prompt, kept as a task start                   | `application` (`src/use-cases/agent-launch.ts`)             |
| The task starts file                                                           | `infrastructure` (`src/task-starts`)                        |
| The agent skill that attaches a pull request                                   | `apps/comms-server/skills/comms-attach-pull-request`        |
| The image store                                                                | `infrastructure` (`src/images`)                             |
| Activity rules (snapshot diff, what is kept, prompt excerpts)                  | `domain` (`src/activity.ts`)                                |
| The activity recorder and timeline                                             | `application` (`src/use-cases/activity*`)                   |
| The activity file                                                              | `infrastructure` (`src/activity`)                           |
| When an agent notifies, the notification's text                                | `domain` (`src/notification.ts`)                            |
| The push watcher, subscribe and unsubscribe                                    | `application` (`src/use-cases/notify*`, `push*`)            |
| The push devices and keys, the Web Push sender                                 | `infrastructure` (`src/push`)                               |
| Pi's tools and instructions, the brainstorm turns                              | `application` (`src/tools`, `src/use-cases/brainstorm*`)    |
| Pi's runtime and login                                                         | `@smotastic/pocket-agent` (ADR 0014), wired by the server   |
| The brainstorm file                                                            | `infrastructure` (`src/brainstorm`)                         |
| `AgentsInbound`, `TasksInbound`, `IssuesInbound`, ports, use cases             | `application` (`src/ports`, `src/use-cases`, `src/testing`) |
| Herdr socket, git, Gitea over HTTP, session files, memory                      | `infrastructure`                                            |
| HTTP handlers, problems, identity guard, health, web app route                 | `api`                                                       |
| Composition root, config, OpenAPI document                                     | `apps/comms-server`                                         |
| Web app                                                                        | `apps/comms-web`                                            |
| Pocket buddy, a voice client of the contract (speech, brainstorm)              | `apps/buddy`                                                |

## Rules of this service

- `MultiplexerOutbound` has no focus method on purpose: the app never moves the owner's Herdr focus
  (requirement 18). Do not add one. `worktree.open` always sends `focus: false`.
- The multiplexer is Herdr or hc (`COMMS_MULTIPLEXER`, ADR 0015, spec 033). The hc adapter
  (`infrastructure/src/hc`) takes an agent's status only from its OSC 7501 record (`statusOf`), never
  from the screen; an agent is a terminal labelled `comms.agent` or one whose record is from
  `claude-code` or `pi`. It starts the agent program from an argument array with `keep`, never as a
  shell line, sends a prompt with `terminal.send` and never `force`, and types text and keys as raw
  bytes through `terminal.attach` at the terminal's own size, never `terminal.keys`. An hc agent's
  session is its terminal's `comms.session` label, set by the Claude hook on `SessionStart` and by
  the Pi extension: set it up once per machine, from the deployed release,
  `ln -s ~/pocket-cloud-data/pocket-comms/current/apps/comms-server/dist/pi-extension.js ~/.pi/agent/extensions/comms-session.js`.
- `git`, Herdr and hc run with argument arrays, never through a shell. A project is only ever a folder
  the projects port lists; never accept a path from a request.
- Typed text (spec 024) goes through `MultiplexerOutbound.typeText` (`pane.send_text`), which never
  presses Enter: the owner submits a waiting agent question with the `enter` key. Do not add Enter to it,
  and do not route it through `prompt`, which submits.
- Answering an agent question from the conversation (spec 030) presses the keys of Claude's `AskUserQuestion`
  dialog, worked out in `answerKeys` from its behaviour as of Claude Code v2.1.323: a single
  choice's digit chooses and moves on, a multiple choice's digit toggles and `right` moves on, and
  `1` submits the review, which a lone single choice skips; a single choice whose options show
  previews moves by its digit and chooses with `enter`. `Input.answer` presses nothing unless
  the call is the latest entry of a Claude agent, has no result, and `showsQuestion` finds the
  fresh dialog on the screen; Herdr's status does not count, as it reports such an agent as done.
  When Claude Code changes its dialog, probe it live and change `answerKeys` and its tests
  together; never widen the keys API for it. The dialog ignores keys that reach it together as
  one input, so `sendKeys` sends each key in a request of its own, a pause (`keyGap`) apart.
- Claude Code writes a waiting `AskUserQuestion` call to its session file only once it is
  answered, so the waiting call comes from the server's Claude hook
  (`apps/comms-server/src/claude-hook.ts`, its work in `claude-questions.ts`), which keeps it in
  `<state>/questions/<session>.json` until `PostToolUse`, `Stop`, `UserPromptSubmit` or
  `SessionStart`. The conversation reader adds it as the latest entry while the
  session file does not hold its id. The hook must never get in Claude's way: Node built-ins
  only, no output, exit `0`. Set it up once per machine in `~/.claude/settings.json`, for
  `PreToolUse` and `PostToolUse` with the matcher `AskUserQuestion` and for `Stop`,
  `UserPromptSubmit` and `SessionStart`, each with the
  command `node ~/pocket-cloud-data/pocket-comms/current/apps/comms-server/dist/claude-hook.js`
  (the deployed release; `COMMS_STATE_DIR` must match the server's when it is set).
- Suggested replies (spec 025) come from fixed rules in `suggestedReplies`, never from a model,
  and travel on the assistant entries. The web app offers them only in the Conversation view of an idle
  or done agent and sends one only as a prompt: a suggestion never presses a key, never types
  into a waiting agent question and never answers a blocked agent. A broken `quick-replies.json` is
  reported and a read never replaces it; only the owner's next save writes over it.
- A new agent gets its first prompt only while it is idle and ready: the app never answers an
  agent's dialog for the owner (spec 005, requirement 13). Never send `trust_repository`.
  Ready comes from `readAgent` (Herdr's `agent.get`), never from the snapshot: Herdr's
  `agent.start` may answer before the agent takes input, only `agent.get` finishes the start, and
  until then Herdr refuses a prompt as "not an active named agent". So the socket adapter's
  `prompt` reads the agent first.
- `GiteaOutbound` reads (also a pull request, its `.diff` and its changed files for spec 031), and writes only `closeIssue` (spec 010), `createIssue` (spec 013),
  `markInProgress` (spec 015), `updateIssue` (spec 022) and `attachImage` (spec 023): the HTTP
  adapter sends `GET`, a `PATCH` with exactly `{"state":"closed"}`, a `PATCH` with exactly
  `{"title","body"}`, a `POST` with exactly `{"title","body"}`, a `POST` that creates the
  `status/in-progress` label, a `POST` that adds it to an issue and a multipart `POST` of one
  image to an issue's `assets`; never a `PUT` (it would replace an issue's labels) or a
  `DELETE`, and it follows no redirect. The token (`COMMS_GITEA_TOKEN`) stays in the `Authorization`
  header; never log it, put it in an error or send it to the browser. Tests use the anonymised
  fixtures in `infrastructure/src/testing/fixtures` and a local fake server, never a real token.
- Attached pull requests (spec 031) come from agents through the guarded
  `POST /agents/:agent/pull-requests`, which the `comms-attach-pull-request` skill calls with
  `curl` on this machine's tailnet name: the home server is a user-owned tailnet node, so the
  request carries the owner's login. Never add a route outside the guard for it. Only pull
  requests on the app's Gitea are accepted (`pullRequestOf`); the list keeps the repository,
  number, URL and time, never a title or state, which are read from Gitea each time. The diff is
  read up to `MAX_DIFF_BYTES` and parsed in the domain (`parseUnifiedDiff`); the browser never
  gets Gitea's token. Set the skill up once per machine, from the deployed release:
  `ln -s ~/pocket-cloud-data/pocket-comms/current/apps/comms-server/skills/comms-attach-pull-request ~/.claude/skills/`
  and the same into `~/.pi/agent/skills/`.
- Closing an agent removes only a workspace that both Herdr and git know as a linked worktree of
  a project: git removes the checkout (`ProjectsOutbound.removeWorktree`), then the multiplexer
  closes the workspace (`closeWorkspace`), so a refusal by git leaves the agents running. Never
  the primary checkout, never a path from a request. Without `force`, the server asks git for
  changes first and removes nothing when there are any.
  `force` comes only from the owner's explicit Discard changes and close.
- Every agent the app starts goes through `makeAgentLaunch` (spec 005 and spec 032): it keeps the
  task start at each step and forgets it once Herdr accepts the prompt. Do not start an agent or
  send a first prompt around it. A prompt Herdr did not answer is `uncertain` and is sent again
  only on the owner's explicit Send anyway, never by the server; a refused one is `not-sent`. A
  start that was `pending` when the server stopped reads `uncertain` (`TaskStartsInbound.layer`).
  A failing `task-starts.json` is logged and never fails a start. The kept prompt holds the
  additional information of spec 021 until the start is forgotten (on delivery, Dismiss, closing
  the agent, or when git no longer lists the worktree); it never goes to Gitea.
- Start an agent here (spec 032) takes the worktree only from the project's git worktree list,
  matched by the issue's branch, never the primary checkout, and never a path from a request; it
  refuses a worktree with a live agent or a `pending` start, and never adds a worktree.
  It opens a new shell with `tab.create`, or `worktree.open` when Herdr has no workspace for it.
- Implementing an issue goes through the spec 005 `create` use case; do not copy its rules. It
  marks the issue in progress only after the task exists, and a failed mark never fails the start.
  Whether an issue is in progress is `isInProgress` in the domain; the web app only groups by it.
- The owner's additional information for an issue start (spec 021) lives only in that agent's
  first prompt, through `issueTask`: never write it to Gitea and never store it.
- Pi runs through the agent package's `AgentRuntime` and turn engine (ADRs 0012, 0014): the
  application imports `@smotastic/pocket-agent` and `./chat` only, the server `./pi`, tests
  `./testing`; the contract, the brainstorm file and the web app take the chat stream's `./chat`; no
  code here imports `@earendil-works/*`. A runtime change goes into pocket-factory's package and
  comes here as a catalog bump. Pi's tools only read (projects, open issues, one
  issue, `README.md` and `AGENTS.md`), none takes a path, and `propose_issue` and
  `propose_issue_edit` end the turn. Only the owner's decision on a proposal creates or changes an
  issue. Do not give Pi a tool that writes.
- An edit applies only while the issue's title and body equal the ones Pi read (`baseChanged`);
  the server re-reads the issue right before the `PATCH`, and before uploading any image.
- The brainstorm streams through the package's chat feed (spec 026): its entries are one
  numbered log behind `ChatLog`, saved with the brainstorm file, with one feed key whose numbers go on
  across a New brainstorm (`brainstormStarted`). A proposal that changes is recorded again; never rewrite an
  entry. A tool row carries only `describeBrainstormCall`'s target, never a tool's input or
  output. The brainstorm is answering before it records what starts a turn and idle before the turn's
  end is recorded, so the sheet reads the state again on those entries.
- Brainstorm images (spec 023) are images of the image store, numbered across the brainstorm
  (`brainstormImages`). Pi names them by number; only the owner's choice on the card goes to Gitea,
  and only on approval. Each upload is saved on the proposal (`attached`) before the next, so a
  retry never uploads one twice and never creates a second issue; the `## Images` block is
  appended to the body last. Pi gets the bytes only when the runtime `seesImages`. Pi may propose an edit only for an
  issue it read in this brainstorm, and never for one whose body was cut.
- The brainstorm is optional: without its model settings the server starts and the brainstorm says
  it is not set up. No test in CI calls a model; the use case runs on the package's scripted
  runtime.
- Every route goes through the Tailscale identity guard (`api/src/identity.ts`), and the server
  listens on `127.0.0.1` only. Do not add a route outside `commsServerLayer`.
- Session file formats are undocumented. Parsers skip what they do not know; tests use the
  anonymised fixtures in `infrastructure/src/testing/fixtures`. Never commit a real session file.
- Background work comes from Claude's session file only (`conversation/claude-background.ts`); Herdr's
  status stays as Herdr reports it, and the background work only keeps a done agent out of Needs
  you and holds its done push (spec 020). The overview and the push count it with the same
  `makeBackgroundOf`. A subagent id from a request must match `^[a-z0-9]{1,64}$` before it names a file, and
  only files below the session's own `subagents` folder are read.
- Images go to an agent as absolute paths in the prompt (Herdr takes text only). The image store
  names every file itself (`<id>.<ext>`), opens only names of that shape that are plain files, and
  an image id from a request is only ever looked up, never joined into a path. The server checks
  an upload by its content (JPEG or PNG), never by its name or declared type.
- Voice messages go to the speech-to-text service through the agent package's `Transcriber`, and
  only the server calls it (`COMMS_SPEECH_URL`, on the home server's loopback). A voice message stays in
  memory: never write it to disk or log it. The server checks a voice message by its content, never by its name or
  declared type, sends no language, and a reason never names the service's address. Without both
  settings the server starts and the brainstorm state says `voice: false`.
- The activity recorder runs in `ActivityInbound`'s layer scope from server start and records only
  what the server observes: Herdr snapshots and the prompts, keys and typed text Herdr took from
  the app. The
  timeline keeps a prompt's first line, at most 80 characters, never the whole prompt.
- Only `infrastructure/src/push` imports `web-push`. The VAPID private key stays between the push
  store and the sender (`Push.layer` puts out the three ports only); never log it, put it in an
  error or send it to the browser. A device's endpoint is its address: keep it out of logs too.
  A broken `push/` file is reported, never replaced, because new keys end every subscription.
- A notification carries only the agent's name, its project and at most 120 characters of its question
  or last message. Every Web Push message must show a notification on the device (the service worker in
  `apps/comms-web/public/sw.js` never skips one), or the browser drops the subscription.
- After a contract change run `pnpm nx run comms-server:openapi` and commit the document.

## Run and test

`pnpm dev` and `pnpm start` from the repository root; see the [README](../../README.md).
`pnpm nx run-many -t test -p 'comms-*'` runs the service's tests. Herdr and hc adapter tests start
a fake Unix socket server; no test needs a running Herdr or hc.

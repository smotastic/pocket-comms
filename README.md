# pocket-comms

A phone web app to **read and drive the Herdr coding agents** on the Mac mini, over Tailscale. It
lists every live agent, shows Claude and Pi sessions as a chat, shows any agent's terminal screen,
sends prompts and key presses, starts new tasks in fresh Herdr worktrees, and lists each project's
open Gitea issues with "Implement with Claude" and "Close" actions. Install it to the iPhone home screen,
and it pushes a notification when an agent needs you or is done. It complements the Moshi terminal
app, which keeps approvals and the raw terminal.

The behaviour is [spec 004](specs/004-pocket-comms-v1/spec.md), for new tasks
[spec 005](specs/005-comms-new-task/spec.md), for Gitea issues
[spec 006](specs/006-comms-gitea-issues/spec.md) and [spec 010](specs/010-comms-close-issues/spec.md) and for the overview by project
[spec 007](specs/007-comms-sessions-by-project/spec.md), and for push notifications
[spec 018](specs/018-comms-push-notifications/spec.md); the approved look is spec 004's
[mockup](specs/004-pocket-comms-v1/mockup.html).

## Run it

Requires Node.js 26+, pnpm 11+, a running [Herdr](https://github.com/ogulcancelik/herdr) and, to
reach it from the phone, Tailscale.

```bash
pnpm install
pnpm start        # builds the web app and serves app + API on http://127.0.0.1:4410
pnpm dev          # development: API on 127.0.0.1:4410, web app with hot reload on 127.0.0.1:4200
```

Both listen on `127.0.0.1` only. The server rejects every request without the allowed
`Tailscale-User-Login` header with `403`, so open the production server through `tailscale serve`
(below). The development web server adds that header itself, as `tailscale serve` would, so
`http://127.0.0.1:4200` works in a local browser.

| Variable                    | Default                      | Meaning                                                                                            |
| --------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------- |
| `COMMS_PORT`                | `4410`                       | The server's port on `127.0.0.1`                                                                   |
| `COMMS_ALLOWED_LOGIN`       | `smotastic@`                 | The Tailscale login that may use the app; a value ending in `@` allows that user with any provider |
| `HERDR_SOCKET_PATH`         | `~/.config/herdr/herdr.sock` | Herdr's API socket                                                                                 |
| `COMMS_WEB_DIST`            | set by `pnpm start`          | The built web app the server serves; without it the server serves only the API                     |
| `COMMS_PROJECTS_ROOT`       | `~/Development/projects`     | The folder whose git repositories (direct children) a new task can start in                        |
| `COMMS_AGENT_ARGS`          | empty                        | Extra arguments for every agent a new task starts, split on spaces; empty keeps the CLI defaults   |
| `COMMS_GITEA_URL`           | `http://localhost:3000`      | The Gitea server whose issues the app reads                                                        |
| `COMMS_GITEA_TOKEN`         | none                         | A Gitea token with `write:issue` and `read:repository`; without it the issue lists say so          |
| `COMMS_GITEA_HOSTS`         | `gitea`                      | Further host names (such as SSH aliases) of that Gitea in git remotes, comma-separated             |
| `COMMS_STATE_DIR`           | `~/.pocket-comms`            | `brainstorm.json`, `activity.json`, images (`images/`, 30 days), push devices (`push/`)            |
| `COMMS_BRAINSTORM_PROVIDER` | none                         | The brainstorm chat's model provider, such as `openai`; without it the chat says it is not set up  |
| `COMMS_BRAINSTORM_MODEL`    | none                         | The brainstorm chat's model, such as `gpt-6-luna`                                                  |
| `COMMS_BRAINSTORM_API_KEY`  | none                         | An API key for that provider; without it the server uses your Pi login                             |
| `COMMS_BRAINSTORM_THINKING` | `off`                        | `off`, `minimal`, `low`, `medium`, `high`, `xhigh` or `max`                                        |
| `COMMS_PI_AUTH_FILE`        | `~/.pi/agent/auth.json`      | Pi's credential file; `PI_CODING_AGENT_DIR` moves its folder as it does for Pi                     |
| `OTEL_EXPORTER_OTLP_*`      | off                          | Traces, metrics and logs over OTLP (ADR 0010)                                                      |

The Gitea token is a secret: put it in the server's environment only. Create it in Gitea under
**Settings → Applications → Manage Access Tokens** with the scopes `write:issue` and
`read:repository`. The app reads with `GET`; it writes only the `PATCH` that closes an issue, the
`POST` that creates one you approved in the brainstorm chat, and the `POST`s that mark an issue you
start with Implement with Claude as `status/in-progress` (creating that label in the repository the
first time). It never removes a label. A token with `read:issue` still lists the issues, but
closing, creating or marking one then fails; a failed mark leaves the started agent running.

The brainstorm chat (the bulb in the top bar, or More in a conversation) runs Pi inside the server. Sign
in with Pi once (`pi`, then `/login`) and set the provider and the model, for example
`COMMS_BRAINSTORM_PROVIDER=openai` and `COMMS_BRAINSTORM_MODEL=gpt-6-luna`. Pi only reads the
project list, a project's open issues and its `README.md` and `AGENTS.md`; an issue is created only
when you tap **Create issue** on its proposal.

Notifications are switched on per device at the bottom of the Projects sheet. On the iPhone that
works only in the app added to the home screen (iOS 16.4 or later); Safari alone offers no Web Push.
The server makes its push key pair itself in `COMMS_STATE_DIR/push/` and pushes when an agent has
been blocked, or done without you looking, for 10 seconds. Keep that folder: new keys would end
every device's subscription.

The API is documented at `/docs` (the OpenAPI document at `/docs/openapi.json`), behind the same
login check.

## Open it on the phone with `tailscale serve`

`tailscale serve` gives the server an HTTPS address on the tailnet and adds the caller's
`Tailscale-User-Login` header. With `pnpm start` running:

```bash
tailscale serve --bg 4410     # https://<machine>.<tailnet>.ts.net/ → http://127.0.0.1:4410
tailscale serve status        # shows the address
tailscale serve reset         # stops serving
```

On the iPhone, open the address in Safari, then **Share → Add to Home Screen**. The app opens full
screen and dark. The app never changes the machine's Tailscale or launchd configuration; to keep
the server running after a log-out, add a launch agent for `pnpm start` yourself.

## What it does

- **Overview (`/`):** Needs you first (blocked agents and done agents not yet seen), then every
  agent by repository, with its kind, status, terminal title and time since the last change. Live.
- **Conversation (`/agents/<name>`):** a Claude or Pi session as a chat, live; Chat | Screen
  switches to the pane's coloured screen. Other agent kinds show only the screen.
- **Input:** the composer sends a prompt (Enter sends, Shift+Enter is a new line). While the agent
  is blocked, an approval panel with its screen and the keys `1 2 3 ↑ ↓ Enter Esc` replaces the
  composer; Ctrl-C sends only after a long press.
- **New task (`+` on the overview):** pick a project, describe the task and check the branch (it is
  suggested from the task, `feat/…` or `fix/…`). The server fetches `origin`, creates a Herdr
  worktree from the default remote branch with the task's first line as its label, and, if asked,
  starts a Claude or Pi agent there and sends it the task. An agent that shows a dialog first gets
  nothing; answer it in its conversation, then send the task. Removing worktrees stays on the
  desktop.
- **Projects and issues (the issue icon on the overview):** each project's open Gitea issues (its
  `origin` names the repository), the most recently updated first, with labels, age, a link to
  Gitea and the agents working on each issue (worktrees on a `<type>/<number>-…` branch).
  **Implement with Claude** asks for the branch (suggested as `feat/<number>-<title>`), then starts
  a New task with a Claude agent and the issue, ending in a `Closes #<number>` line, as its first
  prompt. **Close** asks first, warns about agents still on the issue (it leaves them running),
  then closes the issue in Gitea. The app never deletes issues and writes nothing else to Gitea.
- **Activity (`/activity`, from the projects sheet):** what happened across the agents in the last
  24 hours, newest first: new and gone agents, agents that started working, need you or finished,
  and the prompts (their first line) and keys you sent from the app. The server records it while
  it runs, whether or not the app is open, and keeps the newest 100 events in `activity.json`. An
  event opens its agent's conversation, or its project when the agent is gone.
- Nothing in the app moves the Herdr focus on the desktop. The "seen" state lives in server memory.

## Structure

```text
packages/comms/        the service: domain, application, infrastructure (Herdr socket, session
                       files), contract (the HttpApi) and api (handlers, identity guard, web route)
apps/comms-server/     composition root and the committed OpenAPI document
apps/comms-web/        React + Vite web app (TanStack Router and Query)
packages/design/       design tokens and the UI kit every screen is built from
specs/                 feature specs; docs/ ADRs and conventions; tools/ template init
                       (the gates come from @smotastic/pocket-ci, ADR 0013)
```

## Working in it

The repository comes from the pocket-factory template: read [`AGENTS.md`](AGENTS.md) and the
[constitution](.specify/memory/constitution.md). `pnpm verify:local` runs the local gates (also the
pre-push hook); CI runs the full set. Work on a branch and follow the
[Git conventions](docs/engineering/git-and-pr-conventions.md).

## License

[MIT](LICENSE)

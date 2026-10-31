# pocket-comms

A phone web app to **read and drive the Herdr coding agents** on the Mac mini, over Tailscale. It
lists every live agent, shows Claude and Pi sessions as a chat, shows any agent's terminal screen,
sends prompts and key presses, and starts new tasks in fresh Herdr worktrees. Install it to the iPhone home screen. It complements the Moshi
terminal app, which keeps push notifications, approvals and the raw terminal.

The behaviour is [spec 004](specs/004-pocket-comms-v1/spec.md) and, for new tasks,
[spec 005](specs/005-comms-new-task/spec.md); the approved look is spec 004's
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

| Variable               | Default                      | Meaning                                                                                            |
| ---------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------- |
| `COMMS_PORT`           | `4410`                       | The server's port on `127.0.0.1`                                                                   |
| `COMMS_ALLOWED_LOGIN`  | `smotastic@`                 | The Tailscale login that may use the app; a value ending in `@` allows that user with any provider |
| `HERDR_SOCKET_PATH`    | `~/.config/herdr/herdr.sock` | Herdr's API socket                                                                                 |
| `COMMS_WEB_DIST`       | set by `pnpm start`          | The built web app the server serves; without it the server serves only the API                     |
| `COMMS_PROJECTS_ROOT`  | `~/Development/projects`     | The folder whose git repositories (direct children) a new task can start in                        |
| `COMMS_AGENT_ARGS`     | empty                        | Extra arguments for every agent a new task starts, split on spaces; empty keeps the CLI defaults   |
| `OTEL_EXPORTER_OTLP_*` | off                          | Traces, metrics and logs over OTLP (ADR 0010)                                                      |

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
- Nothing in the app moves the Herdr focus on the desktop. The "seen" state lives in server memory.

## Structure

```text
packages/comms/        the service: domain, application, infrastructure (Herdr socket, session
                       files), contract (the HttpApi) and api (handlers, identity guard, web route)
apps/comms-server/     composition root and the committed OpenAPI document
apps/comms-web/        React + Vite web app (TanStack Router and Query)
packages/design/       design tokens and the UI kit every screen is built from
specs/                 feature specs; docs/ ADRs and conventions; tools/ the gates
```

## Working in it

The repository comes from the pocket-factory template: read [`AGENTS.md`](AGENTS.md) and the
[constitution](.specify/memory/constitution.md). `pnpm verify:local` runs the local gates (also the
pre-push hook); CI runs the full set. Work on a branch and follow the
[Git conventions](docs/engineering/git-and-pr-conventions.md).

## License

[MIT](LICENSE)

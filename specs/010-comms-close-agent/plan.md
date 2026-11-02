# Plan 010 — pocket-comms: close an agent and its worktree

- **Spec:** [spec.md](./spec.md)
- **Status:** `Approved` — approved by the owner (2026-11-02)

## 1. Affected projects

| Path                            | Change                                                                                                          | Nx tags                               |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `packages/comms/domain`         | `Workspace` gains `checkout?` (the checkout folder)                                                             | `scope:comms`, `layer:domain`         |
| `packages/comms/application`    | `HerdrOutbound.removeWorktree`, `ProjectsOutbound.hasChanges`, two errors, the `close` use case on the port     | `scope:comms`, `layer:application`    |
| `packages/comms/infrastructure` | Herdr socket: `checkout_path` and `worktree.remove`; git: `status --porcelain`; the fake Herdr server learns it | `scope:comms`, `layer:infrastructure` |
| `packages/comms/contract`       | `POST /api/v1/agents/:agent/close` with `{ force?: boolean }`, 204                                              | `scope:contracts`                     |
| `packages/comms/api`            | The handler and the `not-a-worktree` and `worktree-has-changes` problems                                        | `scope:comms`, `layer:api`            |
| `apps/comms-server`             | OpenAPI document regenerated                                                                                    | `scope:comms`, `type:app`             |
| `packages/design/ui`            | The `trash` icon                                                                                                | `scope:design`, `type:ui`             |
| `apps/comms-web`                | `closeAgent` in the client; a Close action and a `CloseAgent` sheet in the conversation                         | `scope:comms`, `type:web`             |

### Shapes

- **Ports.** `HerdrOutbound.removeWorktree({ workspaceId, force })` sends `worktree.remove` with
  `workspace_id` and `force`, never `trust_repository`, and waits up to 60 seconds.
  `ProjectsOutbound.hasChanges(project, path)` runs `git status --porcelain` with `cwd` = `path`
  and fails with `ProjectGitError` when git fails.
- **Errors.** `NotAWorktreeError { ref }` and `WorktreeHasChangesError { ref }`.
- **Use case** `close(ref, force)` on `AgentsInbound`:
  1. `find(ref)`; the agent's workspace must have `worktree`, `checkout` and `root`, otherwise
     `NotAWorktreeError`.
  2. The project is the one of `ProjectsOutbound.list` whose path is the workspace's `root`; the
     checkout must be one of `worktrees(project)` other than the first (the primary), otherwise
     `NotAWorktreeError`.
  3. Without `force`, `hasChanges` true fails with `WorktreeHasChangesError`.
  4. `removeWorktree({ workspaceId, force })`.
- **API.** 204 on success; 404 `agent-not-found`; 409 `not-a-worktree`, `worktree-has-changes`,
  `worktree-not-removed` (Herdr's refusal) and `project-git-failed`; 503
  `herdr-unavailable`.
- **Web.** The top bar's Close (`trash` icon) shows when `agent.worktree` is set. It opens a
  `Sheet` with the explanation, the other agents (overview agents with the same `project` and
  `worktree`, except this one) and a `danger` Close button. A `worktree-has-changes` problem swaps
  the text and the button for Discard changes and close, which sends `force: true`. On success it
  calls `onBack`.

## 2. Contract changes

Additive within `/api/v1`: one new endpoint, `POST /agents/:agent/close`, with an optional `force`
in its payload. Nothing existing changes.

## 3. Migrations

None. The service has no database.

## 4. Test strategy

- **Application:** the `close` use case with the in-memory ports: a clean worktree, a dirty one
  without and with force, a main checkout, a workspace without a repository, a checkout git does
  not list, an unknown agent.
- **Adapter:** the socket sends `worktree.remove` with `force` and maps an error to
  `HerdrRejectedError`; the workspace's `checkout_path` becomes `checkout`. Git's `hasChanges` on a
  temporary repository, clean and dirty.
- **API:** `comms-api.spec.ts` for 204 and the two new problems.
- **Design:** the `trash` icon in the icon spec.
- **Web:** `conversation.spec.tsx`: no Close for a main checkout; Close, confirm, request and back;
  the other agents named; the changes problem and Discard; a Herdr refusal shown.

## 5. Risks

- Removal is destructive. The guards are the confirmation, the server's own git check, the
  linked-worktree check against both Herdr and git, and no path from the request.
- The comms server may itself run in a worktree it could close; the owner closes only what they
  choose, as on the desktop.

# Plan 005 — pocket-comms v2: new task in a Herdr worktree

- **Spec:** [spec.md](./spec.md)
- **Status:** `Approved` — approved by the owner in advance (2026-10-31)

## 1. Affected projects

| Path                            | Change                                                                                                                                                                                                                                                    | Nx tags                               |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `packages/comms/domain`         | `Workspace.root` (the repository folder); `Project`, `orderProjects`; `parseTask` (text and title), `parseBranch`, `AgentToStart` (`claude`, `pi`), `agentNameFor`                                                                                        | `scope:comms`, `layer:domain`         |
| `packages/comms/application`    | `TasksInbound` (`projects`, `create`); outbound `ProjectsOutbound` (`list`, `defaultBase`, `branchExists`, `isValidBranchName`); `HerdrOutbound` gains `createWorktree` and `startAgent`; DTOs, errors (`ProjectGitError`, `BranchExistsError`) and fakes | `scope:comms`, `layer:application`    |
| `packages/comms/infrastructure` | `Projects.layerGit({ root })` (folders below the root, `git` through `execFile` with `GIT_TERMINAL_PROMPT=0`); `Herdr.layerSocket` gains `worktree.create` and `agent.start` with longer per-request timeouts and reads `worktree.repo_root`              | `scope:comms`, `layer:infrastructure` |
| `packages/comms/contract`       | Group `tasks`: `GET /projects`, `POST /tasks`, with wire schemas                                                                                                                                                                                          | `scope:contracts`                     |
| `packages/comms/api`            | `tasksHandlers`, new problems (`branch-exists`, `project-git-failed`), acceptance tests                                                                                                                                                                   | `scope:comms`, `layer:infrastructure` |
| `apps/comms-server`             | Config `COMMS_PROJECTS_ROOT`, `COMMS_AGENT_ARGS`; wiring; OpenAPI document                                                                                                                                                                                | `scope:comms`, `type:app`             |
| `packages/design/ui`            | New form controls `Select`, `TextArea`, `Switch` (same `Field` pattern as `Input`)                                                                                                                                                                        | `scope:design`, `type:ui`             |
| `apps/comms-web`                | New task action and sheet on the overview, `suggestBranch`, client methods, navigation to the new agent, notes                                                                                                                                            | `scope:comms`, `type:web`             |
| `README.md`, comms `AGENTS.md`  | The new settings and the flow                                                                                                                                                                                                                             | —                                     |

### Shapes

- **Domain** stays pure. `orderProjects(projects, workspaces)` puts projects with a workspace
  first in workspace order and marks them `open`. `parseBranch` checks the shape of requirement 8;
  the git check (`check-ref-format`) is the adapter's.
- **Ports.** `TasksInbound` is a second inbound port of the comms service; its resource is the
  task (a new worktree with an optional agent), with a clearly different set of methods than
  `AgentsInbound` (ADR 0006). `ProjectsOutbound` hides the file system and `git`.
  `HerdrOutbound.createWorktree({ cwd, branch, base, label })` returns the workspace id, the root
  pane id, the folder and the branch; `startAgent({ paneId, name, kind, args })` returns the
  agent's status and readiness. Neither port has a focus method; the socket adapter sends
  `focus: false` and the tests prove no `*.focus` method is sent.
- **Use case `create`:** parse input → resolve the project in `projects` → `isValidBranchName` →
  `defaultBase` (fetch) → `branchExists` → `createWorktree` → optionally `startAgent` → prompt only
  when `idle` and ready. Failures after the worktree exists turn into a note, not an error.
- **API.** `GET /api/v1/projects` → `{ projects: [{ name, open }] }`. `POST /api/v1/tasks` with
  `{ project, task, branch, agent?: { kind } }` → `201` `{ workspace, branch, path, agent?: { ref,
started, prompted, note? } }`. Errors: `422` invalid input or unknown project, `409` branch exists
  or git failed or Herdr refused, `503` Herdr unavailable.
- **Web.** The overview's top bar gets an `IconButton` "New task"; the sheet uses the kit's `Sheet`,
  `Form`, `Select`, `TextArea`, `Input`, `Switch`, `Segmented` and `Button`. A mutation posts the
  task; on success it navigates to `/agents/$agent` (with the note in router state) or closes the
  sheet with a confirmation.

## 2. Contract changes

Additive within `/api/v1`: the `tasks` group with two endpoints. No existing endpoint changes.

## 3. Migrations

None. The service has no database.

## 4. Test strategy

- **Unit (domain):** project ordering, branch rule (valid and invalid examples of the spec), task
  title, agent name collisions.
- **Use cases:** with fakes: unknown project and invalid branch call nothing; existing branch and
  git failure create nothing; worktree with and without agent; prompt only for an idle ready agent;
  failed start keeps the worktree and reports a note; no focus call.
- **Adapters:** `Projects.layerGit` against temporary repositories with a local bare `origin`
  (listing, linked worktree excluded, default base after fetch, existing branch, invalid name);
  `Herdr.layerSocket` against the fake socket (request shapes with `focus: false`, `agent.start`
  params and decoding).
- **API / acceptance:** both endpoints through the server with a mock of `TasksInbound`, every
  problem mapping, the identity check.
- **Kit:** each new control with its label, error text and `axeViolations`.
- **Web:** the sheet with a fake client: projects order, branch prefill until edited, validation
  message kept with the draft, navigation after create, the note.
- **Smoke:** one throwaway worktree in pocket-comms through the built app with `agent-browser` at
  390 px, without an agent; then the worktree, its branch and its workspace are removed by hand.

## 5. Risks

- `agent.start` waits for interactive readiness; a Claude agent in a new folder may stop at its
  trust dialog. The flow then reports the agent as started without a prompt, and the owner answers
  the dialog in the conversation view.
- Fetching can take long on a slow network; the request then fails after 60 s and creates nothing.

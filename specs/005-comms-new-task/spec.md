# Spec 005 — pocket-comms v2: start a new task in a Herdr worktree from the phone

- **Status:** `Approved` — approved by the owner in advance (2026-10-31)
- **Changes:** [spec 004](../004-pocket-comms-v1/spec.md) (its "later" item "creating worktrees or
  new tasks from the app")
- **Issue:** smotastic/pocket-comms#7

## 1. Problem / intent (WHY)

pocket-comms v1 reads and drives agents that already run. To start new work from the phone, the
owner still has to reach a terminal, create a Herdr worktree and start an agent in it. v2 adds a
**New task** flow: pick a project, describe the task, and the app creates the worktree through
Herdr and, if asked, starts a Claude or Pi agent in it with the task as its first prompt. The new
agent then shows up in the overview like every other one.

## 2. Scope

- **In scope:** the project list, the New task sheet on the overview, creating the worktree through
  the Herdr socket, optionally starting an agent and sending it the task, navigating to the new
  agent, and the server-side checks of every input.
- **Out of scope:** removing worktrees or closing workspaces, more than one machine, choosing a
  model or other agent options in the app, agent kinds other than Claude and Pi, answering any
  dialog of the new agent automatically.

## 3. Requirements (WHAT)

### Projects

1. The projects to choose from are the git repositories directly below one root folder,
   `COMMS_PROJECTS_ROOT` (default `~/Development/projects`). A project is a folder there with a
   `.git` folder (a primary checkout); linked worktrees, nested folders and anything outside the
   root are never offered and never accepted.
2. Projects Herdr already has a workspace for (a workspace whose `worktree.repo_root` is the
   project's folder) come first, in Herdr's workspace order, and are marked as open in Herdr. The
   others follow, sorted by name.
3. A project is named by its folder name on the wire. The server resolves a name against the
   current list on every request; a name that is not in it is invalid input.

### New task sheet

4. The overview's top bar has a **New task** action (the kit's plus icon). It opens a sheet that
   matches the v1 Midnight design: project picker, task text, branch, "Start an agent" switch
   (on by default), agent kind (Claude or Pi, Claude by default) and a create button.
5. The task text is required (it is the task's title and the agent's first prompt), trimmed, at
   most 20 000 characters. Its **title** is its first non-blank line, cut to 80 characters.
6. The branch field is prefilled from the task text while the owner has not edited it: `fix/` and
   the title without its first word when that word is "fix" or "bug", else `feat/` and the whole
   title; the words in lower-case ASCII kebab case, cut at a word to at most 40 characters after
   the prefix. The owner can change it.
7. The create button shows progress ("Creating…") and is disabled meanwhile. A failure shows its
   reason in the sheet and keeps every field.

### Creating

8. The server validates the request before it changes anything:
   - the project is in the list (requirement 3);
   - the branch has the shape `<type>/<kebab-description>` with a type of `feat`, `fix`, `chore`,
     `docs`, `refactor`, `test`, `ci` or `build`, a description of lower-case letters, digits and
     single hyphens, at most 80 characters in all, and passes `git check-ref-format --branch`;
   - the task text follows requirement 5; the agent kind is `claude` or `pi`.
     An invalid request answers `422` with the field that is wrong.
9. The server fetches the project's `origin` and takes its default remote branch
   (`refs/remotes/origin/HEAD`, for example `origin/master`) as the base. If the fetch fails or the
   default branch cannot be found, it answers `409` and creates nothing.
10. A branch that already exists locally or on `origin` answers `409` and creates nothing.
11. The server creates the worktree with Herdr's `worktree.create` (`cwd` the project folder,
    `branch`, `base`, `label` the task title, `focus: false`). It never calls a `*.focus` method,
    so the owner's Herdr focus never moves (spec 004, requirement 18 holds).
12. With "Start an agent" on, the server starts the agent in the new workspace's root pane with
    Herdr's `agent.start` (`kind`, `pane_id`, a `name`), using the agent CLI's default permission
    mode: the only extra arguments are `COMMS_AGENT_ARGS` (default empty, split on whitespace, never
    passed through a shell). The agent's name is the branch with `/` replaced by `-`; when a live
    agent already has that name, `-2`, `-3`, … is appended.
13. When the started agent reports itself `idle` and ready for input, the server sends the task text
    as its first prompt (`agent.prompt`). Herdr may report a just-started agent before it has
    detected its status, so the server asks again for up to 10 seconds. In any other state, such
    as a trust or permission dialog (`blocked`), or when no status arrives in time, it sends
    nothing: the app never answers a dialog for the owner.
14. When the worktree exists but the agent could not be started or prompted, the request still
    succeeds (`201`) and says what did not happen and why; the worktree is kept.
15. The answer names the workspace, the worktree's branch and folder, and, when started, the
    agent's name, whether it was prompted, and a note when it was not.

### After creating

16. The new workspace and agent appear in the overview through the existing live updates.
17. When an agent was started, the app opens that agent's conversation (`/agents/<name>`) and shows
    the note of requirement 15 if there is one. Without an agent it closes the sheet and stays on
    the overview with a confirmation naming the branch.

### Security

18. Everything of spec 004's security section applies to the new routes: `127.0.0.1` only, the
    Tailscale login check on every request.
19. `git` and Herdr are always called with argument arrays (`execFile`, socket JSON), never through
    a shell; `git` runs with `GIT_TERMINAL_PROMPT=0` so it never waits for input.

## 4. Acceptance criteria

- Given a root with the repositories `alpha`, `beta` and `gamma`, a plain folder `notes`, and a
  Herdr workspace for `gamma`, when the projects load, then they are `gamma` (open in Herdr),
  `alpha`, `beta`, and `notes` is not offered.
- Given a request for project `../etc`, or for a name that is not in the list, then the server
  answers `422` and calls neither git nor Herdr.
- Given the branch `Feature/Foo`, `feat/foo..bar` or `wip/foo`, then the server answers `422`;
  given `feat/new-task-flow`, it continues.
- Given a branch that exists on `origin`, then the server answers `409` and Herdr is not called.
- Given a valid request without an agent, then Herdr receives exactly one `worktree.create` with
  `focus: false`, the default remote branch as `base` and the task title as `label`, and no
  `*.focus` method is ever sent.
- Given "Start an agent" with Claude and an agent that becomes idle, then Herdr receives
  `agent.start` with kind `claude`, the new root pane and no arguments, then `agent.prompt` with
  the task text.
- Given a started agent that reports `blocked`, then no prompt and no key is sent, the answer is
  `201` with a note, and the app opens the agent's conversation showing the note.
- Given the task "Fix the login redirect", then the branch field reads `fix/the-login-redirect`
  until the owner edits it.
- Given the built app at 390 px, then the New task sheet fits without horizontal scrolling and the
  created worktree appears in the overview.

## 5. Notes

- Herdr API (protocol 22): `worktree.create` takes `cwd`, `branch`, `base`, `label`, `path`,
  `focus` and answers `worktree_created` with `workspace`, `tab`, `root_pane` and `worktree`
  (`path`, `branch`). `agent.start` takes `name`, `kind`, `pane_id`, `args`, `timeout_ms` (3–300
  s) and answers `agent_started` with the `agent` record (`agent_status`, `interactive_ready`).
  `trust_repository` is never sent: it grants per-request git trust that only the owner may give.
- Both calls take longer than a v1 request: the adapter waits up to 60 s for `worktree.create` and
  40 s for `agent.start` (which itself waits up to 30 s for the agent).
- The orchestrator's decisions of 2026-10-31 (projects root, Herdr socket, no focus, base, branch
  rule, label, agent kinds and permission mode, navigation, security, UI) are folded into the
  requirements above.

## 6. Open questions

None. Details the brief left open were decided conservatively:

- `focus: false` is sent explicitly rather than relying on Herdr's default, so a changed default
  can never move the focus.
- The first prompt is sent only to an idle, ready agent (requirement 13); a blocked agent gets
  nothing, so no dialog is ever answered for the owner.
- A worktree whose agent failed is kept and reported (requirement 14), since removing worktrees is
  out of scope.
- `COMMS_AGENT_ARGS` is split on whitespace only; arguments with spaces are not supported.
- The branch suggestion runs in the web app (it is a UI aid); the rule that decides is the
  server's.

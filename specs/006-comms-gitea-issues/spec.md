# Spec 006 — pocket-comms: a project's Gitea issues and "Implement with Claude"

- **Status:** `Approved` — approved by the owner in advance (2026-10-31)
- **Changes:** [spec 005](../005-comms-new-task/spec.md) (it starts a task from an issue through
  the same flow)
- **Issue:** smotastic/pocket-comms#8

## 1. Problem / intent (WHY)

The owner keeps the work of each project as Gitea issues. To have an agent implement one from the
phone, they now have to open Gitea, copy the issue into the New task sheet and invent a branch.
This feature shows a project's open Gitea issues in pocket-comms and adds **Implement with
Claude** to each: it starts the spec 005 flow with the issue as the task, on a branch named after
the issue, and the issue row then shows which agent works on it.

## 2. Scope

- **In scope:** a projects screen and a project screen with the project's open issues, reading
  Gitea through its REST API with a token from the environment, mapping a project to its Gitea
  repository by its `origin` remote, the Implement with Claude action, and showing the agents that
  work on an issue.
- **Out of scope:** writing to Gitea (comments, labels, state, assignees), closed issues, pull
  requests, filtering or searching issues, other agent kinds than Claude for this action, other
  forges (GitHub), more than one Gitea, creating or storing tokens in the app.

## 3. Requirements (WHAT)

### Gitea access

1. The server reads Gitea through its REST API (`/api/v1`) at `COMMS_GITEA_URL` (default
   `http://localhost:3000`), authenticated with the token in `COMMS_GITEA_TOKEN`. The token needs
   read access to issues and repositories only.
2. The token is a secret: it comes from the environment only, and it is never logged, never put
   into an error message or a trace, never committed and never sent to the browser.
3. Without a token, the issue list of every Gitea project shows a clear "not configured" state
   that names `COMMS_GITEA_TOKEN`; nothing fails and the rest of the app works as before.

### Projects and their repository

4. The app gets a **Projects** screen (`/projects`), reached from a new top bar action on the
   overview. It lists the projects of spec 005 (requirements 1–3) in the same order; each opens
   the project screen (`/projects/<name>`).
5. A project's Gitea repository comes from the URL of its `origin` remote. The forms
   `host:owner/repo`, `user@host:owner/repo`, `ssh://[user@]host[:port]/owner/repo` and
   `http(s)://host[:port]/[prefix/]owner/repo` are understood, with or without `.git`. The remote
   is this Gitea when its host is the host of `COMMS_GITEA_URL` or one of the names in
   `COMMS_GITEA_HOSTS` (default `gitea`, comma-separated; SSH aliases such as the owner's `gitea`
   name the same server).
6. A project without an `origin`, or whose `origin` is another server (such as `github.com`), shows
   no issue list but a short "no Gitea remote" note.

### Issue list

7. The project screen lists the repository's **open issues** (no pull requests), the most recently
   updated first. Each row shows the number, the title, the labels by name, how long ago it was
   updated, and a link that opens the issue in Gitea.
8. The server reads every page of open issues, up to 500 issues; more are not shown.
9. When Gitea cannot be reached, answers an error, refuses the token or does not know the
   repository, the screen says so with Gitea's reason and the rest of the app keeps working
   (`503`, `gitea-unavailable`).

### Implement with Claude

10. Each issue row has an **Implement with Claude** action. It opens a sheet with the issue's
    number and title and a branch field prefilled with the issue's suggested branch, and a start
    button that shows progress ("Starting…"). A failure shows its reason in the sheet and keeps the
    branch.
11. The suggested branch is `<type>/<number>-<description>`: the type is the conventional-commit
    type at the start of the title (`feat: …`, `fix(scope): …`) when it is one of spec 005's branch
    types, else `fix` when the issue has a label named `bug` (any case) or the title's first word
    is "fix" or "bug", else `feat`. The description is the title without that type prefix in
    lower-case ASCII kebab case, cut at a word so that `<number>-<description>` has at most 40
    characters. The owner can change the branch.
12. Starting reads the issue from Gitea again. An issue that does not exist or is a pull request
    answers `404`; a closed issue answers `409`; nothing is created then.
13. The task is the spec 005 task with agent kind `claude`, the project of the screen and the
    branch of the sheet; every spec 005 rule applies (validation, base, existing branch, no focus,
    first prompt only to an idle ready agent, notes). Its text, which is the agent's first prompt,
    is:

    ```text
    <title>

    <body>

    Gitea issue #<number>: <issue URL>
    Implement this issue. Write "Closes #<number>" in the pull request description.
    ```

    The first line, the title, is the workspace label. A body that would make the text longer than
    20 000 characters is cut and ends with "[…] The issue is longer; read it in Gitea." An empty
    body leaves out its paragraph.

14. After starting, the app behaves as after a spec 005 create: it opens the agent's conversation
    with the note if there is one, or stays with a confirmation naming the branch.

### Agents working on an issue

15. An issue row shows the agents working on it: for every worktree of the project whose branch
    has the shape `<type>/<number>-<description>` with the issue's number, the live agents whose
    folder is that worktree or below it, by name and status, each linking to its conversation. A
    worktree with no live agent shows its branch with "no agent running".
16. The link is derived on every request from git's worktree list and Herdr's live agents; the app
    stores nothing, so it holds across server restarts and for worktrees made by hand.

### Writing

17. The app never writes to Gitea: it sends only `GET` requests there.

### Security

18. Spec 004's and 005's security sections apply to the new routes (`127.0.0.1` only, the
    Tailscale login check on every request, git with argument arrays and
    `GIT_TERMINAL_PROMPT=0`). A project is only ever one the projects port lists, and the Gitea
    repository only ever the one its `origin` names; neither comes from a request as a path or URL.

## 4. Acceptance criteria

- Given the origins `gitea:smotastic/pocket-comms.git`, `ssh://git@localhost:2222/a/b.git`,
  `http://localhost:3000/a/b` and `git@github.com:a/b.git` with the default settings, then the
  first three map to `smotastic/pocket-comms`, `a/b` and `a/b`, and the last to no repository.
- Given no `COMMS_GITEA_TOKEN`, when a Gitea project's screen opens, then it shows the "not
  configured" state and Gitea is not called.
- Given a repository with open issues #3 (updated yesterday, labels `bug`, `ui`) and #5 (updated
  today) and pull request #4, then the list is #5, #3 with their labels and Gitea links, and #4 is
  not shown.
- Given the issue "feat: per-project Gitea issue list" with number 8, then the suggested branch is
  `feat/8-per-project-gitea-issue-list`; given "Login breaks" with label `bug` and number 12, then
  `fix/12-login-breaks`.
- Given Implement with Claude on #8 with an idle ready agent, then Herdr receives
  `worktree.create` with `focus: false` and the issue title as label, `agent.start` with kind
  `claude`, and `agent.prompt` with the text of requirement 13 ending in the `Closes #8` line.
- Given a closed issue, then starting answers `409` and neither git nor Herdr is called.
- Given a worktree on `feat/8-per-project-gitea-issue-list` with a live agent in it, then the row
  of #8 shows that agent and its status; given the worktree without an agent, then it shows the
  branch with "no agent running"; given a worktree on `feat/80-other`, then #8 shows nothing.
- Given any request, then every request to Gitea is a `GET` with `Authorization: token …`, and no
  answer or log line of the app contains the token.
- Given the built app at 390 px with a fake Gitea, then the projects and project screens and the
  Implement sheet fit without horizontal scrolling.

## 5. Notes

- Gitea API (the local server's document, version 28.2.0): `GET /repos/{owner}/{repo}/issues` with
  `state=open&type=issues&page&limit` (no sort parameter, so the server sorts by `updated_at`);
  `GET /repos/{owner}/{repo}/issues/{index}`; the issue fields used are `number`, `title`, `body`,
  `state`, `html_url`, `updated_at`, `labels[].name` and `pull_request`. The token goes into the
  `Authorization: token <token>` header.
- The token is created in Gitea under Settings → Applications with the scopes `read:issue` and
  `read:repository`; the owner adds it to the server's environment.

## 6. Open questions

None. The orchestrator's decisions of 2026-10-31 (Gitea port and HTTP adapter, `COMMS_GITEA_URL`
and `COMMS_GITEA_TOKEN`, the not-configured state, mapping by `origin`, the issue list, reusing the
spec 005 flow with Claude, linking by branch name, read-only Gitea, the local check with a fake
adapter) are folded into the requirements above. Details they left open were decided
conservatively:

- The owner's remotes use the SSH alias `gitea` (`gitea:smotastic/<repo>.git`), whose host is not
  the host of `COMMS_GITEA_URL`, so `COMMS_GITEA_HOSTS` (default `gitea`) names further hosts.
- Implement with Claude asks for the branch in a sheet before anything starts, so a stray tap
  never starts an agent.
- The link between agents and issues is not kept in memory at all but derived on every request
  (requirement 16); that is what "survives restarts by re-deriving from branch names" needs, with
  no state to lose.
- Labels are shown by name in the kit's neutral tag, without Gitea's colours: an app does not
  bring its own colours (the design system owns the look).
- Gitea's refusals (unreachable, `401`, `403`, `404` for the repository) are one `503` problem
  with Gitea's reason; the app cannot fix any of them.
- The 500-issue cap keeps a request bounded; the owner's repositories have far fewer.

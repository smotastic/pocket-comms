# Plan 006 — pocket-comms: a project's Gitea issues and "Implement with Claude"

- **Spec:** [spec.md](./spec.md)
- **Status:** `Approved` — approved by the owner in advance (2026-10-31)

## 1. Affected projects

| Path                            | Change                                                                                                                                                                                                                                                                                                      | Nx tags                               |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `packages/comms/domain`         | `src/issue.ts`: `Issue`, `GiteaRepository`, `parseRemote`, `orderIssues`, `issueBranch`, `issueNumberOf` (branch to issue), `issueTask` (the prompt text), `workOnIssues` (worktrees and agents per issue)                                                                                                  | `scope:comms`, `layer:domain`         |
| `packages/comms/application`    | Outbound `GiteaOutbound` (`repositoryOf`, `openIssues`, `issue`); `ProjectsOutbound` gains `originUrl` and `worktrees`; `IssuesInbound` (`issues`, `implement`); errors (`GiteaNotConfiguredError`, `GiteaUnavailableError`, `IssueNotFoundError`, `IssueClosedError`, `ProjectNotFoundError`); DTOs; fakes | `scope:comms`, `layer:application`    |
| `packages/comms/infrastructure` | `Gitea.layerHttp({ url, token, hosts })` (`fetch`, `GET` only, pages of 50, token in the header only); `Projects.layerGit` gains `remote get-url origin` and `worktree list --porcelain`; a recorded, anonymised fixture of Gitea's answers                                                                 | `scope:comms`, `layer:infrastructure` |
| `packages/comms/contract`       | Group `issues`: `GET /projects/:project/issues`, `POST /projects/:project/issues/:number/implement`, with wire schemas                                                                                                                                                                                      | `scope:contracts`                     |
| `packages/comms/api`            | `issuesHandlers`; problems `project-not-found`, `issue-not-found`, `issue-closed`, `gitea-unavailable`, `no-gitea-remote`, `gitea-not-configured`; acceptance tests                                                                                                                                         | `scope:comms`, `layer:infrastructure` |
| `apps/comms-server`             | Config `COMMS_GITEA_URL`, `COMMS_GITEA_TOKEN` (redacted), `COMMS_GITEA_HOSTS`; wiring; OpenAPI document                                                                                                                                                                                                     | `scope:comms`, `type:app`             |
| `packages/design/ui`            | Icon `issues` for the top bar action                                                                                                                                                                                                                                                                        | `scope:design`, `type:ui`             |
| `apps/comms-web`                | Routes `/projects` and `/projects/$project`, the issue rows, the Implement sheet, client methods                                                                                                                                                                                                            | `scope:comms`, `type:web`             |
| `README.md`, comms `AGENTS.md`  | The new settings, the token and the flow                                                                                                                                                                                                                                                                    | —                                     |

### Shapes

- **Domain** stays pure. `parseRemote(url)` returns `{ host, owner, name }` or nothing; the Gitea
  adapter decides whether the host is its own. `issueBranch(issue)` implements requirement 11,
  `issueTask(issue)` requirement 13, `issueNumberOf(branch)` the branch pattern, and
  `workOnIssues(worktrees, agents)` maps an issue number to its worktrees and their agents
  (requirement 15).
- **Ports.** `GiteaOutbound.repositoryOf(remoteUrl)` names the repository when the remote is this
  Gitea; `openIssues(repository)` and `issue(repository, number)` read issues and fail with
  `GiteaNotConfiguredError` (no token), `GiteaUnavailableError` (with Gitea's reason, never the
  token) or `IssueNotFoundError`. `IssuesInbound` is a third inbound port, for the issues
  resource (ADR 0006); `implement` composes the `create` use case of spec 005 instead of copying
  it, so every rule of the New task flow holds.
- **Use case `issues(project)`:** resolve the project (`ProjectNotFoundError`) → `originUrl` →
  `repositoryOf` (none: `NoGiteaRemote`) → `openIssues` (not configured: `NotConfigured`) →
  `worktrees` and the Herdr snapshot → `orderIssues` and `workOnIssues`. A missing Herdr leaves
  the agents out rather than failing the list.
- **Use case `implement(project, number, branch)`:** resolve the project and repository (`409`
  when there is none or no token) → `issue` (404 for a pull request, `IssueClosedError` when
  closed) → `create({ project, task: issueTask(issue), branch, agent: 'claude' })`.
- **API.** `GET /api/v1/projects/{project}/issues` → `200` with `_tag` `Listed`
  (`repository: { owner, name, url }`, `issues: [{ number, title, labels, updatedAt, url, branch,
work: [{ branch, agents: [{ ref, status }] }] }]`), `NoGiteaRemote` or `NotConfigured`; `404`
  unknown project; `503` Gitea or Herdr unavailable. `POST
/api/v1/projects/{project}/issues/{number}/implement` with `{ branch }` → `201` `TaskCreated`;
  `404` project or issue; `409` closed issue, no Gitea remote, not configured, or the spec 005
  conflicts; `422`; `503`.
- **Web.** The overview's top bar gets an `IconButton` "Projects" (`issues` icon) next to New task.
  `/projects` lists the projects as links; `/projects/$project` has a back button, the issue rows
  (kit `Card`, `Link`, `Tag`, `Text`, `Button`, `StatusPill`) and an Implement `Sheet` with the
  branch `Input`. On success it navigates like the New task sheet.

## 2. Contract changes

Additive within `/api/v1`: the `issues` group with two endpoints. No existing endpoint changes.

## 3. Migrations

None. The service has no database, and the link between agents and issues is derived.

## 4. Test strategy

- **Unit (domain):** every remote form of requirement 5 and the acceptance examples; issue order;
  branch suggestions (type prefix, `bug` label, "fix" word, cut at a word, number kept); the task
  text (empty body, cut body); the branch pattern; work per issue (worktree below, other number).
- **Use cases (fakes):** not configured, no remote, unknown project, listed with work; implement
  on an open issue sends the issue task with Claude, a closed issue and a pull request create
  nothing, a missing token creates nothing.
- **Adapters:** `Gitea.layerHttp` against a local HTTP server that serves the recorded fixture:
  only `GET`, the `Authorization` header, paging until a short page and the 500 cap, pull requests
  dropped, `401`/`404`/unreachable as `GiteaUnavailableError` without the token in the reason, no
  token means no request; `Projects.layerGit` with temporary repositories (origin URL, none,
  linked worktrees with branches), all git calls with the cleaned environment.
- **API / acceptance:** both endpoints through the server with a mock of `IssuesInbound`, every
  problem mapping, the identity check.
- **Web:** with a fake client: the projects list, the issue rows (labels, link, work), the three
  states, the Implement sheet (prefilled branch, progress, error kept, navigation).
- **Local check:** the built app at 390 px with `agent-browser`, the server wired with the fake
  Gitea adapter (no real token is present); no agent is started on a real issue.

## 5. Risks

- A token with too wide scopes would let a bug write to Gitea; the adapter sends only `GET`, and
  the README asks for read scopes.
- Issue text becomes an agent's prompt. The owner's own issues are the source; the agent runs in
  its CLI's default permission mode, so it still asks before acting.
- Many pages of issues slow the screen; the 500 cap bounds it.

# Plan 010 — pocket-comms: close a Gitea issue from the issue list

- **Spec:** [spec.md](./spec.md)
- **Status:** `Approved` — approved by the owner (2026-11-02)

## 1. Affected projects

| Path                            | Change                                                                                                                                 | Nx tags                               |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `packages/comms/application`    | `GiteaOutbound.closeIssue`; `IssuesInbound.close` (use case `close-issue.use-case.ts`); the fake Gitea records closes                  | `scope:comms`, `layer:application`    |
| `packages/comms/infrastructure` | `Gitea.layerHttp`: a `patch` beside `get`, sharing the header, timeout, redirect and refusal handling; `closeIssue` with its span      | `scope:comms`, `layer:infrastructure` |
| `packages/comms/contract`       | `POST /projects/:project/issues/:number/close` → `NoContent`; the group's description no longer says the app never writes              | `scope:contracts`                     |
| `packages/comms/api`            | The `close` handler with the existing problems; acceptance tests                                                                       | `scope:comms`, `layer:infrastructure` |
| `apps/comms-server`             | OpenAPI document                                                                                                                       | `scope:comms`, `type:app`             |
| `apps/comms-web`                | Client method `closeIssue`; a Close button on each row; a `CloseIssue` sheet (beside `ImplementIssue.tsx`); the notice and the refetch | `scope:comms`, `type:web`             |
| `README.md`, comms `AGENTS.md`  | The token scope `write:issue`; the adapter's one write                                                                                 | —                                     |

No domain change: closing has no business rule beyond "only an open issue that is not a pull
request", which the use case checks on the `Issue` the domain already has.

### Shapes

- **Port.** `GiteaOutbound.closeIssue(repository, number): Effect<void, GiteaNotConfiguredError |
GiteaUnavailableError | IssueNotFoundError>`. The port's comment changes from "read only" to
  "reads, and closes issues; nothing else writes".
- **Use case `close(project, number)`:** `issueProject` → no repository: `NoGiteaRemoteError` →
  `issue` → pull request: `IssueNotFoundError` → closed: succeed without a write → `closeIssue`.
  The same order as `implement`, so both re-read the issue before acting.
- **Adapter.** The existing `get` becomes a `send(method, path, body?)`; `get` and `closeIssue` are
  thin wrappers, so the token, timeout, `redirect: 'manual'` and the `401`/`403`/`3xx`/`404`
  mapping stay in one place. `closeIssue` sends `PATCH …/issues/{n}` with
  `content-type: application/json` and `{"state":"closed"}`; `404` → `IssueNotFoundError`.
- **API.** `POST /api/v1/projects/{project}/issues/{number}/close` → `204`; `404` project or
  issue; `409` no Gitea remote, not configured; `503` Gitea unavailable. No new problem types.
- **Web.** The row's actions become an `Inline` with Implement with Claude and a secondary
  "Close". `CloseIssue` is a kit `Sheet` like `ImplementIssue`: the issue's number and title, the
  work warning when `issue.work` is not empty, "Close issue" (busy label "Closing…") and Cancel;
  errors in an `Alert` inside the sheet. On success `ProjectPage` sets the notice
  "#<number> closed." and invalidates `issuesKey(project)`.

## 2. Contract changes

Additive within `/api/v1`: one endpoint in the `issues` group. No existing endpoint changes; only
the group's description text changes.

## 3. Migrations

None.

## 4. Test strategy

- **Use case (fakes):** an open issue is closed once; an already closed issue succeeds without a
  close; a pull request and a missing issue fail with `IssueNotFoundError` and close nothing; no
  remote and no token close nothing.
- **Adapter:** against the local fake HTTP server: the `GET` then `PATCH` with the JSON body and
  the `Authorization` header; `403` on the `PATCH` → `GiteaUnavailableError` without the token;
  `404` → `IssueNotFoundError`; a redirect is not followed; no token means no request; no `DELETE`
  is ever sent.
- **API / acceptance:** the endpoint through the server with a mock of `IssuesInbound`: `204` and
  every problem mapping, the identity check.
- **Web:** with a fake client: Close opens the sheet with number and title; Cancel calls nothing;
  the work warning; "Closing…"; an error stays in the sheet; success shows the notice and refetches.
- **Local check:** the built app at 390 px with `agent-browser` and the fake Gitea; no real issue
  is closed.

## 5. Risks

- A token with `write:issue` could change more than the state; the adapter only ever sends the
  `{"state":"closed"}` body, and the adapter test pins that.
- A wrong tap closes an issue; the sheet asks first, and closing is reversible in Gitea.

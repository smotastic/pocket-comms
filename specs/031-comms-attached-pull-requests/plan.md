# Plan 031 — pocket-comms: pull requests attached to an agent, with their changes

- **Spec:** [spec.md](./spec.md)
- **Status:** `Draft` — spec and plan await one human approval

## 1. Affected projects

| Path                            | Change                                                                                                                                                                                                                                                     | Nx tags                               |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `packages/comms/domain`         | A new `pull-request.ts`: `PullRequestRef`, `parsePullRequestPath`, `parseRepositoryName`, `attachTo` (idempotent, at most 20), `parseUnifiedDiff` with the per-file limit, `PullRequestState`.                                                             | `scope:comms`, `layer:domain`         |
| `packages/comms/application`    | `GiteaOutbound` gains four reads: `pullRequestOf` (URL → ref, on the app's hosts), `pullRequest`, `pullRequestDiff` (bounded) and `pullRequestFiles`. A new `PullRequestsStoreOutbound` port and `PullRequestsInbound` use case. New errors. Fakes follow. | `scope:comms`, `layer:application`    |
| `packages/comms/infrastructure` | `gitea/http.ts`: the reads (`GET` only). A new `pull-requests/file-store.ts`: `<state>/pull-requests.json`, written atomically.                                                                                                                            | `scope:comms`, `layer:infrastructure` |
| `packages/comms/contract`       | `AttachPullRequestRequest`, `AttachedPullRequest`, `AttachedPullRequests`, `PullRequestChanges`; four endpoints in the `agents` group.                                                                                                                     | `scope:comms`, `type:contract`        |
| `packages/comms/api`            | The four handlers and the error mapping.                                                                                                                                                                                                                   | `scope:comms`, `layer:api`            |
| `apps/comms-server`             | Wires the file store; the regenerated OpenAPI document; the skill at `apps/comms-server/skills/comms-attach-pull-request/SKILL.md`, copied into `dist` by the build.                                                                                       | `scope:comms`, `type:app`             |
| `apps/comms-web`                | `CommsClient` methods and queries; a `PullRequestStrip` in `Conversation`; a `PullRequestSheet` composing the kit's `Sheet`, `SheetHeader` and the new code diff component.                                                                                | `scope:comms`, `type:app`             |
| `pnpm-workspace.yaml`           | The catalog bump of `@smotastic/pocket-design` to the release with the code diff component.                                                                                                                                                                | —                                     |
| `packages/comms/AGENTS.md`      | Names spec 031, the new Gitea reads and the skill's one-time setup.                                                                                                                                                                                        | —                                     |
| `GLOSSARY.md`                   | **Pull request** and **Attached pull request**.                                                                                                                                                                                                            | —                                     |
| `.pocket-ci`                    | The accepted OpenAPI diff lines for the new endpoints.                                                                                                                                                                                                     | —                                     |

The design kit component is pocket-factory's own spec; this plan takes it as a dependency. The
server side and the strip can land first; the sheet's diff needs the kit release.

## 2. Contract changes

Compatible within `/api/v1`: four new endpoints in the `agents` group, nothing changed.

- `POST /agents/:agent/pull-requests` with
  `AttachPullRequestRequest = { url: string } | { repository: string; number: int }` → `200`
  `AttachedPullRequest`. `404` unknown agent or pull request; `409` no session, or the list is full;
  `422` not a pull request, or not this Gitea; `503` Gitea not set up or unreachable.
- `GET /agents/:agent/pull-requests` → `AttachedPullRequests = { pullRequests: AttachedPullRequest[] }`.
- `DELETE /agents/:agent/pull-requests/:owner/:repo/:number` → `204`.
- `GET /agents/:agent/pull-requests/:owner/:repo/:number/changes` → `PullRequestChanges`.

```ts
AttachedPullRequest = {
  owner: string; repo: string; number: int; url: string;
  // Absent when Gitea cannot read it now; then `unavailable` says why.
  title?: string; state?: 'open' | 'merged' | 'closed'; unavailable?: string;
}
PullRequestChanges = {
  pullRequest: AttachedPullRequest;
  tooLarge: boolean;            // requirement 17: files without hunks
  files: Array<{
    path: string; previousPath?: string;
    kind: 'added' | 'deleted' | 'modified' | 'renamed';
    additions: int; deletions: int;
    shown: 'hunks' | 'binary' | 'too-large';
    hunks: Array<{ header: string; lines: Array<{
      kind: 'context' | 'added' | 'removed'; text: string; old?: int; new?: int }> }>;
  }>;
}
```

`owner` and `repo` path segments match Gitea's names (`^[A-Za-z0-9._-]{1,100}$`); `number` is a
positive int. The `agent` param is the existing one; the skill URL-encodes `HERDR_PANE_ID`
(`w6N:p1`).

## 3. Migrations

No database. A new state file, `<state>/pull-requests.json`:
`{ version: 1, agents: { [sessionId]: Array<{ owner, repo, number, attachedAt }> } }`. Absent means
empty. Written to a temp file and renamed, as the other state files are.

## 4. Design

### Domain (`pull-request.ts`)

- `PullRequestRef = { owner, repo, number }`; `refKey` for equality.
- `parsePullRequestPath(pathname)`: `/<owner>/<repo>/pulls/<n>` with optional trailing segments
  (`/files`, `/commits`) and slash → `Option<PullRequestRef>`. The host check stays in the
  adapter, which knows the Gitea URL and hosts (as `repositoryOf` does).
- `parseRepositoryName('owner/repo')`, with the name rule above.
- `attachTo(list, ref, now)`: unchanged when present; `ListFullError` past 20; else appended.
- `parseUnifiedDiff(text)`: splits at `diff --git a/… b/…`; reads `new file mode`,
  `deleted file mode`, `rename from/to`, `Binary files … differ` and `GIT binary patch`; `@@ -a,b
+c,d @@` headers; numbers context, added and removed lines; ignores `\ No newline at end of file`.
  A file over 1,500 added plus removed lines keeps its counts and drops its hunks
  (`shown: 'too-large'`). Unknown lines are skipped, never fatal.
- `PullRequestState` from Gitea's `state` and `merged`.

### Application

- `GiteaOutbound` (reads only, so the "writes only" rule is unchanged):
  - `pullRequestOf(url): Option<PullRequestRef>` — host is the app's Gitea, path parses.
  - `pullRequest(ref)` → `{ title, state, merged, url }`; `PullRequestNotFoundError` on `404`.
  - `pullRequestDiff(ref, maxBytes)` → `Option<string>`; `None` when the body passes `maxBytes`
    (read as a stream and cancelled at the limit).
  - `pullRequestFiles(ref)` → files with counts and kinds, paged, at most 3,000 (Gitea's cap).
- `PullRequestsStoreOutbound`: `read(): Effect<Lists, PullRequestsStoreError>`,
  `write(lists)`. One writer: the use case serialises attach and remove with a semaphore.
- `PullRequestsInbound`:
  - `attach(agentRef, input)`: `find` the agent; no session → `NoConversationError` (`409`);
    resolve the ref (`pullRequestOf` or `parseRepositoryName`, else `InvalidPullRequestError`
    `422`, with the "Only … this app's Gitea" reason when the URL parses but the host is foreign);
    `pullRequest(ref)` (`404` when missing); `attachTo`; write; answer the view.
  - `list(agentRef)`: the stored refs, each `pullRequest` read concurrently (up to 4); a failure
    becomes `unavailable` with its reason.
  - `remove(agentRef, ref)`: filter and write; absent is a no-op.
  - `changes(agentRef, ref)`: `404` unless attached; `pullRequest`; `pullRequestDiff(ref, 2 MB)`;
    `Some` → `parseUnifiedDiff`; `None` → `pullRequestFiles` with `tooLarge: true`.
- Errors: `PullRequestNotFoundError`, `InvalidPullRequestError`, `NoConversationError`,
  `PullRequestListFullError`, `PullRequestsStoreError`.

### Infrastructure

- Gitea reads: `GET /repos/{o}/{r}/pulls/{n}`, `GET /repos/{o}/{r}/pulls/{n}.diff` (accept
  `text/plain`), `GET /repos/{o}/{r}/pulls/{n}/files?page=&limit=50`. Same `send` helper, token
  only in `Authorization`, no redirects. Owner and repo are encoded with `encodeURIComponent`.
- File store as the quick replies store: a broken file is reported (`PullRequestsStoreError`),
  never replaced by a read.

### Web

- `comms-client.ts` / `comms-queries.ts`: `pullRequests(agent)` (refetch every 30 s and on
  focus), `pullRequestChanges(agent, ref)`, `attach` is not used by the web app, `removePullRequest`.
- `PullRequestStrip` under the conversation header: a horizontal list of kit items (`ItemRow` /
  `Tag` for the state, a `Menu` with **Remove** and an alert-dialog `Sheet` to confirm). No strip
  when the list is empty. `unavailable` items show the reason in place of the title.
- `PullRequestSheet`: kit `Sheet` with `side` from a width media query (`end` at ≥ 768 px, else
  `bottom`, `size="full"`), `SheetHeader` with title, state, **Refresh** (`IconButton`) and **Open
  in Gitea** (`LinkButton`), the notice for `tooLarge`, and the kit's code diff component with
  the files. The open request lives in the route search (`?pr=owner/repo/number`), so back closes
  it; the conversation is not unmounted, so its scroll stays. Refresh refetches both queries with
  `placeholderData: keepPreviousData`.
- All words are in the app (`labels.ts`); the kit component takes its labels as props.

### The skill

`apps/comms-server/skills/comms-attach-pull-request/SKILL.md`, front matter `name` and
`description` ("Attach a Gitea pull request to this agent's pocket-comms conversation; use after
creating a pull request or when asked to attach one"). Body: the one `curl` call,

```sh
base="${COMMS_URL:-https://$(tailscale status --json | jq -r '.Self.DNSName | rtrimstr(".")')}"
curl -sS -X POST "$base/api/v1/agents/$(jq -rn --arg p "$HERDR_PANE_ID" '$p|@uri')/pull-requests" \
  -H 'content-type: application/json' -d "$(jq -n --arg url "$URL" '{url:$url}')"
```

how to read `200` and a problem's `detail`, and to stop and tell the owner on a refusal. It runs
only inside Herdr (`HERDR_PANE_ID` set); outside, it says so. The build copies `skills/` to
`dist/skills/`; `AGENTS.md` gives the two `ln -s` lines for the deployed release.

## 5. Test strategy

- **Unit (domain):** `parsePullRequestPath` accepts `/o/r/pulls/7`, `/o/r/pulls/7/files`, and
  refuses issues, `0`, non-numbers and bad names; `attachTo` is idempotent, keeps order and stops
  at 20; `parseUnifiedDiff` on fixtures: added, deleted, modified, renamed (with and without
  changes), binary (both forms), no-newline marker, multiple hunks with correct line numbers, and a
  1,501-line file folded.
- **Unit (application, fakes):** attach stores and answers; same ref twice stores once; foreign
  host, bad input, missing pull request, no session and full list each refuse and store nothing;
  list marks a failing read `unavailable` and keeps the rest; remove; changes refuses an
  unattached ref and falls back to the file list when the diff is over the limit.
- **Adapter:** the Gitea reads against the local fake server with anonymised fixtures (a pull
  request, a diff, a merged one, a `404`, a diff over the limit cut off, two pages of files), and
  that only `GET`s are sent with the token in `Authorization` only; the file store round-trips,
  starts empty, and reports a broken file without replacing it.
- **API and contract:** the request union decodes; each endpoint's status codes; the OpenAPI
  document is regenerated and the diff lines accepted.
- **Web (Testing Library):** no strip without pull requests; the strip shows repo, number, title
  and the state tag; remove asks, confirms and calls `DELETE`; tapping opens the sheet with files
  and hunks; binary and too-large files show their notes; `tooLarge` shows the notice; Refresh
  refetches; a failed read shows the reason and **Try again**; axe has no violations.
- **Boundaries:** dependency-cruiser and the Nx tags as for every layer; the ports check.
- **Manual (phone, 390 px, and desktop):** a live Claude agent runs the skill after opening a pull
  request; the strip and sheet show it; a new push and Refresh; remove.

## 6. Risks

- **The kit release gates the sheet's diff.** Mitigation: land the server, skill and strip first;
  the sheet follows the catalog bump.
- **The tailnet URL from the agent's machine.** It works today (checked 2026-11-23: a request from
  the home server to its own `ts.net` URL passes the guard). If the node becomes tagged, Tailscale
  stops sending the login and the skill gets `403`; the skill reports it, nothing else breaks.
- **Gitea's diff format.** It is git's unified diff; the parser skips what it does not know.

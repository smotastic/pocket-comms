# Spec 010 — pocket-comms: close a Gitea issue from the issue list

- **Status:** `Approved` — approved by the owner (2026-11-02)
- **Changes:** [spec 006](../006-comms-gitea-issues/spec.md) (requirement 17, "the app never
  writes to Gitea", and the token's scopes in requirement 1)

## 1. Problem / intent (WHY)

The project screen lists a project's open Gitea issues (spec 006). Some of them are no longer
relevant, but to get rid of one the owner has to leave the phone app, open Gitea and close it
there. This feature adds a **Close** action to each issue row, so a stale issue can be closed from
the list in pocket-comms.

## 2. Scope

- **In scope:** a Close action on each open issue row, a confirmation sheet, a server endpoint
  that closes the issue in Gitea, and the wider token scope that needs.
- **Out of scope:** deleting issues (irreversible and needs repository admin rights), comments or
  a closing reason, reopening, closing several issues at once, labels or other issue fields,
  touching the worktrees or agents that work on a closed issue, pull requests.

## 3. Requirements (WHAT)

### Closing

1. Each issue row gets a **Close** action next to Implement with Claude. It opens a sheet that
   names the issue (number and title) and has a **Close issue** button and a cancel action; a
   stray tap on the row never closes anything.
2. When worktrees or agents work on the issue (spec 006 requirement 15), the sheet lists them as a
   warning ("still worked on: …") and says that closing leaves them running. Closing is still
   allowed.
3. The button shows progress ("Closing…"). A failure shows its reason in the sheet and keeps the
   sheet open; the issue stays in the list.
4. After a successful close the sheet closes, the screen confirms "#<number> closed." and the
   issue list is read again, so the issue no longer shows.

### Server

5. `POST /api/v1/projects/{project}/issues/{number}/close` closes the issue. It resolves the
   project and its Gitea repository as spec 006 does, reads the issue from Gitea again and then
   sets its state to `closed` in Gitea. It answers `204` with no body.
6. An issue that does not exist or is a pull request answers `404` (`issue-not-found`) and nothing
   is written. An issue that is already closed answers `204` and nothing is written (closing is
   idempotent).
7. A project without a Gitea remote or a server without a token answers `409`
   (`no-gitea-remote`, `gitea-not-configured`); an unknown project `404`; when Gitea cannot be
   reached, answers an error or refuses the token, `503` (`gitea-unavailable`) with Gitea's
   reason, as in spec 006 requirement 9.

### Gitea access

8. The token now needs write access to issues: the scopes `write:issue` (which includes reading)
   and `read:repository`. A token with only `read:issue` still lists issues; closing with it
   answers `503` with Gitea's refusal ("Gitea refused the token (403)").
9. This replaces spec 006 requirement 17: the app sends `GET` requests to Gitea, and exactly one
   kind of write — a `PATCH` of an issue with the body `{"state":"closed"}`. It sends no other
   write, and no `DELETE`.
10. Spec 006's rules for the token (requirement 2: environment only, never logged, never in an
    error, a trace or the browser) and for redirects (not followed) apply to the write too.

### Security

11. Spec 006's security section (requirement 18) applies to the new route: `127.0.0.1` only, the
    Tailscale login check on every request, and the repository only ever the one the project's
    `origin` names, never one from the request.

## 4. Acceptance criteria

- Given open issue #5 and a token with `write:issue`, when the owner taps Close on #5 and confirms,
  then Gitea receives exactly `GET …/issues/5` and `PATCH …/issues/5` with `{"state":"closed"}`,
  the server answers `204`, the screen says "#5 closed." and #5 is no longer listed.
- Given the sheet for #5, when the owner cancels, then Gitea receives no request.
- Given an already closed issue #6, when closing it, then the server answers `204` and Gitea
  receives no `PATCH`.
- Given pull request #4, when closing it, then the server answers `404` and Gitea receives no
  `PATCH`.
- Given a token with only `read:issue` (Gitea answers `403` to the `PATCH`), when closing #5, then
  the server answers `503` with "Gitea refused the token (403)", the sheet shows it and #5 stays
  listed.
- Given a worktree on `feat/5-…` with a live agent, when the sheet for #5 opens, then it names that
  agent as still working on the issue; after closing, the worktree and agent are untouched.
- Given no `COMMS_GITEA_TOKEN`, then the screen shows spec 006's "not configured" state and offers
  no Close action.
- Given any request, then no answer, log line or span of the app contains the token, and the app
  never sends a `DELETE` to Gitea.
- Given the built app at 390 px with a fake Gitea, then the issue rows with both actions and the
  Close sheet fit without horizontal scrolling.

## 5. Notes

- Gitea API (version 28.2.0): `PATCH /repos/{owner}/{repo}/issues/{index}` with an
  `EditIssueOption` body; `{"state":"closed"}` changes only the state. It answers `201` with the
  issue.
- The owner widens the existing token in Gitea (Settings → Applications) or creates a new one with
  `write:issue` and `read:repository`.

## 6. Open questions

None. The owner's decisions of 2026-11-02 are folded in: close only, no delete (irreversible);
a confirmation sheet rather than one tap with undo; no comment; a warning, not a block, when
agents work on the issue; closing an already closed issue succeeds.

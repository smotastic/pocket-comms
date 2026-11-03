# Spec 015 — pocket-comms: mark started issues in progress and show them apart

- **Status:** `Done` — approved by the owner (2026-11-02); checked locally at 390 px with a fake Gitea on 2026-11-02
- **Changes:** [spec 006](../006-comms-gitea-issues/spec.md) (the issue list's order, requirement
  7), [spec 010](../010-comms-close-issues/spec.md) (the writes the app sends to Gitea,
  requirement 9) and [spec 012](../012-comms-flat-overview/spec.md) (the issues in the projects
  sheet)

## 1. Problem / intent (WHY)

The owner starts issues from pocket-comms with Implement with Claude (spec 006). Afterwards the
issue looks the same as every other open issue, in Gitea and in the app's lists: the only hint is a
small "is working on this" line inside the row. With several open issues the owner cannot see at a
glance which ones are already being worked on. This feature marks a started issue in Gitea with a
`status/in-progress` label and shows the issues that are being worked on in their own group, above
the ones that are not.

## 2. Scope

- **In scope:** adding the label when Implement with Claude starts, creating the label in the
  repository when it is missing, the rule that makes an issue "in progress", and two groups in the
  issue lists of the project screen and the projects sheet.
- **Out of scope:** removing the label (when an agent or worktree closes, or by hand), other
  status labels, filter tabs or search, Gitea project boards, assignees, labelling issues that New
  task (spec 005) starts without an issue, labelling issues started before this feature.

## 3. Requirements (WHAT)

### Marking an issue in progress

1. After Implement with Claude has created the task (spec 006 requirement 13), the server adds the
   label `status/in-progress` to the issue in Gitea. It keeps every other label of the issue.
2. The label is found among the repository's labels by its name in any case, so an existing
   `Status/In-Progress` is reused. When the repository has none, the server creates it with the
   name `status/in-progress`, the colour `#e3b341`, the description "Being worked on (set by
   pocket-comms)" and Gitea's exclusive flag (a scoped label, so a later `status/…` label replaces
   it).
3. An issue that already has the label gets no write.
4. Marking is best-effort. When it fails (no write access, Gitea unreachable, …) the task still
   counts as started and the answer says so: the worktree and agent stay, and the reason reaches
   the owner with the other notes of the start ("#<number> was not marked in progress: <reason>").
5. When the task itself fails, the issue is not marked.
6. The app never removes the label. A closed issue keeps it; the list only shows open issues.

### Which issues are in progress

7. An open issue is **in progress** when it has a label named `status/in-progress` (any case), or
   when a worktree of the project works on it (spec 006 requirement 15, with or without a live
   agent). The second part covers issues started by hand or before this feature.
8. The server says for each issue whether it is in progress; the browser does not decide it.

### Showing them apart

9. The project screen's issue list has two groups: **In progress** first, then **Open**, each with
   a header and its count. Inside a group the order of spec 006 requirement 7 holds (the most
   recently updated first). A group without issues is left out; with no open issues at all the
   list says "No open issues." as before.
10. The issues in a project of the projects sheet (spec 012) are grouped the same way.
11. Rows keep everything they show today (the agents that work on the issue, Implement with
    Claude, Close). The `status/in-progress` label is not shown as a tag, since the group already
    says it.
12. After Implement with Claude the issue lists are read again (as today), so the issue moves to
    In progress.

### Gitea access

13. The token's scopes stay `write:issue` and `read:repository` (spec 010 requirement 8). Creating
    the label needs write access to the repository's issues, which the owner of the repository
    has.
14. This widens spec 010 requirement 9: besides `GET`, the `PATCH` that closes an issue and the
    `POST` that creates one (spec 013), the app sends exactly two more kinds of write — a `POST`
    that creates the `status/in-progress` label in a repository, and a `POST` that adds that label
    to an issue. It sends no other write and no `DELETE`; it never replaces an issue's labels.
15. Spec 006's rules for the token (requirement 2) and for redirects apply to the new writes.

## 4. Acceptance criteria

- Given open issue #5 without labels and a repository that has the label `status/in-progress`,
  when the owner starts Implement with Claude on #5, then the task starts, Gitea receives one
  request that adds that label's id to #5 and none that creates a label, and after the lists are
  read again #5 shows under In progress.
- Given a repository without the label, when #5 is started, then Gitea receives one `POST` that
  creates `status/in-progress` (colour `#e3b341`, exclusive) and then the request that adds it.
- Given a repository with the label `Status/In-Progress`, when #5 is started, then that label is
  added and no label is created.
- Given #5 already labelled `status/in-progress`, when it is started again on another branch, then
  Gitea receives no label write.
- Given a token whose label write Gitea refuses with `403`, when #5 is started, then the server
  answers `201` with the started task and the note "#5 was not marked in progress: Gitea refused
  the token (403).", and the owner sees that note.
- Given a start that fails (for example the branch already exists), then Gitea receives no label
  write.
- Given open issues #7 (labelled `status/in-progress`), #6 (a worktree `feat/6-…`, no agent) and #5
  (neither), then the project screen shows In progress (2) with #7 and #6 in update order, then
  Open (1) with #5, and #7 shows no `status/in-progress` tag; the projects sheet groups them the
  same way.
- Given only issues that are not in progress, then the list shows only the Open group.
- Given any request, then no answer, log line or span contains the token, and the app never sends a
  `DELETE` or a request that replaces an issue's labels.
- Given the built app at 390 px with a fake Gitea, then both groups fit without horizontal
  scrolling on the project screen and in the projects sheet.

## 5. Notes

- Gitea API (version 28.2.0): `GET /repos/{owner}/{repo}/labels` (paged, `limit`/`page`) lists a
  repository's labels; `POST /repos/{owner}/{repo}/labels` with `CreateLabelOption`
  (`name`, `color`, `description`, `exclusive`) creates one and answers `201`;
  `POST /repos/{owner}/{repo}/issues/{index}/labels` with `{"labels":[<id>]}` adds labels and keeps
  the others (`PUT` on the same path would replace them, so it is never sent).
- Organisation labels are not looked at; a repository without its own label gets one.

## 6. Open questions

None. The owner's decisions of 2026-11-02 are folded in: a label rather than an assignee or a
board column; the name `status/in-progress`; the app never removes it; in progress means the label
or a worktree on the issue; two groups, In progress first, in both issue lists; a failed label
write does not fail the start but is reported.

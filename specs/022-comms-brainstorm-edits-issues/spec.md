# Spec 022 — pocket-comms: the brainstorm chat edits existing issues

- **Status:** `Done` — approved by the owner (2026-11-04), implemented in the pull request for Gitea #44
- **Changes:** [spec 013](../013-comms-brainstorm-chat/spec.md) (requirements 10 and 11: Pi's
  tools; the out-of-scope "editing issues"; the app's Gitea writes gain an issue's title and body)
- **Issue:** Gitea #44

## 1. Problem / intent (WHY)

The brainstorm chat files ideas only as new issues. Often an idea belongs to an issue that
already exists: the owner asked Pi to change orchestrator-mode issue #11 so that it controls
agents from this chat. Pi found the issue by its title but could not read its body or change it.
The owner had to copy the text by hand, or a near-duplicate issue would have been filed.

This feature lets Pi read an existing issue and propose a new title and body for it. As with new
issues, nothing changes in Gitea until the owner approves, and an approved edit never silently
overwrites a change someone else made in the meantime.

## 2. Scope

- **In scope:** a tool that reads one issue's title and body; a tool that proposes an edit to an
  issue Pi has read; a card on which the owner edits, applies or discards the edit, and compares
  it with the current version; a check that the issue did not change since Pi read it; and the API
  behind it.
- **Out of scope:** an issue's comments, labels, state, assignees or milestone; pull requests;
  an "overwrite anyway" action; a line diff; editing an issue outside the brainstorm chat.

## 3. Requirements (WHAT)

### Reading an issue

1. Pi can read one issue of a project on Gitea by the project's name and the issue's number:
   its title, its body, whether it is open or closed, and its page. Open and closed issues can
   be read; a pull request, a number with no issue, or a project without a Gitea repository is
   refused with a reason.
2. A body longer than 20,000 characters is cut for Pi, which is told so.
3. The chat remembers the title and body of the last read of each issue. This survives a server
   restart and ends with New chat.

### Proposing an edit

4. Pi proposes an edit with the project, the issue's number, and the issue's full new title and
   body. The proposal ends Pi's turn, like an issue proposal.
5. Pi can propose an edit only for an issue it read in this chat, and only when the read body
   was not cut. Otherwise the tool refuses and tells Pi why.
6. The proposal keeps the title and body Pi read (the **base**) next to the proposed ones. A
   blank title, or a title or body over Gitea's limits (spec 013, requirement 17), is refused.
7. Pi is told that it edits an issue only by proposing the edit, that it must send the whole
   body, and that it keeps the parts of the body the edit is not about.

### The edit card

8. An edit proposal shows in the conversation as a card with the project and the issue's number
   (fixed, linking to the issue), the proposed title and body (each editable), the base under a
   collapsed **Current version**, and two actions: **Apply edit** and **Discard**.
9. **Apply edit** first reads the issue again. When its title or body differs from the base, the
   issue is not changed: the request is refused with an `issue-changed` problem, and the card
   stays open and says that the issue changed since Pi read it. A new comment or label does not
   count as a change.
10. Otherwise the issue's title and body become exactly the shown ones; nothing else of the issue
    changes. Only when Gitea has saved them does the card show "Issue #N updated" with a link to
    it, and Pi is told the issue was updated. The remembered read becomes the new version.
11. **Discard** changes nothing in Gitea. The card shows that it was discarded, and Pi is told
    the owner declined the edit.
12. An edit proposal is decided once and follows spec 013, requirements 15, 16, 18 and 20: a
    second decision is refused, an open card stays open while the owner chats, a Gitea failure
    keeps the card open with the reason, and a missing Gitea token is named.
13. An issue that no longer exists, or a project that lost its Gitea repository, is refused when
    applying, and the card stays open with the reason.
14. A decision that does not fit the proposal (creating an issue from an edit proposal, or
    applying an edit to an issue proposal) is refused as invalid input.

### What stays

15. Issue proposals, the conversation and New chat work as in spec 013. A chat saved before this
    feature loads unchanged, and its proposals are issue proposals.
16. Pi still has no tool that writes: only the owner's decision changes an issue. Every route
    goes through the Tailscale identity guard; the Gitea token never reaches the browser or a log.

## 4. Acceptance criteria

- Given `pocket-comms` issue #11, when Pi reads it, then it gets the issue's title, body, state
  and page; given a pull request's number, then the tool refuses.
- Given Pi did not read issue #11 in this chat, when it proposes an edit to it, then the tool
  refuses and no card shows.
- Given Pi read #11 and proposes a new body, then a card shows #11 with the proposed title and
  body, and Current version holds the body Pi read.
- Given that card, when the owner changes the title and taps Apply edit, then Gitea gets one
  `PATCH` of #11 with exactly the shown title and body, the card shows "Issue #11 updated" with
  a link, and Pi's next answer knows it was updated.
- Given someone edits #11's body in Gitea after Pi read it, when the owner taps Apply edit, then
  Gitea gets no `PATCH`, the API answers `issue-changed`, and the card stays open with the reason.
- Given someone comments on #11 after Pi read it, when the owner taps Apply edit, then the edit
  is applied.
- Given an open edit card, when the owner taps Discard, then Gitea gets no request and Pi is told.
- Given a decided edit card, when a second decision arrives, then the API answers
  `proposal-decided` and Gitea gets no request.
- Given a chat file saved before this feature, when the server starts, then the chat and its
  proposals show as before.
- Given a phone at 390 px width, then the edit card fits without sideways scrolling.

## 5. Notes

- **Why the base is Pi's read, not the issue at proposal time:** the check then also catches a
  change made while Pi was writing its proposal.
- **Why title and body, not Gitea's update time:** a comment or a label also changes the update
  time, and neither is touched by the edit.
- The check and the write are two requests; Gitea has no conditional update. A change made in
  the moment between them is not caught. The owner accepted this.
- Gitea's update is `PATCH /repos/{owner}/{repo}/issues/{index}` with only `title` and `body`.
- **The new entry in the chat's state** is a breaking change to the OpenAPI diff gate: a reader of
  `GET /api/v1/brainstorm` meets a proposal kind it did not know. The web app is the only reader
  and ships with the server, so the owner accepted it in `.pocket-ci/openapi-accepted-changes.txt`
  (2026-11-04). The line goes once `master` carries the change.
- **Owner's decisions of 2026-11-04:** compare title and body; refuse on a change, with no
  overwrite; editable fields plus a collapsed current version, no diff; full title and body, both
  required; open and closed issues, no pull requests, no comments; the base is Pi's last read in
  this chat; the existing decide route.

## 6. Open questions

None.

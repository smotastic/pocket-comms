# Spec 021 — pocket-comms: additional information when implementing an issue

- **Status:** `Approved` — approved by the owner (2026-11-04)
- **Changes:** [spec 006](../006-comms-gitea-issues/spec.md) (requirements 10 and 13: the
  Implement with Claude sheet and the task an issue gives the agent)
- **Issue:** smotastic/pocket-comms#48

## 1. Problem / intent (WHY)

Implement with Claude starts an agent with the issue as its first prompt. Often the owner wants to
add something for this one run: a hint, a constraint, a file to look at first. Today they must
edit the issue in Gitea, which changes it for everyone and for later runs, or send a follow-up
message after the agent has already started on the plain issue.

## 2. Scope

- **In scope:** an optional multi-line **Additional information** field in the Implement with
  Claude sheet, and its place in the agent's first prompt.
- **Out of scope:** writing the text to Gitea, remembering it between launches, the New task
  sheet of spec 005, other agent kinds.

## 3. Requirements (WHAT)

1. The Implement with Claude sheet has an optional multi-line **Additional information** field
   next to the branch field, empty when the sheet opens.
2. The field takes at most 4 000 characters. Longer text answers `422` with an issue on the
   `additionalInformation` field, and nothing is created.
3. Text that is empty or only whitespace counts as none: the task is exactly the task of spec
   006, requirement 13.
4. Other text, with its outer whitespace trimmed, its line breaks kept and `\r\n` as `\n`, goes
   into the task between the issue's body and its reference:

   ```text
   <title>

   <body>

   ## Additional information

   <additional information>

   Gitea issue #<number>: <issue URL>
   Implement this issue. Write "Closes #<number>" in the pull request description.
   ```

   An empty body leaves out its paragraph, as before.

5. The additional information is never cut. When the task would be longer than 20 000
   characters, the issue's body is cut as in spec 006, requirement 13, to make room for it.
6. The issue in Gitea is not changed by the text, and the app does not store it: it lives only in
   the agent's first prompt.
7. The field belongs to one issue's sheet: opening the sheet for another issue, or again after
   closing it, starts with an empty field. A failed start keeps the text, as it keeps the branch.

## 4. Acceptance criteria

- Given an issue and the additional information "Use the TextArea.\n\nKeep it small.", when the
  owner starts Claude, then the agent's first prompt holds the issue's title and body, then
  "## Additional information" and that text with its blank line, then the issue's reference.
- Given an empty or whitespace-only field, when the owner starts Claude, then the first prompt is
  the same as before this spec.
- Given text entered for issue #1, when the owner closes the sheet and opens it for issue #2, then
  the field is empty and #2's first prompt has no additional information.
- Given a body of 30 000 characters and 1 000 characters of additional information, then the
  task is at most 20 000 characters, the body ends with the cut note, and the additional
  information is whole.
- Given 4 001 characters of additional information, then the start answers `422` on
  `additionalInformation` and no worktree is created.

## 5. Notes

- **Owner's decisions of 2026-11-04:** the section goes before the issue's reference, so
  "Implement this issue" stays the last line; a Markdown `## Additional information` heading, as
  issue bodies use; a cap of 4 000 characters, with the body cut first.

## 6. Open questions

None.

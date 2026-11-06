# Spec 025 — pocket-comms: suggested replies and the owner's quick replies

- **Status:** `Done` — approved by the owner (2026-11-06)
- **Changes:** [spec 024](../024-comms-typed-answers/spec.md) (requirement 1: the fixed quick
  replies become the owner's)
- **Issue:** smotastic/pocket-comms#37

## 1. Problem / intent (WHY)

Driving agents from a phone often means sending short, predictable answers. When an agent asks
"Do you approve?" or offers a numbered choice, the owner still has to type the answer. Spec 024
added two fixed quick replies, but the owner cannot change them to their own frequent answers or
wording.

pocket-comms should offer the replies the latest agent message clearly calls for with one tap,
and let the owner keep their own list of quick replies.

## 2. Scope

- **In scope:** suggested replies worked out from the latest agent message by fixed rules; the
  owner's quick replies, kept by the server, edited on a Settings page; the API for both.
- **Out of scope:** suggestions worked out by a language model; suggestions in the Screen view or
  while the agent is `blocked`; drag and drop; quick replies per project or per agent; answering
  the approval dialog of a blocked agent with a suggestion.

## 3. Requirements (WHAT)

### Suggested replies

1. The server works out the suggested replies of every assistant message by these rules, in
   order, and attaches them to the message:
   1. **Choices.** A list of 2 to 4 items numbered `1.`/`1)` or lettered `A.`/`A)`/`a)` suggests
      its items, each without its number and its Markdown emphasis, when every item is at most 60
      characters. The list must be the end of the message, or be followed only by a question.
   2. **Approval.** Otherwise, when the message ends with a question that asks for approval or
      leave to go on (such as "Do you approve?", "Shall I proceed?", "Should I go ahead?", "Want
      me to …?", "Does this look good?", "OK?") and contains no " or ", it suggests **Approved**
      and **No, revise**.
   3. Otherwise it suggests nothing: the app hides suggestions when the expected answer is unclear.
2. The Chat view shows the suggestions of the latest entry as a **Suggested replies** row of chips,
   each with a sparkle icon, above the quick replies, only when that entry is an assistant message
   and the agent is `idle` or `done`. The Screen view and a `blocked` or `working` agent show none.
3. Tapping a suggestion sends its text at once as a prompt, as the composer would (spec 004,
   requirement 13), without opening the keyboard. Suggestions cannot be tapped while a send is
   under way, and after a successful send the row is hidden until a newer assistant message
   arrives, so a suggestion is sent once and never answers an older message.
4. A suggestion never presses a key and never types into a waiting dialog; the keys and the field
   of spec 024 stay the only way to answer a `blocked` agent.

### The owner's quick replies

5. The server keeps one list of quick replies for every conversation. Until the owner first
   saves one, it is **Go ahead** and **Commit and open a PR** (spec 024).
6. The Chat and the Screen view show the owner's quick replies, in their order, as the **Quick
   replies** row of spec 024, and tapping one sends or types it as spec 024 says (requirements 2
   and 3). An empty list shows no row.
7. The overview's top bar has a **Settings** button that opens the Settings page. Its **Quick
   replies** section lists the replies and lets the owner add one, edit one, delete one and move
   one up or down. Each change is saved at once; a failed save shows its reason and the list
   goes back to the saved one.
8. A quick reply is trimmed, has no line breaks or other control characters, is not blank and is
   at most 200 characters. The list holds at most 20 replies, and no two are the same. A list
   that breaks a rule answers `422` and nothing is saved.
9. The quick replies outlive a restart of the server and a reload of the app.

## 4. Acceptance criteria

- Given an idle agent whose latest message ends "Do you approve?", then the Chat view shows the
  suggestions **Approved** and **No, revise**; tapping **Approved** sends `agent.prompt` with
  `text: "Approved"` once, and the suggestions are gone.
- Given a message ending with "1. SQLite\n2. Postgres\n\nWhich one?", then the suggestions are
  **SQLite** and **Postgres**.
- Given a message ending "Should I use SQLite or Postgres?", then there are no suggestions.
- Given a message without a question or a list, then there are no suggestions.
- Given a `blocked` or `working` agent, or the Screen view, then no suggestions show.
- Given the owner adds "Run the tests first" on the Settings page, then it shows as a quick
  reply in the Chat view, and tapping it sends that text once.
- Given the owner moves a reply up, edits one or deletes one, then the quick replies show the new
  list, and it is still there after the server restarts and the app reloads.
- Given 21 replies, a reply of 201 characters, a blank one or two equal ones, then saving answers
  `422` and the saved list stays.
- Given a server without saved replies, then the quick replies are **Go ahead** and **Commit and
  open a PR**.
- Given a phone at 390 px width, then the suggestions, the quick replies and the Settings page fit
  without sideways scrolling, and axe finds no violations.

## 5. Notes

- **Owner's decisions of 2026-11-06:** the list is kept by the server, not the browser; fixed
  rules in the domain, not a language model; the two fixed replies of spec 024 become the default
  list; suggestions only in the Chat view while the agent is idle or done; the editor lives on a
  Settings page opened from the overview; move up and down instead of drag and drop; at most 20
  replies of at most 200 characters, no duplicates; suggestions in their own row with a sparkle
  icon.
- The suggestions travel on the assistant entries, so the live stream updates them with the
  entries; the new optional field and the new endpoints add OpenAPI diff lines, accepted in
  `.pocket-ci`.

## 6. Open questions

None.

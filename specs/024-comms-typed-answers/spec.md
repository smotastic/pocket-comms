# Spec 024 — pocket-comms: typed answers and quick replies

- **Status:** `Approved` — approved by the owner (2026-11-06)
- **Changes:** [spec 004](../004-pocket-comms-v1/spec.md) (requirements 13 to 15: the composer,
  the approval panel and the terminal view's keys) and
  [spec 017](../017-comms-activity-timeline/spec.md) (what the timeline records)
- **Issue:** smotastic/pocket-comms#40

## 1. Problem / intent (WHY)

While an agent waits for an answer, the conversation offers only the key buttons. The owner can
pick an offered option, but cannot type a different answer, such as Claude's "Type something" /
Other answer, or explain their view. They have to leave pocket-comms for the terminal to do it.

Some replies also come up again and again, such as "Go ahead". pocket-learning offers its fixed
questions as one-tap chips (its spec 008, requirement 15); pocket-comms should offer its common
replies the same way.

## 2. Scope

- **In scope:** a text field that types into the waiting dialog, in the Chat and the Screen view;
  fixed quick reply chips in both views; the API that types text without submitting it; the
  timeline's record of typed text.
- **Out of scope:** reading a dialog's options from the screen or the transcript, quick replies
  the owner edits, images in a typed answer, and answering a question from the question card of
  spec 009.

## 3. Requirements (WHAT)

### Quick replies

1. The Chat and the Screen view show the quick replies **Go ahead** and **Commit and open a PR**
   as chips above the text field, whatever the agent's status.
2. While the agent is not `blocked`, tapping a quick reply sends it at once as a prompt, as the
   composer would (spec 004, requirement 13). Quick replies cannot be tapped while a send is under
   way.
3. While the agent is `blocked`, tapping a quick reply types it into the waiting dialog, as
   requirement 5 does with typed text.

### Typing into a waiting dialog

4. While the agent is `blocked`, the key buttons stay as they are (spec 004, requirements 14 and
   15), and the text field below them is labelled **Type into the dialog** in place of the hint
   "Answer above to continue" or "Answer with the keys". It attaches no images.
5. Sending from that field **types** the text into the agent's terminal and never presses Enter:
   the owner checks the screen and submits with the `Enter` key. Typing never answers, approves or
   submits a dialog by itself.
6. A hint under the field says: "Choose Type something or Other with the keys first, then press
   Enter to submit." A digit or a letter typed into a menu may still pick an option there; the
   app does not read the dialog to prevent this.
7. Typed text is trimmed, each line break, carriage return or tab becomes one space, other
   control characters (such as Escape or Ctrl-C) are dropped, and it must not be blank. It takes
   at most 2 000 characters; longer text answers `422` on the `text` field, and nothing is typed.
8. A successful type clears the field. A failed one shows its reason and keeps the text (spec 004,
   requirement 16).
9. When the agent stops being `blocked`, the field goes back to the composer, and its draft stays.

### Timeline

10. The timeline records typed text as a **typed** event with its first 80 characters, as it
    records a prompt's first line (spec 017), and shows it as "You typed: <excerpt>".

## 4. Acceptance criteria

- Given an idle agent, when the owner taps **Go ahead** in the Chat view, then the server sends
  `agent.prompt` with `text: "Go ahead"`.
- Given a `blocked` agent in the Screen view, when the owner types "Use SQLite instead" and sends,
  then the server sends `pane.send_text` with that text to the agent's pane, sends no Enter, and
  the field clears.
- Given a `blocked` agent, when the owner taps **Commit and open a PR**, then the server sends
  `pane.send_text` with that text and no prompt.
- Given a `blocked` agent, when the owner sends "line one\nline two", then the text typed is
  "line one line two".
- Given 2 001 characters, then the request answers `422` on `text` and nothing is typed.
- Given a `blocked` agent in the Chat view, then the key buttons, the quick replies and the field
  **Type into the dialog** show, and no attach button.
- Given typed text "Use SQLite instead", then the timeline shows "You typed: Use SQLite instead".
- Given a phone at 390 px width, then the chips, the keys and the field fit without sideways
  scrolling.

## 5. Notes

- **Owner's decisions of 2026-11-06:** type first, then Enter, never in one tap; quick replies
  are fixed, in both views and always shown; a hint instead of reading the screen; the typed
  text is recorded in the timeline; the issue's Chat view part (#37) is covered here too.
- Herdr's `agent.prompt` refuses a `blocked` agent (`agent_blocked`), so typing uses
  `pane.send_text`, which writes literal text and no Enter.
- The new timeline event adds a variant to the activity response; the OpenAPI diff line is
  accepted in `.pocket-ci`, as for spec 022.

## 6. Open questions

None.

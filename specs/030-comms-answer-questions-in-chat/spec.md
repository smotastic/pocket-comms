# Spec 030 — pocket-comms: answer Claude's questions in the chat

- **Status:** `Approved` — approved by the owner (2026-11-18), with the amendment of
  section 7 (2026-11-18)
- **Changes:** [spec 009](../009-comms-questions-in-chat/spec.md) (answering from the question
  card and the options that were not chosen, both out of scope there),
  [spec 024](../024-comms-typed-answers/spec.md) (what the Chat view shows while an agent is
  `blocked`) and [spec 017](../017-comms-activity-timeline/spec.md) (what the timeline records)

## 1. Problem / intent (WHY)

When Claude asks the owner something with its `AskUserQuestion` tool, the Chat view shows
Claude's terminal screen, wrapped, with the key buttons. The owner answers a multiple-choice dialog
by reading terminal text on a phone and pressing digits, arrows and Enter. A grilling session asks
many such questions in a row, so the owner spends most of it in the terminal view instead of the
chat.

This feature lets the owner answer a waiting `AskUserQuestion` call from its question card in the
chat by tapping its options.

## 2. Scope

- **In scope:** Claude's waiting `AskUserQuestion` calls with one or several questions, each
  question with a single or a multiple choice; the options in the API's transcript entry; an API
  that answers a waiting call; the question card's options and its **Send answers** button; the
  Chat view while such a call waits; the timeline's record of an answer.
- **Out of scope:** typed answers and Claude's "Type something" / Other choice (the field **Type
  into the dialog** of spec 024 stays the way to give them), Pi agents, the Screen view, answering
  through a Claude Code hook (a hook only tells the server which call waits, section 7), and calls
  that ended already.

## 3. Requirements (WHAT)

### The transcript

1. The API's transcript entry of an `AskUserQuestion` call carries, for each question, its
   options (each with its label and, when given, its description) and whether it is a multiple
   choice. The fields are compatible: a client that does not know them still shows the card of
   spec 009. The OpenAPI document describes them.

### The question card

2. While a Claude agent's latest transcript entry is a waiting `AskUserQuestion` call, whatever
   status Herdr reports, the card of that call is **answerable**: under each question it lists
   the question's options, in order, each with its label and its description.
3. In a single-choice question, tapping an option chooses it and unchooses any other. In a
   multiple-choice question, tapping an option toggles it.
4. The card's **Send answers** button can be tapped once every question has at least one chosen
   option. Nothing reaches the agent before it is tapped.
5. After a successful send, the card shows each question's chosen labels (several joined with
   ", ") marked **Sent**, and its options can no longer be tapped. Once the transcript records the
   call's result, the card of spec 009 shows it.
6. A failed send shows its reason (spec 004, requirement 16) and keeps the chosen options. When
   the call is no longer waiting on the agent's screen, the reason says so: "This question was
   answered or moved on. Check the Screen view."
7. Any other card is shown as in spec 009, without options to tap.

### The Chat view

8. While the card is answerable, the Chat view shows it in place of the agent's wrapped screen.
   The key buttons stay under the closed **Controls**, and the field **Type into the dialog**
   stays below them (spec 024), so the owner can still answer by keys or by typing.

### The answer API

9. An API call answers a waiting call. It names the call by its transcript entry and gives, for
   each question in order, the indexes of the chosen options.
10. The server answers `409` and presses nothing when the agent is not a Claude agent, when the named call is not its latest transcript entry or has a result already, or
    when the agent's screen does not show the call's question.
11. The server answers `422` and presses nothing when the answers do not match the call: a
    different number of questions, no chosen option, more than one for a single choice, an index
    out of range, or the same index twice.
12. Otherwise the server presses the keys that choose each answer in Claude's dialog and submit
    it, in one go, as the owner would at the terminal.

### Timeline

13. The timeline records an answer as an **answered** event with the first 80 characters of its
    chosen labels (each question's labels joined with ", ", the questions joined with "; "), and
    shows it as "You answered: <excerpt>".

## 4. Acceptance criteria

- Given a Claude agent whose latest entry is a waiting call asking "Can you undo an
  accepted item?" with the options "Yes, until the page changes again" and "No undo", when the
  Chat view loads, then the card lists both options with their descriptions and **Send answers**
  cannot be tapped, and the wrapped screen does not show.
- Given that card, when the owner taps "No undo" and **Send answers**, then the server presses the
  keys that choose the second option and submit, and the card shows "No undo" marked **Sent**.
- Given a call with two questions, the second a multiple choice, when the owner chooses one
  option in the first and two in the second and sends, then the server presses the keys for all
  three choices and Claude's submit in one go.
- Given a call whose question text is not on the agent's screen, when the owner sends, then the
  request answers `409`, no key is pressed, and the card shows "This question was answered or
  moved on. Check the Screen view." with the options still chosen.
- Given answers with two indexes for a single-choice question, then the request answers `422` and
  no key is pressed.
- Given a waiting call that is not the agent's latest entry, then its card shows no options to
  tap.
- Given an agent that Herdr reports `done` while its waiting call shows in the hook's file, then
  the card lists the call's options.
- Given a sent answer "No undo", then the timeline shows "You answered: No undo".
- Given a phone at 390 px width and a call with four options with long descriptions, then the
  card wraps and nothing scrolls sideways.
- Checked live against Claude Code with a single choice, a multiple choice and a call with several
  questions.

## 5. Notes

- **Owner's decisions of 2026-11-18:** keys into Claude's dialog, not a Claude Code hook;
  single choice, multiple choice and several questions in the first version, typed answers not;
  the card replaces the wrapped screen while it can be answered; answers are collected in the
  card and sent with one tap; the server checks the screen before it presses anything; a sent
  card shows its answers as **Sent**; the answer is recorded in the timeline.
- ~~Claude Code writes the call's `input.questions` on the assistant line before the owner
  answers.~~ Wrong for Claude Code v2.1.323: it writes the call only once it is answered or
  cancelled, so the session file never shows a waiting call (section 7).
- Claude's dialog adds choices of its own after the call's options (such as "Type something"); the
  options' indexes count the call's options only. Which keys choose, toggle and submit is Claude
  Code's dialog behaviour and is settled in the plan against the live dialog.
- The key presses may need more keys than the keys API offers (digits above 3, more than eight
  presses); the answer API is a separate call and does not widen the keys API.
- The new timeline event adds a variant to the activity response; the new transcript fields and
  the new endpoint change the OpenAPI document. The OpenAPI diff line is accepted in `.pocket-ci`,
  as for spec 024.
- The look comes from the design kit (`@smotastic/pocket-design`, ADR 0009). A component the kit
  lacks, such as a choosable option, is added in pocket-factory's `packages/design` and taken here
  as a catalog bump.

## 6. Open questions

None.

## 7. Amendment of 2026-11-18: the waiting call comes from a Claude Code hook

The first version never showed an answerable card live. Claude Code v2.1.323 writes an
`AskUserQuestion` call to the session file only after it is answered or cancelled, and Herdr
reports the waiting agent as `done`, not `blocked`. The owner chose a Claude Code hook as the
source of the waiting call; the card, the answer API and the keys stay as they are.

14. A hook script ships with the server. On Claude's `PreToolUse` for `AskUserQuestion` it writes
    the call (its session id, its tool use id and its questions) to a file of that session in the
    server's state folder (`questions/`, readable by the owner only). On `PostToolUse` for
    `AskUserQuestion` and on `Stop`, it removes the session's file. It never blocks or changes
    Claude: it prints nothing and always exits `0`, also on input it cannot read.
15. While a Claude session's file in `questions/` names a call that the session file does not
    hold yet, the transcript ends with that call as a waiting entry with its questions. Once the
    session file holds the call (answered or cancelled), the session file's entry is shown, and a
    file left behind is ignored. A live transcript shows the waiting entry within one check of the
    hook's write.
16. The screen check of requirement 10 reads a question that Claude draws behind a bar (`│`)
    and next to an option's preview box, as in the owner's report.
17. The hook is set up once per machine in the owner's Claude settings (`~/.claude/settings.json`).
    Without it, the app behaves as before this spec: no answerable card.

- Given a session whose file has no call `toolu_1` and a hook file naming `toolu_1` with the
  question "Pick a color?", then the transcript's latest entry is `toolu_1`, waiting, with that
  question and its options.
- Given the same hook file and a session file that holds `toolu_1` with its answer, then the
  transcript shows the answered entry once and no waiting one.
- Given the hook's `PreToolUse` input, then the session's file holds the call; given its
  `PostToolUse` or `Stop` input, then the file is gone; given input that is not JSON, then nothing
  is written and the hook exits `0`.
- Checked live: a dialog with previews and four questions, as in the owner's report, shows its
  card in the Chat view.

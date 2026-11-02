# Spec 009 — pocket-comms: an agent's questions in the chat

- **Status:** `Done` — approved by the owner (2026-11-02); checked locally at 390 px against the live Herdr on 2026-11-02
- **Changes:** [spec 004](../004-pocket-comms-v1/spec.md) (the chat's tool lines)

## 1. Problem / intent (WHY)

When Claude asks the owner something with its `AskUserQuestion` tool, the chat shows one line,
"Used AskUserQuestion ✓". The owner cannot see later what was asked or what they answered, so the
agent's next message ("Got it. I'll do that once…") has no context on the phone.

This feature shows each question and the chosen answer in the chat.

## 2. Scope

- **In scope:** Claude's `AskUserQuestion` calls in the transcript, the API's transcript entry for
  them, the chat's look for them, and the activity line while a question waits.
- **Out of scope:** answering a question from the chat (the approval keys stay the way to answer),
  the options that were not chosen, Pi agents, and other tools.

## 3. Requirements (WHAT)

1. The chat shows a Claude `AskUserQuestion` call as a **question card** instead of a tool
   line. It holds each question of the call, in order, with its short header and its text.
2. Once answered, each question shows the chosen answer: the option's label, several labels joined
   with ", " for a multiple choice, or the text the owner typed for "Other".
3. While the call waits, the entry shows its questions with "Waiting for your answer".
4. A call that ends without answers (declined, interrupted or failed) shows its questions with
   "Not answered".
5. While a working agent's latest entry is a waiting question, the activity line says
   "Waiting for your answer…".
6. The API's transcript carries the questions, their headers and their answers on the call's
   entry, compatibly: a client that does not know them still shows the tool line. The OpenAPI
   document describes them.
7. A question or an answer is shown as plain text, never as Markdown, and wraps instead of being
   cut.

## 4. Acceptance criteria

- Given a session whose `AskUserQuestion` call asked "Keep the Nx monorepo setup?" (header
  "Monorepo") and the owner chose "Keep Nx", when the chat loads, then it shows "Monorepo", the
  question and "Keep Nx", and no "Used AskUserQuestion" line.
- Given a call with two questions, one a multiple choice answered with "Backend" and "Web", then
  both questions show in order and the second answer reads "Backend, Web".
- Given a call without a result yet, then its questions show with "Waiting for your answer".
- Given a call whose result is an error, then its questions show with "Not answered".
- Given a phone at 390 px width and a 300-character question, then the question wraps and nothing
  scrolls sideways.

## 5. Notes

- Claude Code writes the call's `input.questions` (`question`, `header`, `options`, `multiSelect`)
  on the assistant line, and on the result line a `toolUseResult` with `questions` and `answers`,
  an object from each question's text to the chosen answer (several labels already joined with
  ", "). The result's text content repeats them for the model and is not parsed.
- A result without `answers` but without an error counts as answered with no answer known; the
  entry then shows its questions with "Answered".
- The look comes from a design system component (`packages/design`); the app draws nothing of
  its own.

## 6. Open questions

None.

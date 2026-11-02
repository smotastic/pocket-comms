# Plan 009 — pocket-comms: an agent's questions in the chat

- **Spec:** [spec.md](./spec.md)
- **Status:** `Approved` — approved by the owner with the spec (2026-11-02)

## 1. Affected projects

| Path                            | Change                                                                                                             | Nx tags                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| `packages/comms/domain`         | `TranscriptEntry` gains the `question` entry; `activityOf` says "Waiting for your answer…" for a waiting one       | `scope:comms`, `layer:domain`         |
| `packages/comms/infrastructure` | `entryLog` finds questions by id and answers them; the Claude parser turns `AskUserQuestion` into a question entry | `scope:comms`, `layer:infrastructure` |
| `packages/comms/contract`       | `TranscriptEntry` gains the `question` member                                                                      | `scope:contracts`                     |
| `apps/comms-server`             | OpenAPI document regenerated                                                                                       | `scope:comms`, `type:app`             |
| `packages/design/ui`            | New `QuestionCard`: each question's header, text and answer, or a muted state line; story, spec                    | `scope:design`, `type:ui`             |
| `apps/comms-web`                | `Conversation.tsx` renders a question entry with `QuestionCard`                                                    | `scope:comms`, `type:web`             |

### Shapes

- **Domain.** `{ type: 'question', id, at, questions: ReadonlyArray<{ header?, text, answer? }>,
outcome: 'pending' | 'answered' | 'unanswered' }`.
- **Parser.** The `tool_use` named `AskUserQuestion` adds a question entry from `input.questions`
  (pending). Its `tool_result` sets `unanswered` on `is_error`, else `answered` with each answer
  taken from `toolUseResult.answers[question text]`.
- **Design.** `QuestionCard` takes `questions` and a `state` (`waiting`, `answered`,
  `unanswered`). Each question is a header tag, the text and, when answered, the answer after an
  arrow; plain text that wraps.

## 2. Contract changes

Additive within `/api/v1`: one more member of the `TranscriptEntry` union. The web app is the only
client.

## 3. Migrations

None.

## 4. Test strategy

- **Domain:** `activityOf` with a waiting and an answered question.
- **Adapter:** the Claude parser with a pending, an answered (single, multiple, typed), and an
  errored call; the session fixture gains an answered call.
- **Contract:** the transcript schema decodes a question entry; OpenAPI check and lint.
- **Design:** `QuestionCard` roles, text, the three states, axe.
- **Web:** `conversation.spec.tsx` shows a question and its answer and no "Used AskUserQuestion".

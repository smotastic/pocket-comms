# Plan 009 — pocket-comms: an agent's questions in the chat

- **Spec:** [spec.md](./spec.md)
- **Status:** `Done` — approved by the owner with the spec (2026-11-02); checked locally at 390 px against the live Herdr on 2026-11-02

## 1. Affected projects

| Path                            | Change                                                                                                      | Nx tags                               |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `packages/comms/domain`         | The `tool` entry gains optional `questions`; `activityOf` says "Waiting for your answer…" for a waiting one | `scope:comms`, `layer:domain`         |
| `packages/comms/infrastructure` | The Claude parser fills `questions` for `AskUserQuestion`; `entryLog.finish` sets their answers             | `scope:comms`, `layer:infrastructure` |
| `packages/comms/contract`       | The `tool` member of `TranscriptEntry` gains optional `questions`                                           | `scope:contracts`                     |
| `apps/comms-server`             | OpenAPI document regenerated                                                                                | `scope:comms`, `type:app`             |
| `packages/design/ui`            | New `QuestionCard`: each question's header, text and answer, or a muted state line; story, spec             | `scope:design`, `type:ui`             |
| `apps/comms-web`                | `Conversation.tsx` renders a tool entry with questions as a `QuestionCard`                                  | `scope:comms`, `type:web`             |

### Shapes

- **Domain.** The `tool` entry gains `questions?: ReadonlyArray<{ header?, text, answer? }>`. The
  call's outcome is the question's state: `pending` waits, `ok` is answered, `error` was never
  answered.
- **Parser.** `AskUserQuestion` is summarised as `Used AskUserQuestion` with `questions` from
  `input.questions`. Its `tool_result` sets each answer from `toolUseResult.answers[question text]`.
- **Design.** `QuestionCard` takes `questions` and a `state` (`waiting`, `answered`,
  `unanswered`). Each question is a header tag, the text and, when answered, the answer after an
  arrow; plain text that wraps.

## 2. Contract changes

Additive within `/api/v1`: an optional `questions` field on the `tool` entry. A first draft added a
`question` member to the `TranscriptEntry` union; `pnpm openapi:diff` rightly rejects a new
response union member as breaking, so the questions ride on the tool entry instead and an older
client keeps showing the tool line.

## 3. Migrations

None.

## 4. Test strategy

- **Domain:** `activityOf` with a waiting and an answered question.
- **Adapter:** the Claude parser with a pending, an answered (single, multiple, typed), and an
  errored call; the session fixture gains an answered call.
- **Contract:** the transcript schema decodes a question entry; OpenAPI check and lint.
- **Design:** `QuestionCard` roles, text, the three states, axe.
- **Web:** `conversation.spec.tsx` shows a question and its answer and no "Used AskUserQuestion".

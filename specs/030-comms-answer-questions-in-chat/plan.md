# Plan 030 — pocket-comms: answer Claude's questions in the chat

- **Spec:** [spec.md](./spec.md)
- **Status:** `Approved` — approved with the spec by the owner (2026-11-18), section 7 with
  the amendment (2026-11-18)

## 1. Affected projects

| Path                            | Change                                                                                                                                                                                                                      | Nx tags                               |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `packages/comms/domain`         | `transcript.ts`: `Question` gains `options` and `multiple`. A new `answer.ts`: `answerKeys`, `showsQuestion`, `answerExcerpt`. `input.ts`: `DialogKey` (the app's keys and `4`). `activity.ts`: the `answered` event.       | `scope:comms`, `layer:domain`         |
| `packages/comms/application`    | `HerdrOutbound.sendKeys` takes `DialogKey`s. `Input.answer` checks the call, the status and the screen, presses the keys and records `answered`. `QuestionNotWaitingError`. The fakes follow.                               | `scope:comms`, `layer:application`    |
| `packages/comms/infrastructure` | `transcript/claude.ts` reads each question's `options` (`label`, `description`) and `multiSelect`. The socket adapter sends `4` as Herdr's key name, as the other digits. The activity file store keeps `answered` events.  | `scope:comms`, `layer:infrastructure` |
| `packages/comms/contract`       | `Question` gains optional `options` and `multiple`; `AnswerRequest` and `POST /agents/:agent/answer`; the `answered` `ActivityEvent`, added last.                                                                           | `scope:comms`, `type:contract`        |
| `packages/comms/api`            | The `answer` handler maps `QuestionNotWaitingError` to `409` and the others as the `keys` handler does.                                                                                                                     | `scope:comms`, `layer:api`            |
| `apps/comms-web`                | `CommsClient.answer`; `QuestionCard` gains an answerable mode with one `ChoiceList` per question and **Send answers**; `Chat` and `Conversation` show it in place of the wrapped screen; "You answered: …" in the timeline. | `scope:comms`, `type:app`             |
| `apps/comms-server`             | The regenerated OpenAPI document.                                                                                                                                                                                           | `scope:comms`, `type:app`             |
| `packages/comms/AGENTS.md`      | Names spec 030 and the dialog's key rules.                                                                                                                                                                                  | —                                     |
| `.pocket-ci`                    | The accepted OpenAPI diff line for the new activity variant.                                                                                                                                                                | —                                     |

No design kit change: the kit in the catalog (0.18.0) has `ChoiceList` (radio or check box rows,
each with a label and a description), `Button`, `Card`, `Tag` and `Text`.

## 2. Contract changes

Compatible for the web app, which ships with the server, and for older clients.

- `Question` gains `options?: Array<{ label: string; description?: string }>` and
  `multiple?: boolean`. A client that ignores them shows the card of spec 009.
- `POST /agents/:agent/answer` with `AnswerRequest { call: string; answers: Array<Array<int>> }`,
  where `call` is the call's transcript entry id (Claude's tool use id) and `answers[i]` holds
  the indexes of the options chosen for question `i`. `answers` takes 1 to 4 questions and each
  1 to 4 indexes, as `AskUserQuestion` itself allows. Answers `204`; `409` (`question-not-waiting`)
  for requirement 10; `422` for requirement 11; `404` for an unknown agent; `502`/`503` as `keys`
  does for Herdr.
- `ActivityEvent` gains `{ type: 'answered', …activityFields, excerpt }`, added last; the OpenAPI
  diff line is accepted in `.pocket-ci` (see the OpenAPI diff memory).

## 3. Migrations

No database. The activity file keeps its version; older files hold no `answered` event.

## 4. Design

### Claude's dialog (checked live against Claude Code v2.1.323 on 2026-11-18)

- Each question is a tab; the dialog opens on the first. Its options are numbered from 1 in the
  call's order, followed by Claude's own "Type something" and "Chat about this".
- **Single choice:** a digit chooses that option and moves to the next tab. With only one question
  in the call, which is single choice, it submits at once.
- **Multiple choice:** a digit toggles that option and stays; `right` moves to the next tab.
- With several questions, or any multiple choice, the last tab is **Review your answers** with
  "1. Submit answers" and "2. Cancel"; `1` submits.
- Probed sequences, each answered as intended in the session: `2` (one single choice → Green);
  `1 3 right 1` (one multiple choice → Cat, Fish); `4 2 1` (two single choices → Yellow, Large);
  `3 1 3 right 1` (single, then multiple → Blue; Cat, Fish).

### Domain

- `answerKeys(questions, answers)`: checks requirement 11 and returns `InvalidInputError` on
  `answers`, or the keys: for each question, a single choice gives its digit, a multiple choice
  gives a digit per chosen option then `right`; then `1`, unless the call is one single-choice
  question. A call has at most 4 questions of at most 4 options, so the keys are `1`–`4` and
  `right`, and there are at most 21.
- `DialogKey = AgentKey | '4'`: the keys API (`parseKeys`, `KEYS` in the contract, at most eight)
  stays as it is; only the answer use case sends `4` or more than eight keys.
- `showsQuestion(screen, question)`: true when the screen, with all whitespace removed, holds the
  first question's text, with all whitespace removed (the dialog wraps it), and holds neither an
  answered tab (`☒`) nor "Review your answers". A fresh dialog opens on its first tab with no tab
  answered, which is where the keys start.
- `answerExcerpt(questions, answers)`: each question's labels joined with ", ", the questions with
  "; ", cut to 80 characters as `promptExcerpt` does.

### Application

`Input.answer(ref, call, answers)`: `find(ref)`; fail with `QuestionNotWaitingError` unless the
agent's transcript format is `claude` and its status `blocked`; read the transcript and fail the
same way unless its latest entry is the tool entry `call` with `questions` and outcome `pending`;
`answerKeys` (a `422` before the screen is read); `readScreen` and fail unless `showsQuestion`;
`sendKeys(paneId, keys)`; record `answered`. The transcript is read again on each call, never
cached, so a card from before an answer in the terminal is refused.

### Web

- `QuestionCard` takes an optional `answering` prop: the questions' options, the chosen indexes,
  `onChange`, `onSend`, `sending`, `sent` and `error`. Answerable, it shows each question's header
  `Tag` and a `ChoiceList` (label: the question text, `multiple` for a multiple choice, the
  options as label and description), the error as the conversation shows others, and a **Send
  answers** `Button` that is disabled until every question has a choice or while sending. Once
  sent it shows each question's chosen labels with a "Sent" `Tag` and no options.
- `Chat` renders the latest entry's card as answerable when the conversation says so; the
  conversation holds the chosen indexes and the `answer` mutation, keyed by the call id, so a new
  call starts empty and a failed send keeps the choices.
- `Conversation`: while `blocked` and the latest entry is a pending question call with options,
  the Chat view leaves out the card "Claude needs your answer" with the wrapped screen; the keys
  (closed **Controls**) and the field **Type into the dialog** stay. A `409` shows "This question
  was answered or moved on. Check the Screen view."
- `activityText`: `case 'answered': return \`You answered: ${event.excerpt}\``.

## 5. Test strategy

- **Unit (domain):** `answerKeys` for the four probed calls gives the probed sequences; it refuses
  a wrong number of questions, an empty choice, two choices for a single choice, an index out of
  range and a repeated index. `showsQuestion` finds a question wrapped across lines and refuses
  an answered tab, the review tab and another question. `answerExcerpt` joins and cuts.
- **Unit (application, fakes):** `answer` presses the keys and records `answered`; it refuses, and
  presses nothing, for a Pi agent, a non-blocked agent, a call that is not the latest entry or has
  a result, invalid answers, and a screen without the question.
- **Adapter:** the Claude reader keeps options, descriptions and `multiSelect`, and a call whose
  options cannot be read keeps its questions without them; the socket adapter sends `4` as a
  named key; the activity file store round-trips `answered`.
- **API and contract:** `AnswerRequest` decodes and bounds its arrays; the endpoint answers `204`,
  `409`, `422` and `404`; the OpenAPI document is regenerated.
- **Web (Testing Library):** a blocked agent's pending call shows the options and no wrapped
  screen; **Send answers** is disabled until each question has a choice; a send calls `answer`
  with the indexes; a sent card shows "Sent"; a `409` shows the message and keeps the choices; an
  idle agent's pending call shows no options; the timeline line; axe has no violations.
- **Manual (phone, 390 px):** against a live Claude, a single choice, a multiple choice and a call
  with several questions, each answered from the card; a card answered in the terminal first is
  refused with the message.
- **Boundaries:** no new imports across layers; `pnpm verify:local`.

## 6. Risks

- **Claude Code changes its dialog.** The key rules are pinned by domain tests, written down in
  `packages/comms/AGENTS.md` with the probed version, and checked live. The screen check stops a
  send when the dialog does not look as expected, and the owner falls back to the keys.
- **The owner moved the dialog off its first tab with the keys.** An answered tab or the review
  then shows, so the server refuses with `409` and presses nothing.
- **The owner moved to another tab with `right` without answering.** No tab is answered and the
  first question may still show in the scrollback, so the check passes and the digits land on the
  wrong question. This takes deliberate key presses on the Screen view first; the risk is accepted.
- **Several clients answer at once.** The second send finds the call answered (transcript) or the
  screen changed and gets `409`.

## 7. Amendment: the waiting call from a hook (spec section 7)

Checked live against Claude Code v2.1.323 on 2026-11-18 with a logging hook: `PreToolUse` for
`AskUserQuestion` carries `session_id`, `tool_use_id`, `cwd` and `tool_input.questions`;
`PostToolUse` follows an answer; a dialog cancelled with Esc fires no `PostToolUse`, and the
session file then holds the call with its refusal.

| Path                            | Change                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/comms-server`             | `src/claude-hook.ts`, built to `dist/claude-hook.js`, with Node built-ins only: reads the hook input from stdin and writes or removes `<COMMS_STATE_DIR or ~/.pocket-comms>/questions/<session>.json` (0600, written to a temporary file and renamed). A session id other than `[A-Za-z0-9-]` is ignored. The composition passes the questions folder to the transcript layer. The README names the settings entry. |
| `packages/comms/infrastructure` | `transcript/claude.ts`: `waitingCallOf(cwd, file)`, the pending tool entry of a hook file, through the same `summarise` as a session line. `transcript/files.ts`: an optional `questions` folder; `read` appends the waiting entry when no entry has its id; `follow` checks the file at each tick and emits the entry once.                                                                                        |
| `packages/comms/domain`         | `showsQuestion` drops box-drawing characters (U+2500–U+257F) with the whitespace before it looks for the question.                                                                                                                                                                                                                                                                                                  |
| `packages/comms/application`    | `Input.answer` no longer requires `blocked`.                                                                                                                                                                                                                                                                                                                                                                        |
| `apps/comms-web`                | `Conversation`: the card is answerable whatever the status; the wrapped screen's card for `blocked` stays as it was for every other case.                                                                                                                                                                                                                                                                           |

The settings entry, set up by hand on the owner's Mac (with the path of the deployed release):

```json
"PreToolUse": [{ "matcher": "AskUserQuestion", "hooks": [{ "type": "command", "command": "node <release>/apps/comms-server/dist/claude-hook.js" }] }],
"PostToolUse": [{ "matcher": "AskUserQuestion", "hooks": [{ "type": "command", "command": "node <release>/apps/comms-server/dist/claude-hook.js" }] }],
"Stop": [{ "hooks": [{ "type": "command", "command": "node <release>/apps/comms-server/dist/claude-hook.js" }] }]
```

`<release>` is `~/pocket-cloud-data/pocket-comms/current`, the link `install-comms.sh` moves on
each update, so the entry outlives releases.

**Tests.** Hook: `PreToolUse` writes the file, `PostToolUse` and `Stop` remove it, other events,
bad JSON and a bad session id write nothing and exit `0`. Reader: a hook file adds the waiting
entry last; a session file that holds the call wins; `follow` emits the entry after the hook
writes it. Domain: the question behind `│` and beside a preview box is found. Use case: a `done`
agent with a waiting call is answered. Web: a `done` agent's waiting call is answerable.

**Risks.** A Claude killed while asking leaves its file behind until its next `Stop`; its card
stays answerable, and a send gets `409` from the screen check. The hook runs on every `Stop` of
every session; it only removes a file, so it adds a Node start (about 50 ms) to each turn's end.

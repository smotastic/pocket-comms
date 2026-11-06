# Plan 024 — pocket-comms: typed answers and quick replies

- **Spec:** [spec.md](./spec.md)
- **Status:** `Approved` — approved with the spec by the owner (2026-11-06)

## 1. Affected projects

| Path                            | Change                                                                                                                                         | Nx tags                               |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `packages/comms/domain`         | `input.ts`: `MAX_TYPED_LENGTH` and `parseTyped` (trim, line breaks to spaces, not blank, at most 2 000). `activity.ts`: the `typed` event.      | `scope:comms`, `layer:domain`         |
| `packages/comms/application`    | `HerdrOutbound.typeText(paneId, text)`; `Input.type` parses, types into the agent's pane and records `typed`; the fake Herdr takes the command. | `scope:comms`, `layer:application`    |
| `packages/comms/infrastructure` | The socket adapter's `typeText` sends `pane.send_text` with `{ pane_id, text }`; the activity file store keeps `typed` events.                  | `scope:comms`, `layer:infrastructure` |
| `packages/comms/contract`       | `TypeRequest` and `POST /agents/:agent/text`; the `typed` `ActivityEvent`, added last.                                                         | `scope:comms`, `type:contract`        |
| `packages/comms/api`            | The `text` handler maps errors as the `keys` handler does.                                                                                     | `scope:comms`, `layer:api`            |
| `apps/comms-web`                | `CommsClient.type`; a `QuickReplies` chip group; the conversation's footer while blocked; "You typed: …" in the timeline.                       | `scope:comms`, `type:app`             |
| `apps/comms-server`             | The regenerated OpenAPI document.                                                                                                              | `scope:comms`, `type:app`             |
| `packages/comms/AGENTS.md`      | Names spec 024 and the rule that typing never presses Enter.                                                                                   | —                                     |
| `.pocket-ci`                    | The accepted OpenAPI diff line for the new activity variant.                                                                                   | —                                     |

No design kit change: the footer composes `ChipGroup`, `KeyPad`'s buttons and `Composer`, which
the kit has.

## 2. Contract changes

Compatible for the web app, which ships with the server.

- `POST /agents/:agent/text` with `TypeRequest { text }`: `204` on success; `422` for blank or
  too long text; `404` for an unknown agent; `503`/`502` as `keys` does for Herdr. Its
  description says it types literal text and never presses Enter.
- `ActivityEvent` gains `{ type: 'typed', …activityFields, excerpt }`, added last (see the
  OpenAPI diff memory: union variants go last, and the diff line is accepted in `.pocket-ci`).

## 3. Migrations

No database. The activity file keeps its version; a reader that meets `typed` decodes it with
the new schema, and older files hold none.

## 4. Design

- **Domain.** `parseTyped(text)` returns the cleaned text or `InvalidInputError` on `text`.
  `promptExcerpt` makes the timeline excerpt, as for prompts.
- **Port.** `typeText` is a separate method from `prompt`, so `prompt` keeps its submit meaning
  and nothing can type and submit in one call. It goes to the pane id, as every command does.
- **Use case.** `Input.type(ref, text)`: parse, `find(ref)`, `typeText(agent.paneId, parsed)`,
  then `record([{ type: 'typed', excerpt, agent }])`. It does not check the status: like the keys,
  it acts on the terminal as it is; the web app offers it only while the agent is blocked.
- **Web.**
  - `QuickReplies` (`ChipGroup`, label "Quick replies", row layout) with the two fixed replies,
    shown above the input in both views; disabled while a send is under way.
  - Footer while `blocked`: alerts, background strip, `KeyPad`, `QuickReplies`, then a `Composer`
    labelled **Type into the dialog** without `attach`, with its own draft, and the hint text.
    Its send and a chip tap call one `type` mutation; a success clears that draft.
  - Footer otherwise: as today, with `QuickReplies` above the composer; a chip calls the existing
    prompt mutation with the reply and no images.
  - Only the latest send can fail visibly, as today: each mutation resets the others.
  - `activityText` gets `case 'typed': return \`You typed: ${event.excerpt}\``.

## 5. Test strategy

- **Unit (domain):** `parseTyped` trims, joins lines with spaces, refuses blank text and 2 001
  characters, and takes 2 000.
- **Unit (application, fakes):** `type` sends `typeText` to the pane id and records a `typed`
  event with the excerpt; invalid text sends nothing and records nothing; an unknown agent fails
  as `sendKeys` does.
- **Adapter:** against the fake socket server, `typeText` sends `pane.send_text` with
  `{ pane_id, text }` and maps a refusal as the others do. The activity file store round-trips a
  `typed` event.
- **API and contract:** `TypeRequest` decodes; the endpoint answers `204`, `422` and `404`; the
  OpenAPI document is regenerated.
- **Web (Testing Library):** an idle agent's chip sends a prompt; a blocked agent's chip and
  field call `type` and never `prompt` or `keys`; the blocked footer has the keys, the chips, the
  field and the hint, and no attach button, in both views; a failed type keeps the draft; the
  timeline line; axe has no violations.
- **Manual (phone):** a Claude `AskUserQuestion` with Other, answered by typing and Enter; a
  permission dialog answered with the keys only; a quick reply to an idle agent.
- **Boundaries:** no new imports across layers; `pnpm verify:local`.

## 6. Risks

- **A typed digit or letter picks a menu option** (spec, requirement 6). The hint asks the owner
  to choose Other first; Enter is never sent with the text.
- **Herdr's `pane.send_text` changes its shape.** The adapter test pins the request; the app
  runs against Herdr 0.9.5 (protocol 22).

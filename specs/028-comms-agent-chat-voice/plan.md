# Plan 028 — pocket-comms: voice messages in the agent chat

- **Spec:** [spec.md](./spec.md)
- **Status:** `Approved` — approved with the spec by the owner (2026-11-09)

## 1. Affected projects

| Path                         | Change                                                                                      | Nx tags                            |
| ---------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------- |
| `packages/comms/application` | `SpeechInbound.available`, from `SpeechOutbound.available`.                                 | `scope:comms`, `layer:application` |
| `packages/comms/contract`    | `GET /api/v1/speech` in the `speech` group, success `{ available }`.                        | `scope:comms`, `type:contract`     |
| `packages/comms/api`         | The `state` handler.                                                                        | `scope:comms`, `layer:api`         |
| `apps/comms-server`          | The regenerated OpenAPI document.                                                           | `scope:comms`, `type:app`          |
| `apps/comms-web`             | `client.speech()`, `speechQuery`; the Record voice item and the clip row in `Conversation`. | `scope:comms`, `type:app`          |

No design kit change: the `mic` icon came with kit 0.14.0.

## 2. Contract changes

Compatible within `/api/v1`: one new route, `GET /api/v1/speech` → `200 { available: boolean }`,
behind the `TailscaleIdentity` middleware like the group's other route.

## 3. Migrations

None.

## 4. Design

- **Server.** `SpeechInbound.available` answers `SpeechOutbound.available`; the handler wraps it.
- **Web.** `speechQuery(client)` with a long `staleTime` (the setting changes only on a restart).
  `Conversation` uses `useVoiceClip(client, (text) => setDraft((d) => appendText(d, text)))` and
  adds `{ id: 'voice', label: 'Record voice', icon: 'mic', … }` after Upload image when
  `available`; the `attachments` slot holds `VoiceClipRow` above `AttachedImages`, as in the
  brainstorm `Footer`. The clip's notice shows as an `Alert` with its tone. The hook stays mounted
  while the dialog composer shows, so a clip waits there (requirement 4). A successful prompt
  clears only the text it sent, as the brainstorm composer does since spec 027.

## 5. Test strategy

- **Application and API:** `available` with and without a speech service; the route's answer and
  its 403 without identity.
- **Web (Testing Library):** the menu with and without voice; recording into an existing draft
  without a prompt; a failed clip with Retry; no item in the dialog composer.
- **Boundaries:** no new imports across layers; `pnpm verify:local`.

## 6. Risks

None beyond spec 027's.

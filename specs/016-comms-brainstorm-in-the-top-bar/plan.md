# Plan 016 — pocket-comms: open the brainstorm chat from the top bar

- **Spec:** [spec.md](./spec.md)
- **Status:** `Approved` — approved by the owner (2026-11-03)

## 1. Affected projects

| Path                                            | Change                                                                                                                                                                                                   | Nx tags                   |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `apps/comms-web/src/Brainstorm.tsx`             | Drop the bubble. `Brainstorm` becomes a provider at the root: it holds whether the chat is open, renders the one brainstorm sheet, and offers `useOpenBrainstorm()` and a `BrainstormAction` icon button | `scope:comms`, `type:web` |
| `apps/comms-web/src/routes/__root.tsx`          | Wraps the outlet in the provider instead of rendering the bubble after it                                                                                                                                | `scope:comms`, `type:web` |
| `apps/comms-web/src/Overview.tsx`               | `BrainstormAction` before Projects in the top bar                                                                                                                                                        | `scope:comms`, `type:web` |
| `apps/comms-web/src/ProjectPage.tsx`            | `BrainstormAction` before New task, on both top bars (a project and an unknown name)                                                                                                                     | `scope:comms`, `type:web` |
| `apps/comms-web/src/ConversationMenu.tsx` (new) | The More action and its side sheet: Brainstorm with Pi, and Close &lt;agent&gt; when a close is offered                                                                                                  | `scope:comms`, `type:web` |
| `apps/comms-web/src/Conversation.tsx`           | The header's trash icon becomes `ConversationMenu`, on every state of the header (loading, failed, loaded)                                                                                               | `scope:comms`, `type:web` |
| `apps/comms-web/src/*.spec.tsx`                 | See the test strategy                                                                                                                                                                                    | `scope:comms`, `type:web` |

The open state lives in a React context at the root, so every screen opens the same sheet and
one chat query and one live stream serve them all (requirement 7). Closing the sheet unmounts
nothing below it, which keeps the screen as it was (requirement 6). Nothing changes in
`packages/design`, the comms service, the server or the contract.

## 2. Contract changes

None.

## 3. Migrations

None.

## 4. Test strategy

Test-first in `apps/comms-web` with Testing Library, through the app's router and fake client as
the current specs do.

- `brainstorm.spec.tsx`: no bubble on any screen; Brainstorm in the overview and project page top
  bars, in that order; opening and closing from the overview; opening from a conversation's More
  menu; the chat's existing behaviour, now reached through the overview's action.
- `conversation.spec.tsx`: More on a loaded, a loading and a failed conversation; More lists Close
  only for a linked worktree; Close from More reaches the spec 011 confirmation (the existing close
  tests go through More); a composer draft survives opening and closing the brainstorm chat.
- `project-page.spec.tsx` and `overview.spec.tsx`: the action's position next to New task and
  Projects.
- Accessibility: the actions are buttons named "Brainstorm" and "More"; the More sheet is a
  dialog named "More". The design-ui components keep their own axe checks.
- At 390 px: a manual check on the phone that the three top bars fit, as recorded in the spec's
  acceptance criteria.
- Boundaries: the change stays inside `apps/comms-web` and imports only `@pocket-comms/design-ui`;
  dependency-cruiser and the Nx module boundaries already prove that.

## 5. Risks

- The conversation's top bar still truncates long agent names (accepted in the spec).
- Two sheets at once (More, then Brainstorm): More closes before the next sheet opens, so only
  one is ever open, and focus returns to the screen when the last one closes.

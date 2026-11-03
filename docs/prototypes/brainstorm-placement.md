# Prototype: where the brainstorm chat lives

Issue #28. A throwaway prototype on branch `feat/28-explore-and-prototype-better`; it does not
merge as is. The verdict picks a direction, and that direction gets its own spec.

## The question

The brainstorm bubble from spec 013 floats over every screen. Where should the way into
brainstorming go, and what should it open into, so that it stays quick to reach on a phone
without covering content or competing with the everyday agent controls?

## What the owner said (design grilling)

- **Where the bubble gets in the way:** next to the conversation composer, and as visual noise
  because it is always there.
- **When brainstorming starts:** out of the blue. The idea has nothing to do with the screen
  that is open.
- **Scope:** global, one ongoing chat. Pi picks the project when it proposes an issue.
- **How often:** now and then, a few times a day. It should not take prime space from agents.

## Variants

Pick a variant with `?variant=<key>` on any address, or with the switcher at the top of the
overview. The choice is remembered in this browser.

| Key       | Entry point                                                                       | Opens into                                                                 |
| --------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `current` | The floating bubble on every screen (today)                                       | A full-height sheet                                                        |
| `header`  | A lightbulb icon in the top bar of the overview, project and conversation screens | The same full-height sheet; nothing floats                                 |
| `menu`    | A "Brainstorm with Pi" button at the top of the Projects side sheet               | A page of its own, `/brainstorm-prototype`; Back returns to where you were |
| `bubble`  | A bubble only on the overview and project pages, hidden while scrolling down      | A tall sheet that leaves the top of the screen visible                     |

Code: `apps/comms-web/src/brainstorm-placement.prototype.tsx` and
`apps/comms-web/src/routes/brainstorm-prototype.tsx`. `Brainstorm.tsx` now separates the chat
from the surface it sits on (`BrainstormSheet`, `BrainstormPage`).

## Running it on a phone

1. Start the web app on a free port and point it at a comms server, with the login that server
   allows: `COMMS_ALLOWED_LOGIN=<login> pnpm exec vite --port 4201` in `apps/comms-web`. With
   `pnpm dev:memory`, the default dev login works on port 4200.
2. Serve it on the tailnet: `tailscale serve --https=8443 4201`.
3. On the phone, open `https://<mac-mini>.<tailnet>.ts.net:8443/?variant=header` and switch
   variants from the top of the overview.

## How the variants compare

My reading before the owner's phone test. The owner's ratings go below this table.

| Criterion                   | `current`                               | `header`                           | `menu`                                                               | `bubble`                                        |
| --------------------------- | --------------------------------------- | ---------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------- |
| Discoverability             | High                                    | High: always in the bar, but small | Low: behind the menu, and only on the overview                       | Medium: only on two screens                     |
| Thumb reach (one hand)      | Good: bottom right                      | Poor: top right                    | Poor: top-right menu, then a button                                  | Good: bottom right                              |
| Accidental taps             | Some, near the composer                 | Rare                               | Rare                                                                 | Rare: gone in conversations and while scrolling |
| Content obstruction         | Covers rows and the composer area       | None                               | None                                                                 | Only while resting on a list                    |
| Keyboard open               | Full sheet; composer above the keyboard | Same as `current`                  | Docked page, like a conversation                                     | Tall sheet; less room above the keyboard        |
| Back to the last screen     | Close the sheet; nothing moves          | Close the sheet; nothing moves     | Browser back; the overview remounts, so the Projects sheet is closed | Close the sheet; nothing moves                  |
| Reachable in a conversation | Yes                                     | Yes                                | No: go back to the overview first                                    | No                                              |

Open points for the test: does the top bar in a conversation get too crowded next to Chat/Screen
and Close? Is a tall sheet enough room once the keyboard is up?

## Verdict

First round: the owner picked `header`, with one change. In a conversation the top bar is already
full (back, name, status, Chat/Screen, Close), and one more icon leaves no room for the agent's
name. So there:

- the overview and project pages keep the brainstorm icon in the top bar, outside the Projects
  menu;
- a conversation shows a menu icon instead, which opens a side sheet with only "Brainstorm with Pi"
  and "Close <agent>". Close no longer has an icon of its own.

The second round is on the prototype (`?variant=header`). Still open: with Chat/Screen, a long
agent name is still cut short at phone width.

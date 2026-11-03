# Spec 016 — pocket-comms: open the brainstorm chat from the top bar

- **Status:** `Approved` — approved by the owner (2026-11-03)
- **Changes:** [spec 013](../013-comms-brainstorm-chat/spec.md) (requirements 1 and 2: the
  floating bubble and the sheet it opens) and [spec 011](../011-comms-close-agent/spec.md)
  (requirement 1: the conversation's Close action)
- **Issue:** Gitea #28

## 1. Problem / intent (WHY)

The brainstorm bubble of spec 013 floats over every screen. It crowds the conversation's
composer, and because it never goes away it is visual noise. The owner brainstorms now and then,
a few times a day, on ideas that come out of the blue and have nothing to do with the screen
that is open. So brainstorming needs one way in that is always there, but takes no space from
the content or from the agent controls the owner uses all the time.

A prototype with four placements, tried on the owner's phone, settled it. Brainstorm moves into
the top bar. In a conversation the top bar is already full, so brainstorm and Close sit behind a
menu there, and the agent's name keeps its room.

## 2. Scope

- **In scope:** removing the floating bubble; a Brainstorm action in the top bar of the overview
  and the project page; a More menu in the conversation's top bar with Brainstorm and Close.
- **Out of scope:** what the chat does once it is open (spec 013 stays as is), one chat per
  project, moving the conversation's Chat/Screen switch, a Brainstorm action on screens without a
  top bar (the not-found page), and removing the `Fab` component from the design system (it stays
  in the kit, unused).

## 3. Requirements (WHAT)

### Where brainstorming starts

1. No screen shows a floating brainstorm bubble.
2. The overview's top bar has a **Brainstorm** action (the `brainstorm` icon) right before its
   Projects action. The Projects side sheet does not list brainstorming.
3. The project page's top bar has a **Brainstorm** action right before New task. This includes
   the page for a name that is not a project.
4. The conversation's top bar has no Brainstorm action and no Close action of its own. At its end
   it has a **More** action (the `menu` icon). This covers the conversation while the agent is
   still loading or could not be read.
5. **More** opens a side sheet titled "More" with, in this order:
   - **Brainstorm with Pi**, always;
   - **Close &lt;agent&gt;**, only for an agent that spec 011 lets the owner close.

   Choosing an entry closes the More sheet first. Close then asks exactly as spec 011 describes.
   The More sheet closes with its Close button or by tapping outside it, and nothing happens.

### The chat it opens

6. Every Brainstorm action opens the brainstorm chat as the full-height sheet of spec 013, over
   the current screen. Closing the sheet returns to that screen unchanged: same scroll position,
   same open sheets underneath, same draft in a composer.
7. Opening the chat from any screen shows the same, single brainstorm conversation.

## 4. Acceptance criteria

- Given any screen, then no floating brainstorm button shows.
- Given the overview, then its top bar has Brainstorm before Projects. Given a project page, then
  its top bar has Brainstorm before New task.
- Given the overview, when the owner taps Brainstorm, then the brainstorm sheet opens ready to
  type. When it is closed, then the overview shows as before.
- Given a conversation with an agent in a linked worktree, then its top bar has More and no
  Brainstorm or Close icon. When the owner taps More, then a sheet offers Brainstorm with Pi and
  Close &lt;agent&gt;.
- Given a conversation with an agent in a main checkout, when the owner taps More, then the sheet
  offers only Brainstorm with Pi.
- Given the More sheet, when the owner taps Brainstorm with Pi, then the More sheet closes and the
  brainstorm sheet opens. When the owner taps Close &lt;agent&gt; instead, then the More sheet
  closes and the close confirmation of spec 011 opens.
- Given a draft in a conversation's composer, when the owner opens and closes the brainstorm
  chat, then the draft is still there.
- Given a phone at 390 px width, then each top bar fits without sideways scrolling.

## 5. Notes

- **The prototype** (branch `chore/28-brainstorm-placement-prototype`, findings in
  `docs/prototypes/brainstorm-placement.md` there) tried four placements: today's bubble, a
  header action, an entry in the Projects side sheet that opens a page of its own, and a bubble
  only on the list screens that hides while scrolling. The owner chose the header action, with
  the More menu in a conversation, after trying them on a phone (2026-11-03).
- **Trade-offs accepted:** a top-right action is harder to reach with one thumb than a
  bottom-right bubble, and the conversation needs one more tap. In return nothing covers content,
  nothing sits near the composer, and there are fewer accidental taps.
- **Known limit:** with Chat/Screen in the conversation's top bar, a long agent name is still cut
  short at phone width. The owner accepted it as is.
- The look comes from the design system (`packages/design`): the existing `IconButton`, the
  `brainstorm` and `menu` icons, `Sheet` with `side="end"`, `SheetHeader` and `Button`. No new
  component is needed.

## 6. Open questions

None. The owner's decisions of 2026-11-03 are folded in: the header placement; in a conversation,
a More menu with only Brainstorm and Close; the PR of the prototype carries this spec; the `Fab`
component stays in the design system.

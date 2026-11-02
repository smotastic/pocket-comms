# Spec 013 — pocket-comms: a floating brainstorm chat

- **Status:** `Approved` — approved by the owner (2026-11-02)
- **Changes:** [spec 004](../004-pocket-comms-v1/spec.md) (every screen gets the chat bubble) and
  [spec 010](../010-comms-close-issues/spec.md) (the app's Gitea writes: creating an issue joins
  closing one)
- **Issue:** Gitea #9

## 1. Problem / intent (WHY)

The owner gets ideas away from the desk, on the train. Today the app only talks to agents that
already run in a project, so noting an idea means choosing a project, starting a task and waiting
for an agent, or keeping the idea elsewhere and losing it.

This feature adds a brainstorm chat that is one tap away on every screen. The owner types or
dictates an idea, Pi helps think it through, and when an idea is ready Pi proposes it as a Gitea
issue in the right project. The issue is created only when the owner approves it.

## 2. Scope

- **In scope:** a floating chat bubble on every screen; one ongoing brainstorm conversation with
  Pi, kept across server restarts; Pi's read-only look at the projects, their open issues and
  their top-level docs; issue proposals the owner edits and approves; starting a new chat; and the
  API behind it.
- **Out of scope:** several conversations or a history of old ones, giving Pi file, shell or edit
  tools, a microphone button (the phone keyboard's dictation fills the text field), editing,
  labelling or assigning issues, and creating anything in Herdr.

## 3. Requirements (WHAT)

### The bubble and the sheet

1. Every screen shows a round brainstorm bubble at the bottom right. It never covers a control: on
   a screen with a composer or an action bar it sits above it.
2. Tapping the bubble opens the brainstorm chat as a full-height sheet over the current screen.
   Closing the sheet returns to that screen unchanged, and the bubble shows again.
3. The chat needs no choice before the first message: the sheet opens on the conversation with
   the text field ready.
4. The sheet shows the conversation (the owner's messages, Pi's answers as Markdown, Pi's
   proposals) and, while Pi answers, Pi's text as it arrives.

### The conversation

5. There is one brainstorm conversation. It is saved on the server after every change and is
   there again after the server restarts.
6. The owner sends a message from the text field. While Pi answers, the owner cannot send another
   message; the API refuses one with a `brainstorm-busy` problem.
7. **New chat** in the sheet's top bar starts an empty conversation after a confirmation. The old
   conversation is gone; issues created from it stay. A running answer stops.
8. When a turn of Pi fails (the model cannot be reached, the credentials expired), the
   conversation keeps what came before and shows the reason. The owner can send again. Nothing is
   retried on its own.

### What Pi may do

9. Pi is told that it helps the owner brainstorm and capture ideas for the owner's projects, and
   that it files ideas only by proposing an issue.
10. Pi can read, and only read:
    - the projects: the git repositories directly below the projects root, by name, and whether
      each has a remote on the app's Gitea;
    - a project's open Gitea issues, by number and title;
    - a project's `README.md` and `AGENTS.md` at its top level, cut to a fixed length.
      Pi names a project only by its name; it never reads any other file and runs no command.
11. Pi has no tool that writes. To file an idea it **proposes** an issue: a project, a title and a
    body. A proposal ends Pi's turn.

### Proposals

12. A proposal shows in the conversation as a card with the project, the title and the body, each
    editable, and two actions: **Create issue** and **Discard**.
13. **Create issue** creates exactly the shown title and body as an open issue in the chosen
    project's Gitea repository, with nothing else (no labels, assignees or milestone). The card
    then shows the issue's number and links to it, and Pi is told the issue was created.
14. **Discard** creates nothing. The card shows that it was discarded, and Pi is told the owner
    declined it.
15. A proposal is decided once. A decision for a decided or unknown proposal is refused with a
    `proposal-decided` or `proposal-not-found` problem.
16. When the owner sends a message while a proposal is open, the proposal stays open and can still
    be decided later.
17. A project without a Gitea remote, or a title that is blank or longer than 255 characters, is
    refused before anything is created; the card shows why and stays open.
18. When Gitea refuses the issue or cannot be reached, nothing changes, the card stays open and
    shows the reason.

### Set-up

19. The model comes from the server's settings: a provider and a model, and the owner's Pi login
    (or an API key). Without them, or with a model the provider does not have, the server still
    starts and the sheet says that the brainstorm chat is not set up and which setting is missing.
    Agents, tasks and issues work as before.
20. Creating an issue needs the Gitea token of spec 006; without it the card says so.
21. Every brainstorm route goes through the Tailscale identity guard like every other route. The
    model credentials and the Gitea token never reach the browser or a log.

## 4. Acceptance criteria

- Given the overview, a conversation or a project page, then the bubble shows and does not cover
  the composer, the approval panel or any button. Given a phone at 390 px width, then the open
  sheet fits without sideways scrolling.
- Given an empty chat, when the owner opens the bubble, types "Idea: dark mode for pocket-home" and
  sends it, then the message shows at once and Pi's answer streams in below it.
- Given Pi answers, when the owner tries to send again, then the send action is unavailable, and a
  request sent anyway gets `brainstorm-busy`.
- Given a conversation, when the server restarts and the owner opens the bubble, then the
  conversation is there.
- Given Pi proposes "Dark mode" for `pocket-home`, when the owner changes the title to "Dark mode
  toggle" and taps Create issue, then Gitea gets one new issue titled "Dark mode toggle" with the
  shown body and nothing else, the card shows its number with a link, and Pi's next answer knows
  it was created.
- Given an open proposal, when the owner taps Discard, then Gitea gets no request and Pi is told.
- Given a decided proposal, when a second decision arrives, then the API answers
  `proposal-decided` and Gitea gets no request.
- Given Pi asks to read `../secrets` or `src/main.ts`, then the tool refuses; given it asks for
  `pocket-home`'s `AGENTS.md`, then it gets the file's text.
- Given no model settings, then the server starts, and the sheet names the missing settings.
- Given the model fails mid-answer, then the conversation shows the reason, keeps Pi's earlier
  answers and the owner can send again.
- Given New chat is confirmed, then the conversation is empty and a running answer stops.

## 5. Notes

- Pi runs inside the comms server through an agent runtime port with a Pi adapter
  ([ADR 0012](../../docs/architecture/adr/0012-an-agent-runtime-port-with-a-pi-adapter.md)), the
  shape pocket-learning's coach uses. It is not a Herdr agent and does not appear in the overview.
- The conversation is the comms service's first stored state: one JSON file in the server's state
  folder. It holds the shown entries and Pi's own message history.
- Gitea's issue creation is `POST /repos/{owner}/{repo}/issues` with only `title` and `body`.
- The look comes from the design system (`packages/design`): a floating action button, a
  `brainstorm` icon, the `Sheet`, the `Composer`, the `Markdown` and the form fields.

## 6. Open questions

None.

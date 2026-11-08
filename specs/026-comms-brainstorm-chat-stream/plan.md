# Plan 026 — pocket-comms: the brainstorm reply streams in, with Pi's tools as they run

- **Spec:** [spec.md](./spec.md)
- **Status:** `Approved` — with the spec (2026-11-08)

## 1. Affected projects

| Path                            | Change                                                                                                    |
| ------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `pnpm-workspace.yaml`           | `@smotastic/pocket-agent` 0.3.0, `@smotastic/pocket-design` 0.11.1.                                       |
| `packages/comms/domain`         | The app's entries: `said`, `proposal` (a record of a proposal), `chatStarted`; the rules read the latest. |
| `packages/comms/application`    | `StoredChat.log`; the use case keeps it behind `ChatLog`, with `makeChatFeed` and `chatSink`.             |
| `packages/comms/infrastructure` | File format version 4 (`log`); versions 1 to 3 are numbered from their position.                          |
| `packages/comms/contract`       | `BrainstormEntry` as the app's entries; `events` takes `after` and streams `chatStreamEvent`.             |
| `packages/comms/api`            | The events handler streams the feed after `after`.                                                        |
| `apps/comms-web`                | `foldChat` in the live hook; the sheet from the kit's agent parts; the kit's link migration.              |

## 2. Design

- **One feed key.** The server has one chat, so the feed's key is fixed and its sequence goes on
  across a New chat, which records `chatStarted` first; a client that sees it clears its view.
  The turn engine keys turns by the chat's id, as before.
- **Busy.** The use case marks the chat answering before it records the owner's message or a
  decision that starts a turn, and idle before the turn's end is recorded; the sheet reads the
  state again on those entries.
- **Tool summaries.** `describeCall` maps each brainstorm tool to its project, issue or file.

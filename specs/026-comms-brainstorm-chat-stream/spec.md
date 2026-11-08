# Spec 026 — pocket-comms: the brainstorm reply streams in, with Pi's tools as they run

- **Status:** `Approved` — asked for by the owner on 2026-11-08 (pocket-factory issue #58)
- **Changes:** [spec 013](../013-comms-brainstorm-chat/spec.md) (the chat's stream and storage)
- **Builds on:** pocket-factory spec 016 (`@smotastic/pocket-agent` 0.3.0, the chat stream)

## 1. Problem / intent (WHY)

The brainstorm chat shows Pi's reply as it is written, but not what Pi is doing while its tools
run: a turn that reads three issues looks stuck. A text piece published while the sheet connects
can show twice, and a reconnect in the middle of a reply loses the text written meanwhile until the
whole message arrives. pocket-factory spec 016 puts the chat stream into the agent package once;
comms adopts it, with the design kit's agent thread (0.11.1).

## 2. Scope

- **In scope:** the chat's entries as a numbered log with the package's chat feed and sink; the
  events endpoint with `after` and the shared stream schema; the sheet built from the kit's
  `AgentSheet`, `AgentThread`, `UserMessage`, `AgentMessage`, `ToolActivity` and `TurnError`; the
  design kit bump from 0.4.0 to 0.11.1 with its migrations across the app.
- **Out of scope:** new tools for Pi; showing a tool's input or output; the agents' conversations
  (they keep their own transcript stream).

## 3. Requirements (WHAT)

1. Each tool Pi calls shows in the chat as one row, with a short summary of what it works on (a
   project, an issue `#n`, a file), never its input or output: running, then done or failed.
2. A tool still running when its turn ends, fails or is stopped (New chat) shows as stopped; no row
   stays running.
3. The reply streams in as it is written. No text and no entry shows twice; a reconnect in the
   middle of a reply shows the reply written so far, and the client follows again after the last
   entry it has.
4. The chat's entries are kept as a numbered log behind the package's `ChatLog`; the owner's
   messages, Pi's proposals and a new chat are the app's own entries. A proposal that changes
   (decided, pictures attached) is recorded again; the latest record of an id counts and shows in
   the place of its first.
5. A chat file of the previous format still loads: its entries are numbered from their position.
6. The state endpoint keeps whether Pi answers, whether the model sees pictures and the chat's
   pictures; the sheet reads it again when the stream says a turn began or ended.

## 4. Acceptance criteria

- Given Pi reads an issue and answers, then the sheet shows a running "Read issue" row that turns
  done, the reply growing, and one reply after it.
- Given New chat while a tool runs, then the row shows as stopped and the sheet is empty and idle.
- Given a sheet that reconnects with `after` while Pi writes, then it shows the entries after it
  once and the reply so far.
- Given a version 3 chat file, then the chat loads with its entries in order.

## 5. Notes

- The owner authorised the stored-format change (version 4) on 2026-11-08; old files are read.
- The new events endpoint and the smaller state change the OpenAPI document; the web app ships
  with the server, so the diff is accepted in `.pocket-ci`.

## 6. Open questions

None.

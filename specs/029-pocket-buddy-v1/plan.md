# Plan 029 — pocket buddy v1: capture ideas by voice into the brainstorm chat

- **Spec:** [spec.md](./spec.md)
- **Status:** `Approved` — approved with the spec by the owner (2026-11-09)

## 1. Affected projects

| Path                       | Change                                                                                    | Nx tags                      |
| -------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------- |
| `apps/buddy` (new)         | The buddy's program: core loop, outbox, comms client, laptop button, recorder and screen. | `scope:comms`, `type:device` |
| `eslint.config.mjs`        | `type:device` may depend only on `scope:contracts`, like `type:web`.                      | —                            |
| `packages/comms/AGENTS.md` | Names the buddy as a client of the contract.                                              | —                            |
| `README.md`                | How to run the buddy, its settings.                                                       | —                            |

No server change, no design kit change. Like comms-web, the buddy reaches comms only through
`@pocket-comms/comms-contract` and its derived `HttpApiClient` (ADR 0008's rule for a web app,
applied to a device). A new tag is a rule change, not a new architecture; no ADR.

## 2. Contract changes

None. The buddy uses `speech.transcribe`, `brainstorm.state`, `brainstorm.send`,
`brainstorm.events` and `brainstorm.decide` as they are.

## 3. Migrations

None. The outbox is a folder of files on the buddy's machine.

## 4. Design

`apps/buddy/src`, Effect services, one file each, tested through fakes:

- **Ports** (`Context.Service`): `Button` — a stream of `Press`, `Release`, `Toggle`, `Create`,
  `Discard` and `Quit` intents (`Toggle` starts a recording when none is under way and ends it
  otherwise, for a keyboard that cannot tell a release) (the device's adapter turns a double press into `Create` and a long
  press into `Discard`, so the core knows no gestures; changed while building); `Recorder` — `start` → a recording whose `stop`
  answers WAV bytes; `Screen` — `show(view)`; `Outbox` — `put(clip)`, `oldest`, `remove(id)`,
  `size`; `Comms` — `transcribe`, `send`, `state`, `events(after)`, `decide`.
- **Core** (`buddy.ts`): one program over the ports.
  - _Recording:_ `Press` starts, `Release` stops, `Toggle` does whichever fits (the laptop's
    space bar sends it), a fiber stops it at 120 s; clips under 0.5 s are dropped;
    others go to the outbox at once (requirement 2).
  - _Sender:_ a loop that takes the oldest clip, waits while `state.answering`, transcribes,
    sends, then removes it. Empty text removes it with "No speech was heard". A validation
    problem removes it with its reason. Unreachable, 5xx and `brainstorm-busy` keep it and retry
    with exponential backoff from 2 s up to 60 s (`Schedule`). `NotSetUp` (either service) keeps
    it and says which.
  - _Follower:_ reads `brainstorm.events` from the last seen number, rebuilding the latest answer
    from `delta` events and the latest open issue proposal from `entry` events; reconnects with
    the same backoff.
  - _View:_ a pure `render(state) → ScreenView` (status line, sent text, answer cut to 280
    characters, proposal title with the gestures), tested on its own.
- **Adapters for the laptop:**
  - `TerminalButton`: raw-mode stdin; space → `Toggle`, `y` → `Create`, `n` → `Discard`,
    Ctrl+C ends the program.
  - `FfmpegRecorder`: `ffmpeg -f avfoundation -i :<device> -ac 1 -ar 16000 -f wav pipe:1`;
    stopping sends `q` on stdin. 16 kHz mono WAV is about 3.8 MB for two minutes, under the
    server's 5 MB. The device can be chosen with `BUDDY_AUDIO_DEVICE` (default `0`).
  - `TerminalScreen`: redraws a small box in the terminal.
  - `FileOutbox`: `${BUDDY_HOME:-~/.pocket-buddy}/outbox/<time>-<n>.wav`, written to a temporary
    name and renamed, so a crash leaves no half clip.
  - `HttpComms`: `HttpApiClient` from the contract for every request. The client decodes the
    contract's server-sent event stream itself into `BrainstormEvent`s, so no `EventSource` and
    no hand-written parser are needed (changed while building).
- **Config:** `BUDDY_COMMS_URL` (required, the tailnet address of comms), `BUDDY_HOME`,
  `BUDDY_AUDIO_DEVICE`. Started with `pnpm nx run buddy:start`.
- The device's adapters (GPIO button with double and long press, `arecord`, the display) come in
  a later spec and replace only the three laptop adapters.

## 5. Test strategy

- **Unit (core, with fakes and `TestClock`):** press/release records into the outbox; the 120 s
  stop; a short slip is dropped; the sender sends oldest first, waits while answering, removes
  on success and on empty text, keeps and retries on unreachable and busy with growing waits,
  removes on a validation problem, keeps on not set up; the follower builds the answer from
  deltas and shows and clears a proposal; `Create` sends the proposal's draft without pictures
  and shows the number; `Discard` sends the discard.
- **Unit (view):** each status, the 280-character cut, the proposal line.
- **Adapters:** `FileOutbox` round trip in a temporary folder, order, and survival of a restart;
  `HttpComms` against a local fake HTTP server (transcribe, send, decide, and an event stream
  split across chunks); `TerminalButton` maps key bytes to intents.
- **Manual:** run on the laptop against the deployed comms; record an idea, see it in the chat on
  the phone; create a proposed issue with `y`; pull the network for the offline case.
- **Boundaries:** the `type:device` rule (an import of `comms-application` fails lint);
  `pnpm verify:local`.

## 6. Risks

- **Mac microphone permission:** the terminal app needs microphone access the first time `ffmpeg`
  records; macOS asks once.
- **The event stream in Node:** decoding SSE by hand; covered by the split-chunk adapter test.
- **The phone's hotspot on the device** (later): the outbox and the backoff cover gaps; nothing
  here depends on it.

# Spec 027 — pocket-comms: voice messages in the brainstorm chat

- **Status:** `Approved` — approved by the owner (2026-11-08)
- **Changes:** [spec 013](../013-comms-brainstorm-chat/spec.md) (the composer) and the composer's
  action menu of Gitea #70
- **Issue:** Gitea #73

## 1. Problem / intent (WHY)

Ideas come on the go: on a train, walking, with one hand free. Typing a thought on the phone is
slow enough that it often stays untyped. Speaking it takes seconds.

This feature lets the owner record a short voice message in the brainstorm chat. The server
transcribes it and the text lands in the composer, where the owner can fix a misheard word before
sending it as usual. The transcription is a service of its own, so a later dedicated "buddy"
device can reuse it.

## 2. Scope

- **In scope:** a **Record voice** item in the brainstorm composer's action menu; recording up to
  two minutes; transcribing the clip on the server with a speech-to-text service, the language
  detected per clip; adding the text to the composer; keeping a failed clip on the page with
  Retry and Discard; hiding the item when the server has no transcription set up; the API
  behind it.
- **Out of scope:** recording in any other composer; sending a clip without the text passing
  through the composer; reading Pi's replies aloud; keeping or replaying audio; a clip that
  survives reloading or closing the app; a capture-only message Pi does not answer; the buddy
  device; running the speech-to-text service (pocket-cloud provides it).

## 3. Requirements (WHAT)

### Recording

1. The brainstorm composer's action menu has a **Record voice** item when the server has
   transcription set up, and none when it has not.
2. Choosing Record voice asks the browser for the microphone and starts recording at once. While
   it records, the composer shows that it is recording, the elapsed time and a **Stop** button.
   The text box stays usable and keeps what it holds.
3. Stop ends the recording and sends the clip for transcription. A recording stops by itself at
   two minutes and goes on as if the owner had tapped Stop.
4. A refused microphone, or a browser that cannot record, shows a notice saying so; nothing is
   recorded and the composer is unchanged.
5. Only one clip exists at a time: Record voice is disabled while a clip records, is being
   transcribed or waits for a retry.

### Transcribing

6. While the clip is transcribed, the composer says so; the owner may keep typing.
7. When the transcription succeeds, its text is added to the end of the composer's text, separated
   by a space when the composer is not empty, and the clip is dropped. Nothing is sent: sending
   stays the owner's action, as before.
8. A transcription without words adds nothing and says that no speech was heard.
9. The server transcribes any language the service detects, without the owner choosing one.
10. The server keeps no audio: the clip is gone once its transcription is answered or has failed.

### Failures

11. When the transcription fails (no connection, the service is down or too slow, the server
    refuses the clip), the clip stays on the page with the reason, its length, **Retry** and
    **Discard**. Retry sends the same clip again; Discard drops it.
12. While a clip waits for a retry, leaving or reloading the page asks the browser to warn that
    the clip will be lost.
13. The server refuses an empty clip, a clip larger than its limit and a body that is not audio
    with a validation problem, and answers a service problem when transcription is not set up or
    the service fails. The reason says what failed without naming the service's address.

### What stays

14. Typing, pictures, sending and every other part of the chat work as in specs 013, 023 and 026,
    with or without transcription set up.
15. The transcription route goes through the Tailscale identity guard like every other route. The
    speech-to-text service is reached only by the server, never by the phone.

## 4. Acceptance criteria

- Given transcription is set up, when the owner opens the brainstorm composer's action menu, then
  it lists Record voice; given it is not, then it does not.
- Given the owner chooses Record voice and allows the microphone, then the composer shows
  "Recording", a running time and Stop.
- Given the composer holds "Idea:", when the owner records "dark mode for pocket-home" and taps
  Stop, then the composer holds "Idea: dark mode for pocket-home" and nothing is sent.
- Given a recording reaches two minutes, then it stops and is transcribed without a tap.
- Given the owner refuses the microphone, then a notice says so and the composer is unchanged.
- Given the service is down, when the owner stops a recording, then the composer shows the clip
  with the reason, Retry and Discard; when the service is back and the owner taps Retry, then the
  text is added as above.
- Given a clip waits for a retry, when the owner reloads the page, then the browser warns first.
- Given a clip with only silence, then nothing is added and the composer says no speech was heard.
- Given a German clip, then the composer holds its German text.
- Given an empty body, a body over the limit or a text file, then the API answers a validation
  problem and the service is not called.
- Given the server has no transcription set up, then the API answers a service problem and the
  brainstorm state says voice is unavailable.
- Given a phone at 390 px width, then the composer while recording and with a failed clip fits
  without sideways scrolling.

## 5. Notes

- **Owner's decisions of 2026-11-08:** server-side transcription with Whisper, not the browser's
  own speech recognition; the brainstorm chat only; an item in the action menu, not its own mic
  button; tap to start, tap to stop; two minutes at most; the language detected per clip; the
  text into the composer, never sent on its own; no audio kept; a failed clip stays only while the
  page is open; no Record voice item without transcription.
- The speech-to-text service is speaches (faster-whisper, model `small`, port 4430) in pocket-cloud's Docker
  VM, published on the Mac's `127.0.0.1`. The native comms-server reaches it there, as it reaches
  Gitea. Its API is OpenAI-compatible (`POST /v1/audio/transcriptions`), so another compatible
  service can replace it by configuration.
- On the CPU of the VM, a two-minute clip takes several seconds to transcribe; the composer's
  "transcribing" state covers the wait.
- Phones record in different formats (Safari: MP4/AAC, Chrome: WebM/Opus). The server passes the
  clip on as recorded; the service decodes it.
- Depends on the composer's action menu (Gitea #70, design kit 0.13.0) being on `master`.
- A later buddy device uses the same transcription route, then sends the text itself.

## 6. Open questions

None.

# Spec 029 — pocket buddy v1: capture ideas by voice into the brainstorm chat

- **Status:** `Approved` — approved by the owner (2026-11-09)
- **Builds on:** [spec 027](../027-comms-brainstorm-voice/spec.md) (the transcription route) and
  [spec 013](../013-comms-brainstorm-chat/spec.md) (the brainstorm chat and its proposals)
- **Issue:** none; planned with the owner on 2026-11-08 and 2026-11-09

## 1. Problem / intent (WHY)

The owner wants to catch ideas on the go (on a train, walking) without unlocking the phone and
opening an app. A small pocket device with one button, a microphone and a tiny screen does it:
hold, speak, let go, and the idea lands in the brainstorm chat of comms, where Pi answers and may
propose an issue. The buddy shows that the idea arrived, the start of Pi's answer, and lets the
owner create or discard a proposed issue with a press.

v1 is the buddy's program, run on the owner's laptop with the keyboard, microphone and terminal
in place of the device's button, microphone and screen. The device itself follows in a later
spec, once the owner has chosen the hardware; the program is built so that only its parts for the
button, the recording and the screen change.

## 2. Scope

- **In scope:** recording a clip while the button is held; keeping each clip on disk until it is
  in the chat; transcribing it through comms and sending the text to the brainstorm chat; waiting
  while Pi answers or the connection is down; a screen with the status, what was sent and the
  start of Pi's answer; creating or discarding Pi's issue proposals; the laptop's keyboard,
  microphone and terminal as button, recorder and screen.
- **Out of scope:** the device's hardware parts (a later spec); starting an issue by voice;
  spoken answers and a grill mode; reviewing a transcript before it is sent; edit proposals
  (decided in comms); pictures; scrolling through the whole chat; any change to the comms server.

## 3. Requirements (WHAT)

### Recording

1. Holding the button records; letting go ends the clip. A recording ends by itself after two
   minutes.
2. A clip is written to the buddy's outbox on disk as soon as it ends, before anything is sent.
   A clip shorter than half a second is dropped as a slip of the button.
3. On the laptop, the space bar starts and ends a recording (a terminal cannot tell when a key is
   let go); the screen says so.

### Sending

4. The buddy sends the clips of its outbox one at a time, oldest first: it has comms transcribe
   the clip and sends the text to the brainstorm chat as the owner's message. A clip leaves the
   outbox only when its message is in the chat, or when it has no words.
5. A clip without words leaves the outbox and the screen says that no speech was heard.
6. While Pi is answering, the next message waits until Pi is done. While comms cannot be reached,
   the buddy keeps the clips and tries again, waiting longer each time up to one minute.
7. A clip the server refuses as not audio or too large leaves the outbox, and the screen says so;
   any other failure keeps it for the next try.
8. Clips in the outbox survive a restart of the buddy and are sent after it.
9. When the brainstorm chat is not set up, or transcription is not, the screen says so and the
   clips stay in the outbox.

### The screen

10. The screen shows one status line: ready, recording with its time, the number of clips waiting,
    sending, offline, or the last failure.
11. After a message is in the chat, the screen shows its text, then the start of Pi's answer as it
    streams in, cut to what fits (at most 280 characters), with a note that the rest is in comms.

### Proposals

12. When Pi proposes a new issue, the screen shows the project and title and how to create or
    discard it. On the device, a double press creates it and a long press discards it; on the
    laptop, `y` creates and `n` discards.
13. Creating sends the proposal as Pi wrote it, without pictures; the screen then shows the
    issue's number. Discarding creates nothing. A proposal already decided in comms leaves the
    screen.
14. An edit proposal shows only that it waits in comms.

### Running

15. The buddy reaches comms at the address it is given (the owner's tailnet address of comms); it
    holds no secrets. It refuses to start without one.
16. The buddy runs from the repository with one command and stops cleanly on Ctrl+C, keeping its
    outbox.

## 4. Acceptance criteria

- Given the buddy is ready, when the owner records "dark mode for pocket-home", then the brainstorm
  chat in comms gets the message "dark mode for pocket-home" and the buddy's screen shows it and
  then the start of Pi's answer.
- Given comms cannot be reached, when the owner records two clips, then both wait in the outbox
  and the screen says offline with two waiting; when comms is back, both are sent in order.
- Given Pi is answering, when a clip is ready, then it is sent after Pi's answer ends.
- Given the buddy stops with a clip in the outbox, when it starts again, then the clip is sent.
- Given a clip of silence, then nothing is sent and the screen says no speech was heard.
- Given Pi proposes the issue "Dark mode" for pocket-home, then the screen shows it; when the
  owner presses `y`, then comms creates the issue and the screen shows its number.
- Given a proposal on the screen, when the owner discards it in comms, then it leaves the screen.
- Given no comms address, then the buddy does not start and says what is missing.

## 5. Notes

- **Owner's decisions of 2026-11-09:** status plus the start of Pi's answer on the screen; v1
  covers capturing ideas and creating proposed issues; laptop first, hardware later; hold to talk;
  no review before sending; double press creates, long press discards; the program lives in
  pocket-comms.
- **Owner's decision of 2026-11-09:** delivery is at least once. When comms took a message but
  its answer was lost, the buddy sends the clip again, so the chat may show it twice; there is no
  deduplication.
- comms trusts only the Tailscale login that `tailscale serve` adds, so the buddy must run on a
  machine logged in to the tailnet as the owner, not as a tagged device.
- On the device the connection will come from the phone's hotspot; the outbox covers the gaps.
- Starting issues by voice and a grill mode with spoken answers are planned for later specs.

## 6. Open questions

None.

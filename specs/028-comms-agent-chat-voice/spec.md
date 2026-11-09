# Spec 028 — pocket-comms: voice messages in the agent chat

- **Status:** `Done` — approved by the owner (2026-11-09), implemented in its pull request
- **Changes:** [spec 027](../027-comms-brainstorm-voice/spec.md) (out of scope: "recording in any
  other composer")
- **Issue:** none; asked by the owner on 2026-11-09 after trying spec 027

## 1. Problem / intent (WHY)

Spec 027 lets the owner speak a message in the brainstorm chat. The owner talks to the coding
agents just as often, on the phone, and expects the same **Record voice** item there. Today the
agent chat's action menu has only Upload image and Quick replies.

## 2. Scope

- **In scope:** the **Record voice** item in the agent chat's message composer, working exactly as
  in spec 027 (requirements 2 to 13); a way for the app to learn whether voice is set up outside
  the brainstorm chat.
- **Out of scope:** the composer that types into an agent's dialog; the New task form; anything
  spec 027 leaves out.

## 3. Requirements (WHAT)

1. The agent chat's message composer has a **Record voice** item in its action menu when the server
   has transcription set up, and none when it has not.
2. Recording, transcribing, adding the text to the draft, failures, Retry, Discard and the leave
   warning work as spec 027, requirements 2 to 13. The transcript is added to the agent chat's own
   draft and never sent on its own.
3. The API says whether transcription is set up, without the brainstorm chat.
4. While the agent waits in a dialog, the dialog's composer shows no Record voice item; a clip
   recorded before stays with the message composer.
5. Uploading images, quick replies and sending work as before.

## 4. Acceptance criteria

- Given transcription is set up, when the owner opens the agent chat's action menu, then it lists
  Upload image, Record voice and Quick replies; given it is not, then it lists no Record voice.
- Given the draft "Please", when the owner records "add a test" and taps Stop, then the draft is
  "Please add a test" and no prompt is sent.
- Given the service is down, then the clip stays with its reason, Retry and Discard.
- Given `GET /api/v1/speech`, then the API answers whether transcription is set up.

## 5. Notes

- **Owner's decisions of 2026-11-09:** the agent chat's message composer only; not the New task
  form.
- The brainstorm state keeps its `voice` field (spec 027); the new route says the same for every
  screen.

## 6. Open questions

None.

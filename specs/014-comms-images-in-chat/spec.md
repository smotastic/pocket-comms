# Spec 014 — pocket-comms: images in the agent chat

- **Status:** `Approved` — approved by the owner (2026-11-02)
- **Changes:** [spec 004](../004-pocket-comms-v1/spec.md) (the composer and the "You" card, requirements
  8 and 13) and [spec 005](../005-comms-new-task/spec.md) (the task's first prompt)

## 1. Problem / intent (WHY)

The owner drives coding agents from the phone. Often the fastest way to explain a problem is a
picture: a screenshot of a broken screen, a photo of a sketch. Today the composer takes only text,
so the owner has to describe what they see or walk to the desk.

This feature lets the owner attach images to a message for an agent and to a new task. The images
are saved on the machine and the agent gets their paths in the prompt. Claude and Pi read image
files with their read tools.

## 2. Scope

- **In scope:** an attach button in the conversation's composer and in the New task form; up to
  five images per message, shrunk on the phone before upload; uploading them; sending their paths
  with the prompt or the task; thumbnails of them in the conversation's "You" cards; removing old
  images.
- **Out of scope:** images in the brainstorm chat (spec 013), in the terminal view's composer or in
  "Implement with Claude"; pasting or dropping images; HEIC or any format other than JPEG and PNG on
  the server; editing, cropping or annotating images; showing images the agent produced.

## 3. Requirements (WHAT)

### Attaching

1. The conversation's composer and the New task form have an **attach image** button. It opens the
   phone's picker (photo library, camera, files), limited to images, with several images selectable.
2. A message or a task holds at most five images. While five are attached, the button is
   unavailable; picking more than fit attaches the first ones that fit and says how many were left
   out.
3. Before upload, the app shrinks each image so that its longer side is at most 2000 px and saves it
   as JPEG. A PNG whose longer side is at most 2000 px and whose size is at most 1 MB stays PNG,
   unchanged. An image the browser cannot read is not attached; the app says so.
4. Each image uploads as soon as it is attached. Its thumbnail shows above the text while uploading,
   when uploaded, and when the upload failed (with the reason and a retry). Each thumbnail has a
   remove action.
5. A message cannot be sent while an image still uploads or has failed. Removing a failed image
   lets the message go.

### Uploading

6. The server accepts one image per upload: JPEG or PNG by content (not by name or declared type),
   at most 10 MB. Anything else is refused with a validation problem and nothing is saved.
7. The server saves the image in the `images` folder of its state folder under a name it makes
   itself, and answers the image's id. No part of the name or path comes from the request.

### Sending

8. A prompt may carry the ids of up to five uploaded images. The agent gets the trimmed text, a
   blank line, and then each image's absolute path on its own line, in the attached order. With no
   text, the agent gets only the paths. With neither text nor images, nothing can be sent (as
   before).
9. An unknown id, or more than five, refuses the whole prompt with a validation problem; nothing is
   sent to the agent.
10. A successful send clears the text and the images. A failed send keeps both (spec 004,
    requirement 16).
11. A new task may carry up to five image ids the same way. They are sent only with the first prompt
    of a started agent, after the task text as in requirement 8. A task without an agent that
    carries images is refused with a validation problem rather than dropping them silently. The
    task text stays required, because its first line is the workspace label.

### Showing

12. In the conversation, a "You" card whose prompt holds paths to images in the server's `images`
    folder shows those images as thumbnails instead of the path lines. Tapping a thumbnail shows the
    image at full size. A path to an image that no longer exists shows a "removed" placeholder.
13. The server serves an image by its id only, through the identity guard like every other route.
    An unknown id answers `404`.

### Keeping

14. The server removes images older than 30 days at start-up and once a day. Nothing else deletes
    them.

## 4. Acceptance criteria

- Given a conversation with a Claude agent, when the owner attaches two photos and types "Why does
  this look broken?" and sends, then the agent gets the text, a blank line and the two absolute
  paths below `<state>/images/`, and the composer is empty.
- Given an attached image, when the owner sends without text, then the agent gets only the path.
- Given five attached images, then the attach button is unavailable; given four, when the owner
  picks three, then one more is attached and the app says two were left out.
- Given a 4032 × 3024 photo, then the uploaded file is a JPEG of 2000 × 1500.
- Given an image still uploading, then the send action is unavailable.
- Given an upload of a text file renamed `x.png`, then the server answers a validation problem and
  saves nothing; given a 12 MB PNG, the same.
- Given a prompt with an unknown image id, then the API answers a validation problem and Herdr gets
  no request.
- Given the owner's sent prompt with two images, when the conversation shows the "You" card, then
  it shows the text and two thumbnails, and no path lines.
- Given a New task with an agent and one image, then the agent's first prompt is the task, a blank
  line and the path; given a New task without an agent and one image, then it is refused.
- Given an image saved 31 days ago and one saved today, when the server starts, then only today's
  is left.
- Given a request without the allowed Tailscale login, then `GET /images/:id` answers `403`.
- Given a phone at 390 px width with five thumbnails, then the composer fits without sideways
  scrolling.

## 5. Notes

- Images go to the agent as paths because Herdr's `agent.prompt` takes text only. Claude Code and Pi
  read an image file with their read tool. Claude Code may ask permission to read a file outside
  its working folder; the owner answers it in the approval panel as any other question.
- Uploading first and sending ids later keeps the send fast on a phone and keeps the draft when an
  upload fails.
- The state folder is `COMMS_STATE_DIR` (spec 013), default `~/.pocket-comms`.
- The look comes from the design system: the `Composer` gets an attachments slot and an attach
  action, and a new thumbnail component shows an image with its state.

## 6. Open questions

None.

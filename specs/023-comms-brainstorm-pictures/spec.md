# Spec 023 — pocket-comms: pictures in the brainstorm chat and its issues

- **Status:** `Approved` — approved by the owner (2026-11-04)
- **Changes:** [spec 013](../013-comms-brainstorm-chat/spec.md) (the composer, the conversation,
  Pi's input, issue proposals and the app's Gitea writes), [spec 014](../014-comms-images-in-chat/spec.md)
  (out of scope: "images in the brainstorm chat") and
  [spec 022](../022-comms-brainstorm-edits-issues/spec.md) (edit proposals)
- **Issue:** Gitea #52

## 1. Problem / intent (WHY)

On the phone, a screenshot, a sketch or a photo explains an idea faster than typing. Today the
brainstorm chat takes only text, and the issues it files hold only text, so the picture that
started an idea is lost before anyone implements it.

This feature lets the owner attach pictures to brainstorm messages. Pi sees them where the model
can. When Pi proposes an issue or an edit, the owner chooses which chat pictures go along, and
on approval those pictures are uploaded to Gitea as attachments of the issue, so they stay with
it for as long as the issue exists. Nothing reaches Gitea without the owner's approval.

## 2. Scope

- **In scope:** attaching pictures in the brainstorm composer, as spec 014 does for agents;
  showing them in the chat; giving them to Pi as pictures, or saying that Pi cannot see them;
  picture choices on issue and edit proposals; uploading the chosen pictures to Gitea on
  approval, with a retry that never creates a second issue; and the API behind it.
- **Out of scope:** removing or replacing attachments an issue already has; placing pictures
  inside the body's text; pictures Pi produces; pictures in an issue's comments; pasting or
  dropping pictures; formats other than JPEG and PNG.

## 3. Requirements (WHAT)

### Attaching and sending

1. The brainstorm composer has an **attach image** button that works as in spec 014,
   requirements 1 to 5: the phone's picker, at most five pictures per message, shrunk on the
   phone, uploaded at once, thumbnails with remove and retry, and no send while one uploads or
   has failed. Uploads go to the same image store and follow spec 014, requirements 6 and 7.
2. A brainstorm message may carry the ids of up to five uploaded pictures, with or without text.
   An unknown id, or more than five, refuses the whole message with a validation problem; nothing
   is added to the chat and Pi is not asked.
3. A successful send clears the text and the pictures; a failed send keeps both.

### The chat and Pi

4. The owner's message shows its text and its pictures as thumbnails; tapping one shows it at
   full size. A picture that no longer exists shows a "removed" placeholder.
5. Every picture of the chat has a number, counted from 1 in the order it was sent. The chat
   shows each thumbnail's number, and Pi is told the numbers of the pictures in each message.
6. When the brainstorm model accepts pictures, Pi gets each sent picture as a picture together
   with the text. Pi's history keeps the pictures until New chat, so later answers still see
   them.
7. When the model does not accept pictures, the message still goes, Pi is told that pictures with
   these numbers were attached and that it cannot see them, and the chat says "This model can't
   see pictures" next to the composer while pictures are attached, and below each message that
   has pictures.

### Choosing pictures for a proposal

8. When Pi proposes an issue or an edit, it may name up to five chat pictures by number. A number
   that is not a picture of the chat, or more than five, is refused and Pi is told why.
9. An open proposal card shows a **Pictures** section with every picture of the chat as a
   thumbnail with a checkbox; the ones Pi named are checked. The owner may check at most five. A
   chat without pictures shows no section.
10. A picture that no longer exists shows the "removed" placeholder and cannot be checked. An
    approval that names a picture that no longer exists, or that is not a picture of the chat,
    is refused with a validation problem, and nothing is sent to Gitea.
11. Only the pictures checked at approval are uploaded. Discarding a proposal uploads nothing.

### Approving with pictures

12. **Create issue** with checked pictures creates the issue as in spec 013, uploads each checked
    picture as an attachment of that issue, and then appends to the issue's body a blank line,
    a `## Pictures` heading and one Markdown image per picture, linking to the picture's
    attachment in Gitea, in the order of their numbers. With no checked pictures, Create issue
    works exactly as before.
13. **Apply edit** with checked pictures makes the base check of spec 022 (requirement 9) first,
    then uploads each checked picture as an attachment of the issue, and then saves the shown
    title and the shown body with the same `## Pictures` block appended. The issue's existing
    attachments, and pictures the body already links, are never removed or changed.
14. Pi is told the issue was created or updated only when every checked picture is attached and
    the body names them. The decided card shows the pictures that went along.
15. The pictures in Gitea do not depend on the app: the 30-day clean-up of spec 014
    (requirement 14) and New chat remove only the app's copies.

### Failures and retry

16. When an upload fails after Create issue made the issue, the card shows "Issue #N created"
    with a link, says that the pictures are not attached yet and why, and offers **Retry** and
    **Finish without them**. The issue is never created twice.
17. **Retry** uploads only the pictures that are not attached yet, then appends the block for all
    checked pictures to the issue's current body. A picture already attached is never uploaded
    again. **Finish without them** appends the block for the pictures already attached, if any,
    and decides the proposal; Pi is told which pictures were left out.
18. When an upload fails during Apply edit, the issue's title and body are not changed and the
    card stays open with the reason. The pictures already attached are remembered: applying
    again uploads only the others. Discarding the edit then leaves those attachments on the
    issue (Gitea lists them under the issue); the body does not name them.
19. Gitea refusing a picture (too large, a type it does not allow) or being unreachable shows
    Gitea's reason on the card, as spec 013, requirement 18.

### What stays

20. Messages, proposals and decisions without pictures work as in specs 013 and 022. A chat
    saved before this feature loads unchanged.
21. Pi still has no tool that writes. The Gitea token stays on the server; every route goes
    through the Tailscale identity guard; image ids from a request are only looked up, never
    joined into a path.

## 4. Acceptance criteria

- Given the brainstorm sheet, when the owner attaches a photo, types "Like this?" and sends,
  then the chat shows the text with the thumbnail numbered 1, and a model that accepts pictures
  gets the text and the picture in the same turn.
- Given a model that does not accept pictures, when the owner sends a picture, then Pi is told
  picture 1 was attached and it cannot see it, and the chat says "This model can't see pictures".
- Given a message with an unknown image id, then the API answers a validation problem and the
  chat is unchanged.
- Given pictures 1 and 2 in the chat and Pi proposes an issue naming picture 2, then the card
  shows both pictures with only picture 2 checked.
- Given that card, when the owner also checks picture 1 and taps Create issue, then Gitea gets
  one new issue, two attachment uploads to it and one update whose body is the shown body, a
  blank line, `## Pictures` and the two pictures' Gitea links in order; and the card shows the
  issue's number and both pictures.
- Given a card with no checked picture, when the owner taps Create issue, then Gitea gets exactly
  one request, as before.
- Given Gitea refuses the second upload, then the card shows "Issue #N created", the reason,
  Retry and Finish without them; when the owner taps Retry, then Gitea gets one upload (the
  second picture) and one update, and no new issue.
- Given an edit card for #11 with picture 1 checked and #11 unchanged since Pi read it, when the
  owner taps Apply edit, then Gitea gets one upload to #11 and one update with the shown title
  and the shown body plus the Pictures block.
- Given an edit card for #11 whose body changed in Gitea since Pi read it, when the owner taps
  Apply edit, then Gitea gets no upload and no update, and the API answers `issue-changed`.
- Given a picture removed by the clean-up, then the card shows it as removed and it cannot be
  checked, and a request that names it anyway is refused with nothing sent to Gitea.
- Given an open proposal with checked pictures, when the owner taps Discard, then Gitea gets no
  request.
- Given a chat file saved before this feature, when the server starts, then the chat shows as
  before.
- Given a phone at 390 px width, then the composer with five thumbnails and a card with five
  pictures fit without sideways scrolling.

## 5. Notes

- **Owner's decisions of 2026-11-04:** Pi suggests the pictures and the owner adjusts them on the
  card; the pictures go in an appended `## Pictures` block, not inline; a model that cannot see
  pictures still takes them, with a notice; Pi's history keeps the pictures until New chat; a
  failed upload keeps the progress and offers Retry; at most five pictures per proposal; a
  removed picture cannot be checked; an edit only adds pictures.
- Gitea has no upload that is not bound to an issue, so a new issue is created first and its body
  is updated once the pictures are attached. Between the two, the issue briefly has no pictures.
- Gitea's upload is `POST /repos/{owner}/{repo}/issues/{index}/assets` (multipart, field
  `attachment`); its answer's `browser_download_url` is the link in the body. Gitea's own
  attachment settings (allowed types, maximum size) apply.
- Pi's history with pictures makes the chat file larger: each picture is at most a few MB after
  the phone shrinks it, and it goes with New chat.
- The new proposal state (issue created, pictures not yet attached) and the new decision are a
  breaking change to the OpenAPI diff gate. The web app is the only reader and ships with the
  server; the owner accepts it per change in `.pocket-ci/openapi-accepted-changes.txt`, as for
  spec 022.

## 6. Open questions

None.

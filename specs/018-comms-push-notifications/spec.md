# Spec 018 — pocket-comms: push notifications when an agent needs you

- **Status:** `Done` — approved by the owner (2026-11-03), implemented in #38, checked on the iPhone (2026-11-04)
- **Changes:** [spec 004](../004-pocket-comms-v1/spec.md) (the web app becomes an installable PWA
  with a service worker) and [spec 012](../012-comms-flat-overview/spec.md) (the Projects sheet
  gets a Notifications row)

## 1. Problem / intent (WHY)

The owner drives the Herdr agents from the phone, but only learns that an agent waits for them
by opening comms and looking. An agent that asks a question or finishes its turn can sit there
for a long time, unseen. The owner wants the phone to buzz when an agent changes to Needs you,
and to land in that agent's conversation with one tap.

Comms is already a home-screen web app served over HTTPS, so it can use Web Push directly. The
ntfy stack of pocket-cloud issue #31 was considered and not chosen: it needs a second app on the
phone, its tap target (`Click:`) may be ignored on iOS, and comms already has the origin, the
login and the app a tap should open. #31 stays the infrastructure for pocket-mission.

## 2. Scope

- **In scope:** Web Push from the comms server to every device the owner subscribed; a
  push-only service worker; a Notifications switch at the bottom of the overview's Projects sheet;
  notifications when an agent becomes blocked or done.
- **Out of scope:** ntfy; filters per project or per status; holding a push back while comms is
  open on a device; clearing a shown notification from the server (iOS allows no silent push);
  offline caching in the service worker; notifications about the brainstorm chat; anyone but the
  one allowed owner.

## 3. Requirements (WHAT)

### When the server notifies

1. The server watches the agents' status all the time, whether or not a device has comms open.
2. An agent **becomes blocked** when the server sees it `blocked` after it saw it in another
   status, or after it saw it not at all. It **becomes done** when the server sees a new
   completion of the agent (spec 004's completion counter) while it is `done`.
3. What the server sees in its first reading of Herdr after it starts is not a change: agents
   that are already blocked or done then send nothing.
4. A change notifies only when it still holds 10 seconds later: the agent is still blocked, or
   still done with the same completion that the owner has not marked seen in the app. A blocked
   agent notifies once per blocked spell: again only after it left `blocked` and became blocked
   again.
5. While Herdr cannot be reached, nothing notifies, and that is not a change either: when Herdr is
   back, the server compares with what it saw last.

### What the owner gets

6. One notification per change goes to every subscribed device, also to a device that has comms
   open and visible.
7. The title is `<agent> needs you` for a blocked agent and `<agent> is done` for a done one,
   where `<agent>` is how the app names the agent. The body is the agent's project and, when the
   conversation can be read, the agent's open question (blocked) or the start of its last message
   (done), cut to about 120 characters. Without a readable conversation the body is the project
   alone.
8. A newer notification for the same agent replaces the older one on the device.
9. Tapping a notification opens comms on that agent's conversation. When the agent is gone by
   then, it opens the overview.

### Turning it on and off

10. At the bottom of the overview's Projects sheet, a **Notifications** row has a switch that
    turns notifications on or off for this device only.
11. Turning it on asks the browser for permission, then subscribes the device at the server.
    Turning it off unsubscribes the device at the server and in the browser.
12. Where the browser offers no Web Push, such as iOS Safari outside the home screen, the row has
    no switch and says: "Add comms to your home screen to get notifications."
13. When the owner denied permission, the row has no switch and says: "Blocked: turn on in
    Settings › Notifications › Comms." The app never asks again by itself. Each time comms comes to
    the front it checks the permission again; once it is allowed, the switch shows (off), and one
    tap subscribes.
14. The switch shows whether this device is subscribed, as the browser reports it.

### Devices and keys

15. The server keeps the subscriptions of all devices and sends to each. A subscription that the
    push service reports as gone (`404` or `410`) is removed.
16. The server creates its push key pair (VAPID) itself the first time it needs one and keeps it,
    so subscriptions survive a restart and a deploy. No new setting is needed.
17. Subscribing and unsubscribing go through the same Tailscale identity guard as every other
    route.

## 4. Acceptance criteria

- Given an agent that is working, when it becomes blocked and is still blocked 10 s later, then
  each subscribed device shows "`<agent>` needs you" with the project and the question.
- Given an agent that becomes blocked and answers itself within 10 s, then no notification goes
  out.
- Given an agent that finishes a turn, when the owner does not mark it seen within 10 s, then each
  subscribed device shows "`<agent>` is done". When the owner opened it within the 10 s, then
  nothing goes out.
- Given agents that are blocked or done when the server starts, then no notification goes out
  for them.
- Given a blocked agent that already notified, while it stays blocked, then no second
  notification goes out.
- Given two subscribed devices, when an agent becomes blocked, then both show the notification.
  Given a device whose subscription the push service reports as gone, then the server removes it
  and keeps sending to the other.
- Given a notification, when the owner taps it, then comms opens on the agent's conversation, or
  on the overview when the agent is gone.
- Given the Projects sheet in the home-screen app with permission not yet asked, when the owner
  turns the switch on and allows, then the device is subscribed. When they turn it off, then the
  device gets no more notifications.
- Given iOS Safari outside the home screen, then the row shows the home-screen hint and no switch.
  Given denied permission, then the row shows the Settings hint and no switch.
- Given a server restart, then subscribed devices keep getting notifications without
  subscribing again.
- **Manual check after deploying** (no CI can do it): on the owner's iPhone, with comms on the
  home screen, a blocked agent buzzes the phone, and tapping the notification opens its
  conversation.

## 5. Notes

- **Platform facts that shaped this spec:** on iOS, Web Push works only for a web app added to
  the home screen (iOS 16.4 and later), and permission can be asked only from a tap. Every push
  must show a notification; WebKit revokes a subscription whose pushes show nothing. That is why
  a notification shows even while comms is open (requirement 6) and why the server cannot clear
  one. After a denial, iOS lists the app under Settings › Notifications, where the owner can allow
  it again.
- **Privacy:** Web Push payloads are encrypted end to end; Apple's or Google's push service sees
  only that a push went to a device. The payload holds the agent's name, project and at most the
  first 120 characters of the question or message.
- **"Needs you" stays the overview's rule:** requirement 4's done check matches spec 004's
  `needsYou` (done and not seen), so a notification goes out only for what the overview would
  also list under Needs you.
- **Owner's decisions of 2026-11-03:** Web Push over ntfy; notify on blocked and done; the 10 s
  wait and one push per spell; every subscribed device; files in the state folder and keys made
  by the server; the switch at the bottom of the Projects sheet; no filters in v1; a push-only
  service worker; the `web-push` library; always show (holding a push back per device may come
  as a later spec).

## 6. Open questions

None.

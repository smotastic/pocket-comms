# Tasks 018 — pocket-comms: push notifications when an agent needs you

- **Plan:** [plan.md](./plan.md)

Each task is small and independently testable, a vertical slice where possible. Tick its checkbox
in the task's own commit.

## Server

- [x] **T01** — Domain `notification.ts`: `watchStep` (baseline, blocked spells, new completions
      while done, agents that appear or leave), `stillHolds`, `excerptOf`, `notificationOf`
      (titles, body cut to 120 characters, tag, URL) and the `PushSubscription` type
  - Gate: `pnpm nx test comms-domain`

- [ ] **T02** — Contract: the `push` group (`GET /push/key`, `POST /push/subscriptions`,
      `POST /push/subscriptions/remove`), the `PushSubscription` wire schema (`https` endpoint,
      keys not empty) and the regenerated OpenAPI document
  - Gate: `pnpm nx test comms-contract` and `pnpm nx run comms-server:openapi`

- [ ] **T03** — Application: the push ports, `PushInbound` with subscribe (idempotent by endpoint),
      unsubscribe and public key, and the fakes in `src/testing`
  - Gate: `pnpm nx test comms-application`

- [ ] **T04** — Application: the notify use case (10 s wait, re-check, one push per spell, Herdr
      unavailable, excerpt from the transcript, every subscription, `Gone` removed)
  - Gate: `pnpm nx test comms-application`

- [ ] **T05** — Infrastructure: the push file store in the state folder (keys made once,
      subscriptions kept, atomic writes, a broken file reported)
  - Gate: `pnpm nx test comms-infrastructure`

- [ ] **T06** — Infrastructure: the `web-push` sender (`TTL`, `Urgency`, `404`/`410` as `Gone`)
      against a local fake push endpoint
  - Gate: `pnpm nx test comms-infrastructure`

- [ ] **T07** — API handlers behind the identity guard, and the composition: push layers from the
      state folder, the notify use case forked for the server's lifetime, memory mode with a
      logging sender
  - Gate: `pnpm nx test comms-api` and `pnpm nx test comms-server`

## Web app

- [ ] **T08** — `public/sw.js` (show every push, tap opens the conversation), `notifications.ts`
      and the Notifications row at the bottom of the Projects sheet (unsupported, denied, off, on;
      re-check when comms comes to the front); a tap on a gone agent lands on the overview
  - Gate: `pnpm nx test comms-web`

## Wrap-up

- [ ] **T09** — `packages/comms/AGENTS.md` and the README name spec 018 and the push rules;
      `pnpm verify:local`; spec and plan status `Done` after the manual iPhone check
  - Gate: `pnpm verify:local`

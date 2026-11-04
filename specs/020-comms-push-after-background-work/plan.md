# Plan 020 — pocket-comms: hold the done push while background work runs

- **Spec:** [spec.md](./spec.md)
- **Status:** `Approved` — approved with the spec by the owner (2026-11-04)

## 1. Affected projects

| Path                         | Change                                                                                                                                             | Nx tags                            |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `packages/comms/application` | The background count of an agent moves out of `agents.ts` into a helper the notifier shares; the notifier holds a done change while it is above 0. | `scope:comms`, `layer:application` |
| `packages/comms/AGENTS.md`   | One line: the done push follows Needs you, including background work.                                                                              | —                                  |

The domain, the transcript adapters, the API and the web app do not change: spec 019 already
reads the background work, and the notification is the same.

## 2. Contract changes

None.

## 3. Migrations

None. Nothing new is stored; a held change lives only in the notifier's fiber (requirement 8).

## 4. Design

- **One background count.** `agents.ts` has `backgroundOf(agent)`: the agent's transcript source,
  `TranscriptOutbound.background`, a read failure as no work, then `runningAt` with the clock.
  It moves into `use-cases/background.ts` as `makeBackgroundOf`, which yields the function from
  `TranscriptOutbound`. The overview and the notifier then count with the same code
  (requirement 1).
- **The held wait.** `deliver(change)` in `notify.use-case.ts` stays as it is for a blocked
  change (requirement 6). For a done change it becomes a loop of 10 s rounds:
  1. When the change is seen, it notes whether the agent has background work.
  2. Each round sleeps 10 s, reads Herdr and the seen set, and stops without a push when
     `stillHolds` fails: the agent is gone, no longer done, has a new completion, or was seen
     (requirement 4).
  3. It reads the agent's background count. With work running, the round only notes that; the
     next round waits again (requirement 2).
  4. It sends when this round and the round before both found no work, so the agent has been
     quiet for at least 10 s before the push (requirement 3). Without background work at the
     change, the first round sends at 10 s, exactly as in spec 018 (requirement 5).
- **Why two quiet rounds:** when background work ends, Claude wakes up within a second or two
  and starts a new turn. A push sent at the first quiet round could catch the agent still
  "done" with the old completion just before it resumes, and the new turn would then push again.
  Ten quiet seconds let the resumed turn take over the change.
- **A newer change replaces the held one.** The notifier already keeps one pending change per
  agent in a `FiberMap`; the done change of a resumed turn interrupts the held one, so only the
  newest can send (requirement 4).
- **Cost:** a held change reads the agent's session file every 10 s. The adapter keeps its offset
  per file (spec 019), so each read is only the new lines.

## 5. Test strategy

- **Unit (application, `notify.use-case.spec.ts`, `TestClock`):**
  - a done change with a running shell sends nothing after 10 s or after an hour;
  - once the shell ends, it sends after the agent has been quiet for 10 s, and not before;
  - a shell that ends and a new turn that finishes give one push, for the new completion;
  - a done change seen while the shell runs sends nothing;
  - a blocked change with background work still sends at 10 s;
  - work that starts again inside the quiet 10 s holds the change again;
  - the existing spec 018 cases stay green unchanged (requirement 5).
- **Overview:** the existing overview and agents specs prove the moved `backgroundOf` still
  counts the same.
- **Boundaries:** no new imports across layers; `pnpm verify:local` and dependency-cruiser.

## 6. Risks

- **A shell that never ends** holds the done push forever, as decided (no cap). The overview
  shows the background marker, so the owner can see why the phone stays quiet.
- **A session file that cannot be read** counts as no background work, as in the overview, so
  the push then behaves as in spec 018 rather than staying silent.

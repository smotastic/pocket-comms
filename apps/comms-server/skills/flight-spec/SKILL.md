---
name: flight-spec
description: Write a feature's spec.md from the owner's confirmed grilling. The second step of a full flight under the flight rules; fixes, refactors, docs and chores fly the hop lane and need no spec.
---

# flight-spec — Write the spec

Write `specs/NNN-slug/spec.md` in the planet from the confirmed grilling summary.

## Rules

- Take the next global id: the highest `specs/NNN-*` plus 1, zero-padded to 3 digits. Check open
  pull requests for the same number.
- Copy [`spec-template.md`](spec-template.md) by hand; there is no generator.
- Define WHAT and WHY, never HOW.
- Every decision of the grilling lands in the spec; nothing new is invented. A gap the grilling
  left open that changes behaviour is a stop (flight rules, section 3): ask, do not guess.
- Leave no open questions behind.
- The status stays `Draft` until `flight-verify` passes.

Then continue with `flight-plan`.

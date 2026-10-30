---
name: grill-me
description: Proactive requirements-interview run BEFORE any non-trivial task (feature, refactor, design/architecture or library choice, ambiguous bug, any multi-step work) to kill misalignment, then execute autonomously. Asks many small AskUserQuestion choices, each with a recommended answer. Skip only truly trivial one-step asks. Also triggers on "grill me", "interrogate me", "stress-test the plan".
---

# Grill Me — interview to alignment, then run autonomously

Misalignment — building the wrong thing precisely — is the #1 failure. Front-load the clarity, then run unattended.

## When

Start of any non-trivial task, before changing code. Skip trivial one-step asks.

## How — via the AskUserQuestion tool (user clicks an option or types their own)

- **Many small questions, not few big ones** — one decision per question; favour simple atomic choices over compound ones.
- **Propose 2–4 concrete answers** each; put your **recommendation first**, suffixed "(Recommended)", with a one-line why. "Other" lets them type a custom answer. Use `multiSelect` when options can co-apply.
- **Explore first** — read the code/docs to answer; only ask what genuinely needs the human.
- **One branch at a time** — walk the decision tree; ask in focused rounds, never a pile at once.
- **Reflect back** the compound understanding in 1–2 lines whenever a key insight lands or a confusion clears, to keep a running shared picture.
- Continue until nothing load-bearing is unknown: scope, edge cases, data shape, UX, errors, **non-goals**, done-criteria.

## Close

Summarize the full **compound understanding** (decisions, non-goals, done-criteria) and ask — via AskUserQuestion — **"Is this correct?"** ("Yes, proceed" recommended; "Other" to correct). Once confirmed, **execute fully autonomously**, end-to-end (~99% no further questions); re-ask only on a genuinely new fork or something irreversible / out of scope.

## In plan mode

If already in plan mode, grill FIRST, then fold the locked answers into the plan and hand it to **ExitPlanMode** for approval — never call ExitPlanMode before grilling. (Outside plan mode: run the loop above, then execute.)

---
name: code-review
description: Review a change and report findings. Use for a code review, a pull request review assigned to you, a review before opening a pull request, and the mandatory per-task gate after speckit-implement. Takes a pull request, a commit range, a branch, or uncommitted changes. Produces findings with severity, confidence and evidence; it reports and never changes code.
---

# code-review — review a change, report findings

## Overview

**Core principle:** verify before you claim. A claim without evidence is not a finding.

This skill produces findings and stops. It never edits code. Acting on the findings belongs to
whoever holds them:

- In the spec-kit flow, [`speckit-implement`](../speckit/implement/SKILL.md) fixes the blocking
  findings before its commit and records the follow-up findings as tasks.
- On an assigned pull request, the human owner decides.

## When to use

- **After `speckit-implement` finishes a task**, on that task's diff, before the commit step. This
  is the mandatory per-task gate of ADR 0001.
- **When a pull request review is assigned to you.**
- **Before opening a pull request**, to catch what a human reviewer would otherwise find.

Do not use it to re-check what a repository gate already checks. See
[Out of scope](#out-of-scope).

## Whose change is it

The two workflows fail in opposite directions. Name which one you are in before reviewing.

### Your own change — the task you just implemented

The failure mode is the blind spot: you already believe the code is right.

- Read the diff as if a stranger wrote it.
- Do not defend a decision because you made it. "I did it that way on purpose" is not evidence.
- The intent is known to you, so `question` findings should be rare. Confirm or drop instead.

### Someone else's change — an assigned pull request

The failure mode is missing context: you see the diff, not the reasons.

- Assume a reason exists until you have checked. Read the git history of the lines you doubt.
- Where the reason stays unclear, ask. That is what the `question` confidence value is for.
- Never claim a rule violation without quoting the rule.

## Modes and target resolution

Two modes. Resolve the target in this order and state the result before reviewing:

| Order | Prompt contains                           | Mode | Target                                      |
| ----- | ----------------------------------------- | ---- | ------------------------------------------- |
| 1     | A pull request number or URL              | PR   | That pull request                           |
| 2     | A commit range or a single commit         | Diff | That range                                  |
| 3     | A branch name with an open pull request   | PR   | That pull request                           |
| 4     | A branch name without a pull request      | Diff | Merge base with `master` to the branch head |
| 5     | Nothing, and the working tree has changes | Diff | Uncommitted changes                         |
| 6     | Nothing else applies                      | —    | Stop and ask which change to review         |

The per-task gate is mode 5 or mode 2, on the task's own diff.

Mode 5 covers staged, unstaged and untracked changes together. Detect them with
`git status --porcelain`, and read them with `git diff`, `git diff --staged`, and the content of
each untracked file. A clean working tree is not mode 5; it falls through to mode 6.

Never guess the target. A review of the wrong change costs more than one question.

Record the head commit SHA of the target before step 1 of the workflow. The report and the posting
step both need it.

## Workflow

1. **Resolve the target** and record its head commit SHA.
2. **Read the rule sources** that apply to the changed files:
   - `.specify/memory/constitution.md` — always, it wins over every other document.
   - The root `AGENTS.md` and the nearest `AGENTS.md` for each changed directory — always.
   - `.dependency-cruiser.cjs` and the Nx tags — when imports or project configuration change.
   - [`docs/engineering/code-comments.md`](../../../docs/engineering/code-comments.md) — when
     comments change.
   - [ADR 0003](../../../docs/architecture/adr/0003-hexagonal-architecture-with-effect-services.md)
     and the [`effect` skill](../effect/SKILL.md) — when backend service or library code changes.
3. **Fan out to review subagents.** Pick from the fixed list in
   [Review concerns](#review-concerns); run only the concerns whose condition the diff meets. Give
   each subagent the diff, the applicable rule sources, and the finding format. Each subagent
   returns its candidate findings **and its own model identifier**. A subagent cannot always read
   its own model identifier. Take the identifier from the caller when the caller knows it, and
   write `unknown` when neither side does. Never guess one.
4. **Verify every candidate** against [Before you claim](#before-you-claim). A separate subagent
   re-checks each finding against the code and sets its confidence. Split a candidate the verifier
   cannot confirm by the reason: the code contradicts the claim — drop it, it was a false positive;
   the claim stands but the intent is unknown — mark it `question` and ask the author.
5. **Report.** Print the report and stop. In diff mode the review ends here.
6. **Post, PR mode only, after the human owner approves.** Follow
   [`references/posting.md`](references/posting.md).

The same workflow serves both modes. Diff mode has no step 6.

This skill states no preference about which model reviews. The caller decides that; for the
per-task gate, `speckit-implement` sets the rule.

## Review concerns

| Concern           | Run it when                                       | It looks for                                                                          |
| ----------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Correctness       | Always                                            | Logic errors, unhandled null or undefined, race conditions, wrong boundary values     |
| Repository rules  | Always                                            | Constitution and `AGENTS.md` violations, quoted with the rule text                    |
| Layer boundaries  | Imports, project configuration or Nx tags change  | Crossings that `.dependency-cruiser.cjs` forbids, `any` leaks across a boundary       |
| Error handling    | Catch blocks, fallbacks or error responses change | Silently swallowed errors, a fallback that hides the cause, an unusable error message |
| Tests             | Behaviour changes, or test files change           | Missing coverage of a new branch or error path, tests bound to implementation detail  |
| Comments and docs | Comments or documentation change                  | A comment that contradicts the code, or that restates what the code already says      |

Add no concern outside this list. A repeatable set is what makes two reviews comparable.

## Before you claim

Every candidate passes this filter before it becomes a finding. A candidate that fails any check is
dropped, not softened.

1. **Is it wrong for _this_ codebase**, or only unfamiliar? Unfamiliar is not a finding.
2. **Does the current code have a reason?** Read the git history of the lines you doubt. Legacy and
   compatibility reasons are reasons.
3. **Do you have the full context**, or only the diff? If only the diff, the honest value is
   `question`.
4. **Does a rule actually say it?** Quote the rule with its file path, or drop the claim. "Good
   practice" is not a rule.
5. **YAGNI.** Never ask for a feature nothing calls. Grep for real usage first. If it is unused,
   the finding is "remove it", not "implement it properly". Do not recommend removing or changing
   API contracts (`contract` packages) or database schemas based only on an in-repo search; external
   callers may exist. Raise these changes for a spec and an owner decision (constitution
   principles 3 and 8).
6. **Does the fix need a design or architecture decision?** Then it is not a comment. Escalate it to
   the human owner, as `AGENTS.md` requires for any guardrail crossing.

## Out of scope

Do not report:

- Anything lint, formatting, type checking or the build catches. `pnpm verify:local` and CI own
  those. Do not run them either.
- Problems that already existed before the change, on lines the change does not touch.
- Style preferences that no repository rule states.
- Intentional parts of the change that the specification or the task asks for.
- Findings a suppression comment already silences on purpose.
- Anything not worth fixing. If it does not deserve a fix, it is not a finding.

## Finding format

Every finding carries these six fields. Other skills reference this definition instead of
restating it.

| Field      | Values or content                                                                           |
| ---------- | ------------------------------------------------------------------------------------------- |
| Severity   | `blocking` or `follow-up`                                                                   |
| Confidence | `confirmed` or `question`                                                                   |
| Location   | `path/to/file.ts:42`; in PR mode also a permalink with the full commit SHA and a line range |
| Impact     | What breaks, and under which input or state                                                 |
| Source     | The code that proves it, or the rule text quoted with its file path                         |
| Concern    | The review concern that produced it                                                         |

Every finding is something to fix. **Severity** answers only when:

- `blocking` — fix before the merge. A correctness or security defect in the change, a layer
  boundary crossing, or a constitution violation.
- `follow-up` — fix, but as its own task, not as scope growth in this change.

There is no optional severity. An observation that does not deserve a fix is not a finding; leave
it out.

**Confidence** answers whether the review could prove it:

- `confirmed` — the verifier reproduced the reasoning against the code.
- `question` — the claim stands, but the intent behind the code is unknown. Ask the author.

The two axes are independent. A `blocking` finding may be a `question`, and often is when the
intent is unclear.

## Report

Direct language, no softening. Group by severity, blocking first. Number the findings across the
whole report so the human owner can approve by number. Every finding prints all six fields of the
[Finding format](#finding-format): the severity is the group heading, the confidence follows the
claim, and `Location`, `Impact`, `Source` and `Concern` each take their own line.

```markdown
Code review — <target>, head <sha>
Checked: <concerns that ran>
Models: orchestrator <id>, finders <ids>, verifier <id>

## Blocking (n)

1. <one-line claim> — `confirmed`
   Location: <file:line>
   Impact: <what breaks, when>
   Source: <quoted rule with path, or the proving code>
   Concern: <the review concern that produced it>

## Follow-up (n)

...
```

### When there are no findings

Say so, and list what the review covered:

```markdown
Code review — <target>, head <sha>
No findings.
Checked: correctness, repository rules, layer boundaries, error handling, tests, comments.
Models: orchestrator <id>, finders <ids>, verifier <id>
```

An empty report is evidence of coverage. Never shorten it to "looks good".

## Posting

PR mode only, and only after the human owner approves the report. Diff mode ends at the report
and posts nothing.

Read [`references/posting.md`](references/posting.md) before posting. It holds the head SHA
re-check, the inline and summary comment mechanics, the model line, the comment wording rules, and
how to reply in a thread.

## When a finding is refuted

The author may show that a finding is wrong. Withdraw it in one line and move on.

```
✅ "Withdrawn — the guard is in the caller at services/reading.ts:88."
❌ A defence of why the finding was reasonable
❌ A long apology
```

Never argue a finding that the code disproves. Never keep a withdrawn finding in the report.

## Common mistakes

| Mistake                                 | Fix                                                            |
| --------------------------------------- | -------------------------------------------------------------- |
| Claiming a rule without quoting it      | Quote the rule with its file path, or drop the claim           |
| Reviewing your own work as the author   | Read it as if a stranger wrote it                              |
| Reporting what CI already catches       | Leave it out; the gate reports it                              |
| Padding the report with observations    | If it does not deserve a fix, it is not a finding              |
| Asking for a feature nothing calls      | Grep first; unused means remove it                             |
| Softening a blocking finding's wording  | Wording asks, the severity label and the evidence carry weight |
| Guessing which change to review         | Resolve the target by the table, or ask                        |
| Posting before the human owner approves | The review stops at the report                                 |

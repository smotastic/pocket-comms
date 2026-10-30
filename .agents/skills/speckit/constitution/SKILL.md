---
name: speckit-constitution
description: Govern approved updates to the project constitution.
---

# speckit-constitution — Change the constitution

A governance skill, not a workflow step. It changes `.specify/memory/constitution.md` only when
the human owner decides a principle must change.

## Rules

- Never use it to bypass a principle for feature work.
- Keep the heading structure.
- Bump the semantic version (MAJOR: a principle removed or redefined; MINOR: a principle added or
  materially extended; PATCH: wording) and update the sync impact report at the top.
- Update `AGENTS.md`, docs, templates and skills that the change affects, in the same pull request.
- Record a non-trivial change in an ADR.
- Get the human owner's approval before committing.

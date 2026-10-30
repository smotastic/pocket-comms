# AGENTS.md Convention

Agent guidance uses progressive disclosure: the root `AGENTS.md` is small, and deeper files add
only what is local to their folder. `AGENTS.md` is the only agent entry file; no tool-specific
copies (`CLAUDE.md` may be a symlink to it).

## Where guidance goes

Place guidance at the narrowest scope where every reader needs it:

| Guidance                              | Location                           |
| ------------------------------------- | ---------------------------------- |
| Needed for almost every task          | Root `AGENTS.md`                   |
| Non-negotiable principle              | `.specify/memory/constitution.md`  |
| Architecture decision                 | An ADR in `docs/architecture/adr/` |
| Shared engineering rule               | `docs/engineering/`                |
| Service or package rule               | `packages/<service>/AGENTS.md`     |
| App-specific rule                     | `apps/<app>/AGENTS.md`             |
| Blueprint guidance                    | `blueprints/<name>/AGENTS.md`      |
| Task procedure                        | A skill in `.agents/skills/`       |
| Feature requirement / approach / step | `spec.md` / `plan.md` / `tasks.md` |

Prefer the environment for facts an agent can inspect: package scripts, the directory tree,
command help. Document a command only when its use or order is not obvious.

## Root file

The root `AGENTS.md` holds a one-line description, the essential commands, pointers every task
needs (constitution, nearest `AGENTS.md`), short pointers for named task types and one escalation
rule. Aim for about 50 lines. It does not copy the constitution, ADRs or skills.

## Nested files

- Create one only when an agent working there needs facts the root does not give: a local
  invariant, a non-obvious command, a pitfall.
- Do not repeat or link back to the root file; agents already read it.
- An app's `AGENTS.md` points to its service's `packages/<service>/AGENTS.md` when that exists
  and adds only app-specific rules.
- Keep each file short; delete lines that no longer change behaviour.

## Keeping it current

- Update guidance in the same pull request as the change that makes it stale.
- A guidance file that disagrees with the constitution or an ADR is a defect; the higher document
  wins.

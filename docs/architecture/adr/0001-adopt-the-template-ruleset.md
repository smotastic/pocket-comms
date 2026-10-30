# ADR 0001 — Adopt the template ruleset

- **Status:** Accepted
- **Date:** 2026-10-19
- **Related:** constitution principles 4–10

## TL;DR

We will start this repository from the template and keep its ruleset: the constitution, the
tiered spec-first workflow with one human gate, the per-task review, the Git conventions and the
machine-enforced layer boundaries. The ruleset lets coding agents do most of the work while the
human owner keeps control of intent and architecture.

## Context

Most code in this repository is written by coding agents. Agents need a clear agreement on what
they may do alone, what needs a human, and which gate proves each claim. Without it, each project
reinvents the rules and quality drifts.

The ruleset must stay light enough for small, private projects: a typo fix must not need a spec.

**Scope:** the rules and the tooling that enforces them. Each stack choice gets its own ADR.

## Decision

We will adopt from the template:

- **The constitution** (`.specify/memory/constitution.md`). Changes go through the
  `speckit-constitution` skill with human approval.
- **Tiered spec-first.** Features and new behaviour follow `speckit-specify` → `speckit-plan` →
  human gate (spec and plan together) → `speckit-tasks` → `speckit-implement`. Fixes, refactors,
  docs and chores need only a conventional commit. Architecture decisions are ADRs.
- **The spec layout** `specs/NNN-slug/{spec,plan,tasks}.md` with global sequential ids.
- **Test-first and per-task review.** `speckit-implement` works RED → GREEN → REFACTOR and runs the
  `code-review` skill on each task diff before its commit.
- **Git conventions:** branch names, Conventional Commit subjects and pull request titles, checked
  by `pnpm validate:conventions` and CI.
- **Boundaries:** dependency-cruiser, the Nx module boundaries and the ports check.
- **Local and CI gates:** `pnpm verify:local` on pre-push; CI runs the full pipeline.

## Consequences

- **Positive:** agents know exactly where a change goes and how it is proven; small changes stay
  cheap.
- **Negative / trade-offs:** the tooling must be kept in step with the rules; a new rule usually
  needs a check, not only a sentence.
- **Follow-ups:** none.

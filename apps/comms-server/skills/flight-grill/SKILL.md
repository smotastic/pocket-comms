---
name: flight-grill
description: Grill the owner about a full-flight piece of work until you share one understanding; their confirmation approves the spec and plan that follow. The first step of a full flight under the flight rules.
---

# flight-grill — Grill the owner

The owner's one piece of work in a full flight (flight rules, section 2). Spend their attention
well: you have the code; they have the intent.

## Rules

- **Explore first.** Read the issue, the planet's `AGENTS.md`, glossary, ADRs and the code the
  work touches. Never ask the owner a fact you can look up.
- **Ask in rounds.** Map the decisions as a tree. Each round, ask every decision whose
  prerequisites are settled, and none whose answer depends on another open question.
- **One decision per question**, with two to four concrete answers, your recommendation first and
  a one-line reason. Use the question tool (flight rules, section 5).
- **Cover what makes the work buildable alone:** scope and non-goals, behaviour and edge cases,
  data shape, errors, the words in the glossary, architecture choices and their ADRs, and what
  done means. Probe each with a concrete scenario.
- **Challenge the language.** A term that conflicts with the glossary is called out at once.

## Close

1. Write the shared understanding as a summary: decisions, non-goals, done criteria, any ADR the
   work needs and what it decides.
2. Ask: "Is this correct?" A yes approves the work; a correction starts another round.
3. Keep the confirmed summary for `flight-spec`, and on a mission post it as a comment on the
   issue.

Then go on alone with `flight-spec`. Ask again only at a stop of the flight rules (section 3).

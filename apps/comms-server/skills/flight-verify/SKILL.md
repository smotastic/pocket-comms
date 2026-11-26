---
name: flight-verify
description: Check a full flight's spec, plan and tasks against each other and the rules before any code is written, fix what it finds, and approve them. Replaces the owner's spec and plan approval; adapted from Spec Kit's /speckit.analyze.
---

# flight-verify — Verify spec, plan and tasks

The gate between planning and code. It does what the owner's approval used to: it proves the
plan and tasks do everything the spec says, and nothing it does not.

## Inputs

`spec.md`, `plan.md` and `tasks.md` of the feature, the planet's constitution and nearest
`AGENTS.md`, its glossary, any ADR the plan adds, and the confirmed grilling summary. A missing
file is CRITICAL.

## Passes

Read everything, then look for:

1. **Coverage gaps:** a requirement or acceptance criterion no task serves; a task that serves no
   requirement; an acceptance criterion no test in the plan proves.
2. **Inconsistency:** the plan or tasks contradict the spec; entities, fields or terms differ
   between files; task order breaks a dependency.
3. **Grilling drift:** the spec or plan adds, drops or changes a decision of the grilling.
4. **Rule conflicts:** the plan breaks the flight rules, the planet's constitution or an accepted
   ADR, or hides a stop of the flight rules (section 3) such as a migration.
5. **Ambiguity:** vague words with no measurable criterion ("fast", "robust", "where sensible"),
   placeholders, TODOs.
6. **Underspecification:** a requirement or task without an object or an outcome; a reference to
   something defined nowhere.
7. **Duplication:** near-duplicate requirements or tasks.
8. **Language drift:** words the glossary lists under _Avoid_.

## Severity

| Severity     | Means                                                                                         |
| ------------ | --------------------------------------------------------------------------------------------- |
| **CRITICAL** | A rule conflict, grilling drift, a missing file, or a requirement no task serves              |
| **HIGH**     | A contradiction, an untestable acceptance criterion, an ambiguity that changes behaviour      |
| **MEDIUM**   | Language drift, a missing edge case or non-functional requirement, a task with no requirement |
| **LOW**      | Wording, minor redundancy                                                                     |

## Steps

1. Run the passes without changing any file. Write the findings as a table (id, severity, file
   and line, finding, fix) in `verify.md` next to the spec, with a coverage table: each
   requirement and the tasks that serve it.
2. If there is a CRITICAL or HIGH finding, fix it in the spec, plan or tasks, never by weakening
   a rule, and run the passes again. A fix may never contradict the grilling.
3. After the second round, a CRITICAL or HIGH finding that remains is a stop (flight rules,
   section 3): ask the owner, with the finding and your recommended fix.
4. When none remains, set the spec's and plan's status to `Approved` — grilling of YYYY-MM-DD,
   verified — and keep `verify.md` with the remaining MEDIUM and LOW findings for the pull
   request.

Then continue with `flight-implement`.

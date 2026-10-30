# Source Comment Conventions

- **Status:** Accepted
- **Repository scope:** this monorepo
- **Audience:** Contributors, reviewers, and coding agents

A comment answers **why the code is the way it is**, in a form that is still true once the spec that
prompted it is archived.

## Rules

- **Never cite spec, requirement, plan, task or finding IDs in source.** Not `spec req 21`, not
  `Requirement 42`, not `plan §4.4`, not `T14`, not `spec 013 T28`. They rot: the spec gets
  archived and the code still cites it, and a reader without the spec open learns nothing. Write the
  reason in plain words, or cite a durable document (`ADR 0001`, a decision record). Pointers to _open_
  follow-up tickets are the one exception — they are meant to be chased.
- **Three lines is the norm.** Longer needs a reason a reviewer would accept: a genuinely tricky
  algorithm, not the story of how the code came to be. If it takes a paragraph, it is an ADR.
- **Verification evidence is not a comment.** Evidence such as "Measured: `couldNotResolve: true`",
  "green before this edit", or "no rule matched this shape before" proves the work to a reviewer, not
  to the next reader. Put it in the task's verification note in `tasks.md` or in the pull request.
- Keep the rationale that prevents a regression ("this constant has its own file because keeping it
  in `configure-app.ts` created an import cycle"), and contract semantics a caller cannot infer from
  the signature ("filtering and counting happen before slicing").
- Put durable architectural reasoning in an ADR — not in a file header that only one reader will
  ever find.
- A comment that says the rules are the source of truth and the comment is not, is not worth the
  lines it takes.

## Related

- [Architecture decision records](../architecture/adr/README.md)

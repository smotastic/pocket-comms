# Posting a review to a pull request

The human owner may approve all findings, or only some by number.

Before posting:

1. Re-read the pull request head SHA.
2. If it differs from the reviewed SHA, do not post. Say which SHA was reviewed and which is
   current, and offer to review again.

Then post:

- One inline comment per approved finding, on its line.
- One summary comment holding the counts, the checked concerns, and the model line.

## Model line

Every posted review names the models that produced it:

```markdown
Reviewed by <orchestrator id>; finders <ids>; verifier <id>.
```

Collect each identifier from the subagent that reported it. Never guess a model identifier. If a
subagent does not report one, write `unknown` for it.

## Comment wording

Comments ask, they do not instruct — at every severity. The severity label and the evidence carry
the weight, so the wording does not have to.

| Instead of                      | Write                                                                       |
| ------------------------------- | --------------------------------------------------------------------------- |
| "Guard this before the call."   | "This dereferences `x` before the null check. How about guarding it first?" |
| "Use the repository port here." | "What do you think about going through the port here? `AGENTS.md` says ..." |
| "Missing test."                 | "The new error branch looks untested. How about a case for it?"             |

Keep each comment short. State the observation, then ask. Cite the file, the rule or the code that
supports it. No gratitude, no praise, no emoji.

## Replying in a thread

When answering an inline review comment in Gitea, reply in the comment thread, not as a top-level
pull request comment. Gitea threads review comments by file and line, so post a review comment on
the same `path` and line:

```bash
tea api -X POST 'repos/{owner}/{repo}/pulls/<pr>/reviews' \
  -d '{"event":"COMMENT","comments":[{"path":"<path>","new_position":<line>,"body":"<reply>"}]}'
```

`tea pulls review-comments <pr> -o json` lists the threads with their `path` and line. State what
changed, or withdraw the finding, in one line.

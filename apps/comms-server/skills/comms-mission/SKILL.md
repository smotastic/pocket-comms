---
name: comms-mission
description: How an agent works on a Pocket Comms mission - post on the issue, open and merge the pull request as the mission bot, and report the outcome. Use when your first prompt says you are on a mission; it overrides the tea commands of flight-ship.
---

# Work on a mission

Pocket Comms sent you on a mission (spec 035 of pocket-comms): you carry out one issue on your own,
as the **mission bot**, a Gitea user of its own. Your worktree's git already commits and pushes as
the bot. Follow the flight rules and your lane as always; this skill only says how a mission talks
to Gitea and to Pocket Comms.

- **Never use `tea`.** It is logged in as the owner, and the mission settings refuse it. Talk to
  Gitea's API with the bot's token, as below.
- **Never deploy**, whatever the planet's `AGENTS.md` says. Deploying stays the owner's.
- **Never push to the default branch.** Push your branch and merge through the pull request.

## The bot's token and the repository

Run this in your worktree; every snippet below uses these variables.

```sh
push_url="$(git config --get remote.origin.pushurl)"   # http://host:port/owner/repo.git
gitea="${push_url%/*/*}"                               # http://host:port
repo="${push_url#"$gitea"/}"; repo="${repo%.git}"      # owner/repo
host="${gitea#*://}"; protocol="${gitea%%://*}"
token="$(printf 'protocol=%s\nhost=%s\n\n' "$protocol" "$host" | git credential fill | sed -n 's/^password=//p')"
api() { curl -sS -H "Authorization: token $token" -H 'content-type: application/json' "$@"; }
```

Never print the token, and never write it into a file, a commit or a comment.

## Post on the issue

Every question you ask the owner with your question tool, and in a full flight the confirmed
grilling summary, also goes on the issue as a comment, as a record. The owner answers in Pocket
Comms, not on Gitea.

```sh
api -X POST "$gitea/api/v1/repos/$repo/issues/<number>/comments" \
  -d "$(jq -n --arg body '<the text>' '{body: $body}')"
```

## Open the pull request

Name the branch, commits and title as `flight-ship` says. Push the branch with `git push -u origin
<branch>`, then open the pull request with `Closes #<number>` in its body:

```sh
api -X POST "$gitea/api/v1/repos/$repo/pulls" \
  -d "$(jq -n --arg title '<title>' --arg head '<branch>' --arg base '<default branch>' --arg body '<body>' \
    '{title: $title, head: $head, base: $base, body: $body}')"
```

Then attach it to your conversation with the `comms-attach-pull-request` skill: that is how Pocket
Comms follows your mission.

## Merge when CI is green

Wait for the pull request's CI to finish. Read the newest run of your branch's head and merge only
when it says `success`:

```sh
sha="$(git rev-parse HEAD)"
api "$gitea/api/v1/repos/$repo/commits/$sha/status" | jq -r .state   # success, pending, failure
api -X POST "$gitea/api/v1/repos/$repo/pulls/<pull number>/merge" \
  -d "$(jq -n --arg title '<title> (#<pull number>)' \
    '{Do: "squash", merge_title_field: $title, delete_branch_after_merge: true}')"
```

A red gate gets three attempts to fix it (flight rules, section 3); then stop and ask the owner.
Branch protection that refuses the bot is a stop too: ask the owner.

## Report the outcome

At the end, report one paragraph for the owner's mission log: `done` after the merge, or `failed`
when you cannot go on (say why). A failed outcome ends the mission; the owner finds the worktree and
branch kept.

```sh
pane="${HERDR_PANE_ID:-${HC_TERMINAL_ID:-}}"
base="${COMMS_URL:-https://$(tailscale status --json | jq -r '.Self.DNSName | rtrimstr(".")')}"
agent="$(jq -rn --arg pane "$pane" '$pane | @uri')"
curl -sS -w '\n%{http_code}\n' -X POST "$base/api/v1/agents/$agent/mission/outcome" \
  -H 'content-type: application/json' \
  -d "$(jq -n --arg result done --arg outcome '<one paragraph>' '{result: $result, outcome: $outcome}')"
```

`204` means it arrived. On any other status, say so in your last message and stop; do not retry.

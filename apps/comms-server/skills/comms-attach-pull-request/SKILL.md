---
name: comms-attach-pull-request
description: Attach a Gitea pull request to this agent's pocket-comms conversation, so the owner can read its changes on their phone. Use right after creating a pull request, or when the owner asks to attach an existing one. Needs to run inside Herdr.
---

# Attach a pull request to this agent's pocket-comms conversation

pocket-comms shows the owner the pull requests an agent attached, next to the agent's
conversation, with their changed files and diff. Attach each pull request you create, and any
existing one the owner asks you to attach. Attaching the same one again changes nothing, so it is
safe to repeat.

Only pull requests on the app's Gitea can be attached (spec 031 of pocket-comms).

## Attach

Run this once per pull request, with its Gitea page as `PR_URL`:

```sh
PR_URL='http://localhost:3000/<owner>/<repo>/pulls/<number>'
if [ -z "${HERDR_PANE_ID:-}" ]; then echo 'Not inside Herdr: nothing to attach to.'; else
  base="${COMMS_URL:-https://$(tailscale status --json | jq -r '.Self.DNSName | rtrimstr(".")')}"
  agent="$(jq -rn --arg pane "$HERDR_PANE_ID" '$pane | @uri')"
  # The answer stays in this shell, so agents attaching at once never read each other's.
  answer="$(curl -sS -w '\n%{http_code}' -X POST \
    "$base/api/v1/agents/$agent/pull-requests" \
    -H 'content-type: application/json' \
    -d "$(jq -n --arg url "$PR_URL" '{url: $url}')")"
  echo "${answer##*$'\n'}"
  echo "${answer%$'\n'*}"
fi
```

Instead of a page you may send the repository and number:
`-d '{"repository":"<owner>/<repo>","number":<number>}'`.

## Read the answer

The first line is the HTTP status, then the body.

- `200`: attached. The body is the pull request with its `title` and `state`. Tell the owner in
  one line, such as "Attached owner/repo #12 to this conversation in pocket-comms."
- `422`: the address is not a pull request on the app's Gitea. Its `errors[0].message` says why.
- `404`: Gitea has no such pull request, or the app cannot read it; or the agent is unknown.
- `409`: this agent has no conversation, already has 20 pull requests attached, or the server has
  no Gitea token set up.
- `403`: the request did not come through the owner's tailnet login.
- `503`: Gitea or the server's state cannot be reached now.

On any status but `200`, do not retry and do not work around it: tell the owner the status and the
body's `detail` (or `errors[0].message`), and carry on with your task.

## Notes

- `COMMS_URL` overrides the server's address, such as `https://host.tailnet.ts.net`. Without it
  the address is this machine's tailnet name.
- The request carries no token: the owner's Tailscale login is the only access check, and the
  server reads Gitea with its own token.

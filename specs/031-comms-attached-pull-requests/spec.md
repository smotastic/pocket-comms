# Spec 031 — pocket-comms: pull requests attached to an agent, with their changes

- **Status:** `Draft` — not yet approved (human gate pending)
- **Issue:** smotastic/pocket-comms#98
- **Depends on:** a code diff component in the design kit (pocket-factory spec, drafted with this
  one), released and taken here as a catalog bump

## 1. Problem / intent (WHY)

When an agent commits its work and opens a pull request, the owner reviews the changes on Gitea,
away from the conversation in which they steer the agent. On a phone, switching between the two
loses the thread: the owner reads the diff in one place and answers the agent in another.

pocket-comms should let an agent attach the pull requests it works on to its conversation, and
let the owner read each one's changed files and diff in a sheet over the conversation, so review
and steering stay in one place.

## 2. Scope

- **In scope:** an agent skill that attaches a pull request to the calling agent; a list of
  attached pull requests per agent, kept by the server; the owner removing one; a strip of them in
  the conversation; a sheet with a pull request's changed files and diff, read from Gitea, with
  refresh and a link to Gitea; the API for all of it.
- **Out of scope:** creating, approving, merging, commenting on or reviewing pull requests;
  forges other than the app's Gitea (GitHub, GitLab); the agent's local working-tree diff;
  syntax highlighting; split (side-by-side) diffs; attaching a pull request from the web app.

## 3. Requirements (WHAT)

### Attaching

1. The server offers `POST /agents/:agent/pull-requests`, which attaches a pull request to the
   agent, given its Gitea URL (`<gitea>/<owner>/<repo>/pulls/<number>`) or its repository
   (`owner/repo`) and number. It is guarded by the Tailscale identity check like every route.
2. A URL whose host is not the app's Gitea (its URL or one of `COMMS_GITEA_HOSTS`) answers `422`
   "Only pull requests on this app's Gitea can be attached." A URL or repository that does not name
   a pull request answers `422` with the reason. A pull request that Gitea does not have, or that
   the app's token cannot read, answers `404`. Nothing is stored on any of these.
3. The server reads the pull request from Gitea before it stores it, and answers the attached pull
   request as requirement 9 shows it. Attaching a pull request the agent already has changes nothing and
   answers the same.
4. The list belongs to the agent's conversation: the server keys it on the agent's session id.
   An agent without a session id answers `409` "This agent has no conversation to attach to."
   An agent the server does not know answers `404`.
5. An agent's list holds at most 20 pull requests, in the order they were attached. A 21st answers
   `409` and nothing is stored.
6. The lists outlive a restart of the server. A broken lists file is reported and never replaced
   by a read; only the next attach or removal writes over it.

### The agent skill

7. The repository ships a skill, `comms-attach-pull-request`, for Claude and Pi agents. It tells
   the agent to attach a pull request after creating one, or when the owner asks it to attach an
   existing one, by calling the route of requirement 1 with `curl`, for the agent named by
   `HERDR_PANE_ID`, on the server at `COMMS_URL`, or at the machine's tailnet name (`tailscale status`)
   when `COMMS_URL` is not set. It tells the agent how to read the answer and to report a refusal's
   reason to the owner, not to retry it.
8. The skill is set up once per machine, by hand, as the Claude hook is (the service's `AGENTS.md`
   says how), in `~/.claude/skills` and `~/.pi/agent/skills`.

### Showing them

9. `GET /agents/:agent/pull-requests` answers the agent's attached pull requests, each with its
   repository, number, Gitea URL and, read from Gitea at that moment, its title and its state:
   **open**, **merged** or **closed**. A pull request Gitea cannot read now keeps its repository,
   number and URL and says why it is unavailable; the others still show.
10. The Conversation view of an agent with attached pull requests shows them as a strip under its
    header, one item each: `owner/repo #number`, the title, and the state as a tag. Without any,
    there is no strip. The strip reads the list again when the conversation opens, every 30
    seconds while it is open, and when the app comes back to the foreground.
11. Each item has a **Remove** action (behind its menu), which asks for confirmation and then
    calls `DELETE /agents/:agent/pull-requests/:owner/:repo/:number`; the pull request leaves the
    strip. Removing one that is not attached answers `204` too. Removing never changes Gitea.

### The changes sheet

12. Tapping an item opens a sheet: from the bottom on a phone, from the side (`end`) on a wide
    screen. The conversation stays where it was under the sheet, and closing the sheet returns to
    the same place, with its scroll position.
13. The sheet's header shows `owner/repo #number`, the title and the state, a **Refresh** action
    and an **Open in Gitea** link to the pull request's page.
14. The sheet reads `GET /agents/:agent/pull-requests/:owner/:repo/:number/changes`, which only
    answers for an attached pull request (`404` otherwise). It answers the changed files in
    Gitea's order, each with its path, its previous path when renamed, its kind (**added**,
    **deleted**, **modified**, **renamed**), its counts of added and removed lines and its diff
    hunks, read from the pull request's diff on Gitea, never from the agent's worktree.
15. A binary file shows in the list with "Binary file, not shown" and no hunks.
16. A file with more than 1,500 added and removed lines shows in the list with "Too large to show
    here" and a link to the pull request's files on Gitea, and no hunks.
17. When the whole diff is larger than 2 MB, the server stops reading it and answers the changed
    files from Gitea's file list instead, with their counts and no hunks, and the sheet says "This
    pull request is too large to show here" above the list, with the Gitea link.
18. **Refresh** reads the changes and the pull request's title and state again, so the sheet shows
    new pushes; the sheet keeps the files it showed until the new ones arrive.
19. A failed read shows its reason in the sheet with a **Try again** action: Gitea not set up,
    Gitea unreachable, or the pull request no longer readable.
20. No Gitea token, header or credential reaches the browser or the agent skill's answer; the
    server reads Gitea with its own token, and the browser only gets the server's answers.

## 4. Acceptance criteria

- Given a Claude agent with the skill, when it runs the skill with
  `http://localhost:3000/smotastic/pocket-comms/pulls/99`, then the route answers the pull request
  with its title and state, and the agent's conversation shows `smotastic/pocket-comms #99` in the
  strip.
- Given the agent attaches a second pull request, then both show, the first one first; given it
  attaches the first again, then the strip still shows two.
- Given a GitHub URL, then the route answers `422` with "Only pull requests on this app's Gitea can
  be attached." and the strip is unchanged.
- Given a pull request number Gitea does not have, then the route answers `404`.
- Given an agent without a session id, then the route answers `409`.
- Given the owner taps an item, then a sheet opens over the conversation (from the bottom at
  390 px, from the side at 1280 px) with the changed files and their hunks; closing it shows the
  conversation at the same scroll position.
- Given the agent pushes another commit, when the owner taps **Refresh**, then the new changes show.
- Given a pull request with a PNG and a 3,000-line generated file, then the PNG shows "Binary
  file, not shown" and the generated file "Too large to show here" with the Gitea link; the other
  files show their hunks.
- Given a diff over 2 MB, then the sheet shows the file list with counts and "This pull request is
  too large to show here".
- Given the owner removes a pull request and confirms, then it leaves the strip, also after a
  reload and a server restart, and Gitea is unchanged.
- Given a merged pull request, then its tag says **merged**.
- Given a server restart, then every agent's attached pull requests are still there.
- Given a phone at 390 px width, then the strip and the sheet fit without sideways page scrolling
  (a diff line may scroll inside its own container), and axe finds no violations.

## 5. Notes

- **Owner's decisions of 2026-11-23:** an agent attaches through an ordinary, guarded API route,
  called from a skill with `curl` (the home server is a user-owned tailnet node, so a request to
  its own tailnet URL carries the owner's login); Claude and Pi agents, named by `HERDR_PANE_ID`;
  the owner can remove an attached pull request; the attached pull requests show as a strip at the
  top of the conversation; a per-file limit of about 1,500 lines and a whole-diff limit of 2 MB;
  the diff is drawn by a new design kit component, made first in pocket-factory.
- The skill is the "agent-callable tool" of the issue: a skill needs no extra process and works
  for both Claude and Pi.
- Title and state are read live, so they are never stale; only the repository, the number and the
  time of attaching are stored.
- Gitea's word is **pull request**; the issue's "PR/MR" means the same.
- New endpoints and response shapes add OpenAPI diff lines, accepted in `.pocket-ci`.

## 6. Open questions

None.

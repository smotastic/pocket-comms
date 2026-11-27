# Spec 035 — pocket-comms: missions to merge

- **Status:** `Done` — grilling of 2026-11-27, verified; built in #121, #122 and #123
- **Grilling:** confirmed by the owner on 2026-11-27
- **Changes:** [spec 034](../034-comms-planets-and-preflight/spec.md) (a sixth preflight check;
  the **missions** level can be chosen), [spec 006](../006-comms-gitea-issues/spec.md) (an
  issue offers **Send on a mission** beside Implement), [spec 013](../013-comms-brainstorm-chat/spec.md)
  (a proposal carries a lane)
- **Decision:** [ADR 0019](../../docs/architecture/adr/0019-missions-run-as-a-bot-in-the-planets-worktrees-queued-by-comms.md)

## 1. Problem / intent (WHY)

The owner wants work to flow from an idea to merged code without them, apart from the grilling
(ADR 0016, [the vision](../../docs/mission-control.md)). Step 2 made the planets and told which
are ready. Today every agent still needs the owner to start it, steer it and merge its work, so
nothing happens overnight.

This feature lets the owner send an issue on a **mission**: an agent carries it out alone, along
its lane, as the bot user `mission-control`, until its pull request is merged. Missions wait their
turn in the **mission queue**, one at a time. The owner answers a mission's questions in the
cockpit, as today, and reads in the morning in the **mission log** what was done overnight.
Deploying stays the owner's until step 4.

## 2. Scope

- **In scope:** sending an issue on a mission from the issue and from the brainstorm's proposals;
  the mission queue and each mission's state; starting a mission's agent as the bot with the
  mission settings; following it to merged and cleaning up; abort, failure, held and lost; the
  mission log with what is new; choosing the **missions** autonomy level; the sixth preflight
  check; the Mission Control screen.
- **Out of scope:** autopilot; missions side by side and a dev-port check; deploying, deploy
  recipes and their checks (step 4); forwarding Gitea comments to an agent; Pi on missions;
  priority or reordering the mission queue; resuming a lost mission on its own; creating the bot user or
  its token (the owner's setup).

## 3. Requirements (WHAT)

### The bot

1. Missions act as one Gitea user, the **mission bot**, whose token the server reads from the
   setting `COMMS_MISSION_GITEA_TOKEN`. Without the setting, every send is refused with the
   reason that missions have no bot token; nothing else changes.
2. Every commit, push, comment, label change, pull request and merge of a mission is the bot's;
   none uses the owner's identity or token.

### Preflight and autonomy

3. Preflight (spec 034) gains a sixth check, **mission bot**, after the other five: the bot token
   is set, and the bot may push to the planet's repository on Gitea and write its issues (its token
   has `write:issue`, issue #128). Without a token it fails with that reason; when Gitea cannot be
   read it fails as the others do.
4. The owner may choose **missions** as a planet's autonomy level; **autopilot** stays coming and
   cannot be chosen. The effective level stays as spec 034 says: the chosen level, lowered to
   **manual** on no-go.

### Sending

5. An open issue of a planet offers **Send on a mission** beside Implement, with a lane picker:
   **hop** or **full flight**. When the issue has the label `mission:hop` or
   `mission:full-flight`, that lane is preselected; otherwise none is, and the owner must pick.
6. Sending computes the planet's preflight again, without reusing it, and is refused, with the
   reason, when the effective level is below **missions**. It is also refused when the issue is
   closed, is a pull request, or already has a mission that is not finished.
7. A sent mission sets the issue's lane label (creating the label on the planet when it has none,
   and removing the other lane's label) and joins the end of the mission queue as **queued**.
8. The brainstorm's issue and edit proposals each carry a lane Pi suggests, **none**, **hop** or
   **full flight**, with a one-line reason the owner sees. The owner may change it before deciding.
   Accepting with **none** creates or updates the issue only, as today. Accepting with a lane
   creates or updates the issue, and then sends it on a mission in that lane as requirement 6 and
   7 say; a refused send leaves the issue created or updated and says why.

### The mission queue

9. The mission queue and every mission's state are kept in one file in the server's state folder.
   Gitea holds only records: the lane label, the in-progress label and comments.
10. At most one mission is **running** at a time, across all planets: in the state **working**,
    **waiting on you**, **pull request** or **lost**. The mission queue runs first in, first out.
11. The owner may remove a queued mission; it leaves the mission queue without a trace in the log.
12. When nothing is running and no mission is lost, the oldest queued mission starts. It first
    computes preflight again, without reusing it. When the effective level is below **missions**
    then, the mission is **held** with the reason and the next one gets its turn.

### Running a mission

13. Starting a mission gives it a worktree on a new branch from the default branch, or the
    worktree an earlier mission of the same issue kept (requirement 19). In that worktree, git
    commits and pushes as the bot; the owner's own checkout and worktrees are not changed.
14. The mission's agent is Claude, started in the worktree like a task's agent (spec 005), with
    the mission settings that Pocket Comms ships: auto mode, and a deny list that refuses at
    least force-pushes, pushes to `main` or `master`, pushing tags, the `colima-pocket-cloud`
    Docker context, `colima stop`, `colima delete`, `docker compose down` and `tea` with the
    owner's login.
15. Its first prompt names the flight rules, the lane and the issue with its text, and says it is
    on a mission: post every question it asks the owner, and in a full flight the confirmed
    grilling summary, on the issue as a record; attach its pull request to its conversation;
    merge when CI is green; never deploy; and report its outcome at the end. A mission sent again
    into a kept worktree is told to continue from its branch.
16. Starting marks the issue in progress and comments on it that the mission started, with its
    lane. The overview tags the mission's agent as a mission.
17. A running mission's state follows facts: **waiting on you** while its agent waits for the
    owner, **working** otherwise; **pull request** once its agent attached a pull request of the
    planet; **merged** once that pull request is merged.
18. The owner answers a mission's agent in the cockpit, as any agent; the server never forwards
    Gitea comments to it.

### Ending

19. When the pull request is merged, the mission is **merged**: its agent is closed, its worktree
    removed (kept when it has changes) and the next mission starts. Until step 4 it shows as
    **merged, not deployed**.
20. The agent reports its outcome, one paragraph, before it ends; an outcome that says the mission
    failed makes it **failed**. A pull request closed without merging also fails the mission.
21. The owner may **abort** a running mission. Abort and failure both stop the agent, keep the
    branch and the worktree, remove the in-progress label, comment on the issue why, and free the
    mission queue. Sending the issue again continues in the kept worktree.
22. When the server starts, or at any time, a running mission whose agent is gone is **lost**, and
    the mission queue waits. The owner may **resume** it, which starts Claude again with its conversation
    in the same worktree, or abort it. Nothing resumes on its own. A lost mission without a known
    conversation can only be aborted.
23. A usage limit needs nothing: the running mission's agent waits for the reset itself, and the
    mission queue waits with it.

### The mission log and the cockpit

24. The **mission log** lists every finished mission, **merged**, **failed**, **aborted** or
    **held**, newest first: its planet, issue number and title, lane, pull request link when it has
    one, how long it ran, its outcome or reason, and when it finished. Finished missions are kept
    for 90 days.
25. Missions that finished since the owner last opened the log are marked new; the start screen
    shows their count. Opening the log marks them seen.
26. The **Mission Control** screen, reached from the start screen, shows the running mission with
    its state, planet, issue and agent, with **Abort** and, when lost, **Resume**; the mission queue with
    **Remove**; and the mission log.

## 4. Acceptance criteria

- Given no `COMMS_MISSION_GITEA_TOKEN`, when the owner sends an issue on a mission, then it is
  refused because missions have no bot token, and the **mission bot** check fails with that reason.
- Given a go planet at **missions** and an open issue labelled `mission:hop`, when the owner opens
  Send on a mission, then **hop** is preselected; sending sets the label and queues the mission.
- Given a planet at **manual**, or a no-go planet at **missions**, then sending is refused with the
  reason, and nothing is queued.
- Given an issue with a queued or running mission, then a second send of it is refused.
- Given two queued missions on different planets, then only the older one runs; the second starts
  only after the first is merged, failed, aborted or held.
- Given the mission queue's next mission whose planet went no-go after the send, when its turn comes, then
  it is **held** with the reason, is in the log, and the mission after it starts.
- Given a started mission, then its worktree commits and pushes as the bot, the owner's checkout
  of the planet keeps its git identity, Claude runs with the mission settings, the issue is in
  progress and has the bot's start comment.
- Given a running mission whose agent waits on a question, then its state is **waiting on you**,
  and the owner's answer in the conversation reaches the agent.
- Given a running mission whose agent attached a pull request that is then merged, then the
  mission is **merged, not deployed**, its agent is closed, its clean worktree removed, it is
  first in the log with its outcome and pull request, and the next queued mission starts.
- Given the owner aborts a running mission, then its agent stops, its worktree and branch stay,
  the in-progress label is gone, the issue says it was aborted, and a new send continues in that
  worktree with a prompt to continue from its branch.
- Given the server restarts while a mission is working and its agent is gone, then the mission is
  **lost**, nothing new starts, and **Resume** starts Claude with its conversation again.
- Given three missions finished overnight, when the owner opens the start screen in the morning,
  then it shows three new; opening the log shows them first, marked new, and afterwards none is new.
- Given a brainstorm proposal with the suggested lane **hop**, when the owner accepts it with
  **full flight**, then the issue is created with `mission:full-flight` and queued in that lane;
  accepting with **none** only creates the issue.
- Given a finished mission older than 90 days, then it is no longer in the log.

## 5. Notes

- The mission's state names, as the API and file use them: `queued`, `working`, `waiting`,
  `pull-request`, `lost`, and the finished `merged`, `failed`, `aborted`, `held`.
- The agent reports its outcome and posts on Gitea through a comms skill that ships with the flight
  skills; it reads the bot token through git in its worktree, never from the owner's tools.
- The sixth check widens the enum of a preflight check in the response of
  `GET /planets/{planet}/preflight`; the owner's rule of spec 022 accepts it with one line in
  `.pocket-ci/openapi-accepted-changes.txt`.
- Step 4 adds **deployed** after **merged** and turns "merged, not deployed" into deployed on its own.

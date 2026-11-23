# Pocket Comms

The words of Pocket Comms: the owner watching and steering their coding agents from a phone,
turning ideas into issues in a brainstorm, and capturing ideas by voice. Words about how pocket
apps are built and run, including **coding agent**, come from pocket-factory and pocket-cloud.

## Language

### Agents

**Owner**:
The one person whose coding agents these are and who uses the app.
_Avoid_: user, operator

**Agent**:
In Pocket Comms, always a coding agent running in a workspace, known by its name or its pane.
_Avoid_: session, process, pane (for the agent)

**Agent status**:
What an agent is doing: **working**, **blocked**, **done**, **idle** or **unknown**.
_Avoid_: state

**Needs you**:
The agents waiting on the owner: blocked, or done with a result the owner has not yet seen and no
background work still running.
_Avoid_: attention, unseen, inbox

**Seen**:
Said of an agent's latest result once the owner has looked at it.
_Avoid_: read, acknowledged

**Conversation**:
What an agent and the owner have said to each other, read from the agent's own record of its
work and shown as a chat.
_Avoid_: transcript, chat, session, log

**Screen**:
An agent's terminal, shown as it is.
_Avoid_: terminal view, pane, console

**Prompt**:
A message the owner sends to an agent, which submits it.
_Avoid_: message (unqualified), input, command

**Agent question**:
Something an agent asks the owner and waits on, answered with a choice or typed text.
_Avoid_: dialog (that is the coding agent's own on-screen prompt), permission request, question
(unqualified)

**Quick reply**:
A reply the owner saved to send with one tap.
_Avoid_: canned reply, template

**Suggested reply**:
A reply the app offers from fixed rules, given what the agent is waiting on.
_Avoid_: smart reply, AI reply

**Background work**:
A shell, monitor or subagent an agent keeps running while it is otherwise done.
_Avoid_: job, task, process

**Subagent**:
An agent another agent delegated work to, with its own conversation.
_Avoid_: child agent, worker

**Activity**:
The timeline of what happened across all agents over the last day.
_Avoid_: feed, log, activity (for an agent's current step)

**Current step**:
What a working agent is doing right now, such as thinking or running a tool.
_Avoid_: activity, status

### Projects and issues

**Project**:
One git repository the owner works on.
_Avoid_: repository (in prose), repo, workspace group

**Workspace**:
One place where agents run, usually on a worktree of a project; workspaces without a project fall
under **Other**.
_Avoid_: tab, session, project

**New task**:
Starting work in a project: the task text, a branch for a new worktree, and optionally an agent.
_Avoid_: job, ticket, task (unqualified)

**Issue**:
A tracked piece of work in a project's issue tracker.
_Avoid_: ticket, task, bug

**Issue work**:
The worktrees and agents working on one issue's branch.
_Avoid_: issue branch, progress

**Pull request**:
A proposed change to a project on the app's Gitea, with its changed files.
_Avoid_: PR, MR, merge request (in prose)

**Attached pull request**:
A pull request an agent added to its conversation, so the owner can read its changes there.
_Avoid_: linked PR, session PR

### Brainstorm

**Brainstorm**:
The owner talking with Pocket Comms' embedded agent to shape ideas into issues.
_Avoid_: chat, brainstorm chat, conversation (that is an agent's)

**Proposal**:
A change the brainstorm suggests and the owner accepts or discards: a new issue (**issue
proposal**) or a change to an existing one (**edit proposal**).
_Avoid_: draft, suggestion

### Voice and images

**Voice message**:
Recorded speech the owner sends, turned into text before it is used.
_Avoid_: clip, recording, audio, voice note

**Transcription**:
The text made from a voice message.
_Avoid_: transcript (that is not a term here), STT result

**Image**:
A picture the owner attaches to a prompt or the brainstorm.
_Avoid_: picture, photo, attachment, screenshot

**Pocket buddy**:
The small voice client that captures ideas and sends them to the brainstorm.
_Avoid_: buddy app, recorder, device

**Outbox**:
Voice messages the pocket buddy recorded but has not yet delivered.
_Avoid_: queue, pending, drafts

### Reaching the owner

**Notification**:
A push message to the owner's devices when agents need them.
_Avoid_: alert, push (as a noun), message (unqualified)

**Device**:
A phone or browser of the owner's that receives notifications.
_Avoid_: client, subscriber, device (for the pocket buddy)

# Spec 011 — pocket-comms: close an agent and its worktree

- **Status:** `Approved` — approved by the owner (2026-11-02)
- **Changes:** [spec 004](../004-pocket-comms-v1/spec.md) (the conversation's top bar) and
  [spec 005](../005-comms-new-task/spec.md) (the worktrees the app starts)

## 1. Problem / intent (WHY)

The app starts agents in new Herdr worktrees (specs 005 and 006). When such an agent is done, its
worktree and workspace stay open until the owner removes them on the desktop. From the phone the
owner can read and answer the agent but cannot clean up after it, so finished worktrees pile up.

This feature lets the owner close an agent in a worktree from its conversation: Herdr removes the
worktree's checkout and closes its workspace, with every agent in it. The branch stays.

## 2. Scope

- **In scope:** a close action in the conversation of an agent whose workspace is a linked git
  worktree, a confirmation, a second confirmation when the worktree has uncommitted changes, and
  the API endpoint behind it.
- **Out of scope:** deleting the branch, closing an agent in a main checkout or in a workspace
  without a repository, closing a single pane while leaving the worktree, closing from the overview
  or the project page, and any record of closed agents.

## 3. Requirements (WHAT)

1. The conversation's top bar shows a **Close** action only for an agent whose Herdr workspace is a
   linked worktree. An agent in a main checkout or in the Other group has none.
2. The action is offered at every status: working, blocked, done, idle and unknown.
3. Close never acts at once. It opens a confirmation that names the worktree, says that its
   checkout is removed and its branch is kept, and names every other agent in the same worktree,
   because they close too.
4. On confirmation the server removes the worktree through Herdr's `worktree.remove` without
   `force`. Herdr removes the checkout folder and closes the workspace with all its panes. The git
   branch is not deleted.
5. Before it removes a worktree without `force`, the server asks git whether the checkout has
   uncommitted or untracked changes. When it has, nothing is removed and the API answers with a
   `worktree-has-changes` problem.
6. On that problem the confirmation says that the worktree has changes that would be lost and
   offers a second, explicit action, **Discard changes and close**. Only that action removes the
   worktree with `force`.
7. The server removes only a workspace that Herdr reports as a linked worktree, whose checkout git
   lists as a worktree, not the primary checkout, of a project below the projects root. The
   request names only the agent and whether to force. It never carries a path or a workspace id.
   For any other agent the API answers with a `not-a-worktree` problem.
8. After a successful close the app goes where the back action goes: the overview or the project
   page. The closed agents disappear from every list with the next Herdr update, as when the owner
   closes them on the desktop.
9. When Herdr refuses the removal or cannot be reached, the confirmation stays open and shows the
   reason. Nothing is retried on its own.
10. The app never moves the owner's Herdr focus (spec 004, requirement 18) and never sends
    `trust_repository` (spec 005).

## 4. Acceptance criteria

- Given an agent in the linked worktree `feat-login` of `shop`, when the owner opens its
  conversation, then the top bar has a Close action. Given an agent in the main checkout of `shop`,
  then it has none.
- Given a clean worktree with one agent, when the owner taps Close and confirms, then Herdr gets
  `worktree.remove` for that workspace with `force: false`, and the app returns to where it came
  from.
- Given a worktree with two agents, `claude-a` and `pi-b`, when the owner taps Close on `claude-a`,
  then the confirmation names `pi-b` as closing too.
- Given a worktree with an uncommitted change, when the owner confirms, then Herdr gets no request,
  the confirmation says that the changes would be lost and offers Discard changes and close; when
  the owner takes it, then Herdr gets `worktree.remove` with `force: true`.
- Given a request to close an agent in a main checkout, then the API answers `not-a-worktree` and
  Herdr gets no request.
- Given Herdr refuses the removal, then the confirmation shows Herdr's reason and stays open.
- Given a phone at 390 px width, then the confirmation fits without sideways scrolling.

## 5. Notes

- Herdr's `worktree.remove` takes `workspace_id` and `force` and answers `worktree_removed`. Its
  error code for a dirty checkout is not documented, so the server asks git itself
  (`git status --porcelain`) instead of reading Herdr's error. Git's own refusal in a race shows as
  a Herdr refusal (requirement 9).
- The checkout path comes from Herdr's workspace list (`worktree.checkout_path`), never from the
  request.
- The other agents in the worktree are the overview's agents with the same project and worktree.
- The look comes from the design system (`packages/design`): a new `trash` icon, the `Sheet` and
  the `danger` button.

## 6. Open questions

None.

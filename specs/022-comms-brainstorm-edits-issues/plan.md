# Plan 022 — pocket-comms: the brainstorm chat edits existing issues

- **Spec:** [spec.md](./spec.md)
- **Status:** `Approved` — approved with the spec by the owner (2026-11-04)

## 1. Affected projects

| Path                            | Change                                                                                                                                        | Nx tags                               |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `packages/comms/domain`         | `brainstorm.ts`: the issue proposal and the edit proposal as one `ProposalEntry` union by `kind`; remembered reads; the base check.           | `scope:comms`, `layer:domain`         |
| `packages/comms/application`    | `GiteaOutbound.updateIssue`; `read_issue` and `propose_issue_edit`; the reads in `StoredChat`; `decide` applies an edit; `IssueChangedError`. | `scope:comms`, `layer:application`    |
| `packages/comms/infrastructure` | The Gitea adapter's `PATCH` of title and body; the chat file stores reads and a proposal's `kind`, and still loads a version 1 file.          | `scope:comms`, `layer:infrastructure` |
| `packages/comms/contract`       | The edit proposal entry, its state, and the `Apply` decision.                                                                                 | `scope:comms`, `type:contract`        |
| `packages/comms/api`            | The `issue-changed` problem; `decide` maps the new errors.                                                                                    | `scope:comms`, `layer:api`            |
| `packages/design/ui`            | `IssueEditCard`, with a story and a spec, from the `ProposalCard` and the `Disclosure`.                                                       | `scope:design`                        |
| `apps/comms-web`                | `Brainstorm.tsx` shows an edit proposal with `IssueEditCard`.                                                                                 | `scope:comms`, `type:app`             |
| `apps/comms-server`             | The regenerated OpenAPI document.                                                                                                             | `scope:comms`, `type:app`             |
| `packages/comms/AGENTS.md`      | The Gitea write rule and the Pi tools rule name the edit.                                                                                     | —                                     |

## 2. Contract changes

Compatible within `/api/v1` for readers of new-issue proposals; the web app is the only client
and changes with the contract.

- `BrainstormEntry`'s `proposal` variant splits by a new `kind` field:
  - `kind: 'issue'`: as today (`project`, `title`, `body`, `ProposalState`).
  - `kind: 'edit'`: `project`, `number`, `url` (the issue's page), `title`, `body`, `base`
    (`{ title, body }`), and `EditState`: `open`, `updated` (`url`) or `discarded`.
- `ProposalDecisionRequest` gains `{ _tag: 'Apply', title, body }`.
- The `decide` endpoint adds the `issue-changed` (409) and `issue-not-found` (404) problems.

## 3. Migrations

No database. The chat file (`brainstorm.json`) moves to version 2: it gains `reads` (project,
number, title, body) and each proposal's `kind`. Version 1 files load with no reads and every
proposal as `kind: 'issue'`; the next save writes version 2 (spec requirement 15).

## 4. Design

- **Domain (`brainstorm.ts`).** `ProposalEntry = IssueProposal | EditProposal`. `IssueRead`
  (`project`, `number`, `title`, `body`, `cut`) and `rememberRead(reads, read)`, which keeps the
  last read per project and number, and `readOf(reads, project, number)`. `parseIssueEdit` checks
  the title and body as `parseIssueDraft` does. `baseChanged(base, issue)` compares the title and
  body. `settleProposal` takes the decided fields and the state for either kind.
- **Gitea.** `GiteaOutbound.updateIssue(repository, number, { title, body })`: a `PATCH` of the
  issue with exactly `{"title","body"}`; a `404` is `IssueNotFoundError`. The adapter's `send`
  already allows `PATCH`.
- **Tools.** `read_issue(project, number)`: `issue` from Gitea; a pull request is refused; the body
  is cut at `MAX_ISSUE_BODY` and the output says so; the read is remembered in the chat through a
  callback, as `propose` is today. `propose_issue_edit(project, number, title, body)`: refused
  without an uncut remembered read; otherwise it adds an `EditProposal` with that read as `base`
  and pauses the turn. The instructions name both tools and requirement 7.
- **Use case.** `StoredChat` gains `reads`; New chat empties them. `decide` with `Apply` on an
  edit: parse, find the project and repository, read the issue, fail with `IssueChangedError`
  when `baseChanged`, then `updateIssue`, settle as `updated`, remember the new version as a read,
  and tell Pi. A mismatched decision is `InvalidInputError` on the field `_tag`. Everything still
  runs under the chat's one lock and only while Pi is idle.
- **Web.** `IssueEditCard` in the design system: a tag with the project, a link "Issue #N",
  editable title and body, a `Disclosure` "Current version" with the base, Apply edit and Discard;
  decided, it shows "Issue #N updated" or "Discarded". `Brainstorm.tsx` picks the card by `kind`.

## 5. Test strategy

- **Unit (domain):** `rememberRead` keeps the last read per issue; `baseChanged` ignores
  everything but title and body; `parseIssueEdit` refuses a blank title and long fields.
- **Unit (application, fakes):** `read_issue` returns an issue, refuses a pull request, a missing
  issue and a project off Gitea, and cuts a long body; `propose_issue_edit` refuses an unread or
  cut issue and otherwise adds an open edit card; `decide` applies an edit with one update, refuses
  a changed base without an update, applies after a comment-only change (updated time changed),
  discards without a Gitea request, refuses a second decision and mismatched decisions, keeps the
  card open on a Gitea failure, and tells Pi each outcome; New chat forgets the reads.
- **Adapter (fake server):** `updateIssue` sends one `PATCH` with exactly `{"title","body"}` and
  the token, and maps `404` to `IssueNotFoundError`. The file store round-trips reads and both
  kinds, and loads a version 1 file.
- **API:** `decide` answers `issue-changed` and `issue-not-found` as problems; the contract spec
  covers the new entry and decision.
- **Web (Testing Library):** the edit card shows the base under Current version, applies the
  edited title and body, shows the outcome, and shows an `issue-changed` reason with the card
  still open. The design system spec covers `IssueEditCard`, and a story shows it at 390 px.
- **Boundaries:** no new imports across layers; `pnpm verify:local` with dependency-cruiser, and
  the OpenAPI document regenerated with `pnpm nx run comms-server:openapi`.

## 6. Risks

- **The race between check and write** (spec note): a change in that moment is overwritten.
  Gitea offers no conditional update; the window is one request long.
- **Pi drops part of a body.** The owner sees the current version on the card before applying,
  and the instructions tell Pi to keep the rest of the body.
- **A larger chat file:** each read keeps up to 20,000 characters, once per issue.

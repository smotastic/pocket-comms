# Plan 021 — pocket-comms: additional information when implementing an issue

- **Spec:** [spec.md](./spec.md)
- **Status:** `Approved` — approved with the spec by the owner (2026-11-04)

## 1. Affected projects

| Path                         | Change                                                                                    | Nx tags                            |
| ---------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------- |
| `packages/comms/domain`      | `parseAdditionalInformation` and the 4 000 limit; `issueTask` takes the optional text.    | `scope:comms`, `layer:domain`      |
| `packages/comms/application` | `ImplementIssueInput.additionalInformation`; the use case parses it before reading Gitea. | `scope:comms`, `layer:application` |
| `packages/comms/contract`    | `ImplementIssueRequest.additionalInformation`, optional.                                  | `scope:comms`                      |
| `packages/comms/api`         | The `implement` handler passes the field through.                                         | `scope:comms`                      |
| `apps/comms-web`             | A `TextArea` in the Implement sheet; `implementIssue` sends the text.                     | `scope:comms`                      |

## 2. Contract changes

`POST /projects/:project/issues/:number/implement` takes an optional
`additionalInformation: string` of at most 4 000 characters in its payload. Old clients send none
and behave as before. As for the task text of spec 005, the contract states the limit and the
domain enforces it; both answer a field-level `422`.

## 3. Migrations

None. Nothing is stored (requirement 6).

## 4. Design

- **Domain.** `parseAdditionalInformation(text?)` trims, turns `\r\n` into `\n`, gives
  `undefined` for blank text and fails with `InvalidInputError` on `additionalInformation` above
  `MAX_ADDITIONAL_INFORMATION` (4 000). `issueTask(issue, additional?)` adds the
  `## Additional information` paragraph before the footer and subtracts its length from the room
  the body has, so only the body is ever cut (requirement 5).
- **Application.** `implement` parses the text first, so an invalid one fails before Gitea is read
  or anything is created, then passes it to `issueTask`.
- **Web.** `ImplementForm` keeps the text in its own state next to the branch; the form is
  already keyed by the issue number and unmounted on close, so the text never reaches another
  issue (requirement 7). The `TextArea` of `@pocket-comms/design-ui`; as in the New task sheet, the server checks the limit.
  `implementIssue(project, number, branch, additionalInformation?)` sends the field only when it
  is not blank. A server issue on `additionalInformation` shows under the field.

## 5. Test strategy

- **Domain (`issue.spec.ts`):** the paragraph's place and heading; line breaks kept; blank text
  gives the spec 006 task; a long body is cut while the additional text stays whole and the task
  fits; the parser's trim, `\r\n` and 4 000 limit.
- **Application (`issues.use-case.spec.ts`):** the prompt sent to the agent holds the text; text
  over the limit fails on `additionalInformation` and creates no worktree.
- **API (`comms-api.spec.ts`):** the field reaches the use case.
- **Web (`issues.spec.tsx`, `comms-client.spec.ts`):** typing text and starting sends it; an empty
  field sends none; opening another issue shows an empty field.

## 6. Risks

- None beyond a longer prompt; the 20 000 limit of spec 005 still holds.

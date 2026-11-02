import type { IssueTaskCreatedView, IssueView, TaskCreatedView } from './comms-client.js';

// How the issue lists show the issues in progress apart (spec 015). The server decides which
// issues are in progress; this only splits the list and words the start.

/** The label the server puts on an issue it starts; the group says it, so no tag repeats it. */
const IN_PROGRESS_LABEL = 'status/in-progress';

/** The issues in progress and the open others, each in the server's order. */
export const groupIssues = (issues: ReadonlyArray<IssueView>) => ({
  inProgress: issues.filter((issue) => issue.inProgress),
  open: issues.filter((issue) => !issue.inProgress),
});

/** The labels a row shows: every one but the in-progress label. */
export const shownLabels = (issue: IssueView): ReadonlyArray<string> =>
  issue.labels.filter((label) => label.toLowerCase() !== IN_PROGRESS_LABEL);

/** A started issue as a start: why it was not marked joins the agent's note. */
export const withMarkNote = ({ markNote, ...created }: IssueTaskCreatedView): TaskCreatedView => {
  if (markNote === undefined || created.agent === undefined) return created;
  const note = created.agent.note === undefined ? markNote : `${created.agent.note} ${markNote}`;
  return { ...created, agent: { ...created.agent, note } };
};

import type { TaskCreatedView } from './comms-client.js';

/** What the app says after a start without a running agent. */
export const startedNotice = (created: TaskCreatedView) => {
  const ready = `${created.branch} is ready in a new worktree.`;
  return created.agent?.note === undefined ? ready : `${ready} ${created.agent.note}`;
};

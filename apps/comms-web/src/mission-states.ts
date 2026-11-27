import type { MissionView } from './comms-client.js';

/** What each state is called on the screen (spec 035). */
export const STATE_NAMES: Readonly<Record<MissionView['state'], string>> = {
  queued: 'Queued',
  working: 'Working',
  waiting: 'Waiting on you',
  'pull-request': 'Pull request',
  lost: 'Lost',
  // A merge from before deploys existed (spec 035).
  merged: 'Merged, not deployed',
  failed: 'Failed',
  aborted: 'Aborted',
  held: 'Held',
  // Spec 036.
  releasing: 'Releasing',
  deploying: 'Deploying',
  deployed: 'Deployed',
  'rolled-back': 'Rolled back',
  'not-deployed': 'Merged, not deployed',
  'nothing-to-release': 'Merged, nothing to release',
  'awaiting-deploy': 'Merged, waiting for you to deploy',
  // Spec 037.
  'deploy-lost': 'Deploy lost',
  down: 'Down',
};

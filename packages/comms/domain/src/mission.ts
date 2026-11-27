import type { GiteaRepository, Issue } from './issue.js';
import type { PlannedRelease } from './release.js';

// The rules of missions (spec 035, ADR 0019): the lanes and their labels, the mission record and
// its file, what may be sent, the mission queue's next mission, the state a running mission is
// in from facts, the mission log, and the first prompts. Nothing here reads the facts.

/** The path a mission takes. */
export type Lane = 'hop' | 'full-flight';

export const LANES: ReadonlyArray<Lane> = ['hop', 'full-flight'];

/** The label that names a lane on an issue. */
export const laneLabel = (lane: Lane): string => `mission:${lane}`;

/** The lane an issue's labels name; none when they name none, or both. */
export const laneOfLabels = (labels: ReadonlyArray<string>): Lane | undefined => {
  const named = LANES.filter((lane) => labels.includes(laneLabel(lane)));
  return named.length === 1 ? named[0] : undefined;
};

/** The colour Gitea gives a lane label the server creates. */
export const LANE_LABEL_STYLE = {
  color: '#5319e7',
  description: 'Mission Control: the lane a mission takes (spec 035).',
} as const;

/** The states of a mission that is not finished. */
export type OpenState =
  | 'queued'
  | 'working'
  | 'waiting'
  | 'pull-request'
  | 'lost'
  | 'releasing'
  | 'deploying';
/** The states of a finished mission. */
export type FinishedState =
  | 'merged'
  | 'failed'
  | 'aborted'
  | 'held'
  | 'deployed'
  | 'rolled-back'
  | 'not-deployed'
  | 'nothing-to-release'
  | 'awaiting-deploy';
export type MissionState = OpenState | FinishedState;

/** The states in which a mission is running: at most one mission is in one of them. */
export const RUNNING_STATES: ReadonlySet<MissionState> = new Set([
  'working',
  'waiting',
  'pull-request',
  'lost',
  'releasing',
  'deploying',
]);

const FINISHED_STATES: ReadonlySet<MissionState> = new Set([
  'merged',
  'failed',
  'aborted',
  'held',
  'deployed',
  'rolled-back',
  'not-deployed',
  'nothing-to-release',
  'awaiting-deploy',
]);

export const isRunning = (mission: Mission): boolean => RUNNING_STATES.has(mission.state);
export const isFinished = (mission: Mission): boolean => FINISHED_STATES.has(mission.state);

/** A pull request a mission's agent attached, on its planet's repository. */
export interface MissionPullRequest {
  readonly number: number;
  readonly url: string;
}

/** A mission's worktree, and the workspace the multiplexer opened for it. */
export interface MissionWorktree {
  readonly path: string;
  readonly branch: string;
  readonly workspaceId: string;
}

/** One mission as the missions file keeps it. Times are epoch milliseconds. */
/** Where a mission's release and deploy are (spec 036). */
export interface MissionDeploy {
  /** The releases it ships, in order. */
  readonly releases: ReadonlyArray<PlannedRelease>;
  /** The release worked on now, an index into `releases`. */
  readonly step: number;
  /** Pushing the tags, waiting for their release runs, or deploying the release at `step`. */
  readonly phase: 'tag' | 'build' | 'deploy';
  /** When the current phase began, to give up on a run or a result that never comes. */
  readonly since: number;
  /** Whether the owner's Deploy asked for the database backup first. */
  readonly backup: boolean;
  /** The id of the deploy script's run of the release at `step`, once it was started. */
  readonly job?: string | undefined;
  /** The commit the tags go on: the default branch's head when the release was planned. */
  readonly target: string;
}

export interface Mission {
  readonly id: string;
  readonly planet: string;
  readonly repository: GiteaRepository;
  readonly issue: { readonly number: number; readonly title: string; readonly url: string };
  readonly lane: Lane;
  readonly state: MissionState;
  readonly sentAt: number;
  readonly startedAt?: number | undefined;
  readonly finishedAt?: number | undefined;
  readonly worktree?: MissionWorktree | undefined;
  /** The name of its agent in the multiplexer. */
  readonly agent?: string | undefined;
  /** The id of its agent's conversation, once the agent has one. */
  readonly session?: string | undefined;
  readonly pullRequest?: MissionPullRequest | undefined;
  /** What the agent reported at the end, one paragraph. */
  readonly outcome?: string | undefined;
  /** Why it is held, failed, aborted or lost. */
  readonly reason?: string | undefined;
  /** Its release and deploy while it is releasing or deploying, or queued by the owner's Deploy. */
  readonly deploy?: MissionDeploy | undefined;
  /** The tags it released, once deployed or rolled back. */
  readonly versions?: ReadonlyArray<string> | undefined;
  /** The deploy script's output of a rolled-back deploy. */
  readonly output?: string | undefined;
  /** The "fix the failed deploy" issue a rolled-back deploy opened. */
  readonly fixIssue?: number | undefined;
  /** The mission whose owner's Deploy this waiting mission ships with. */
  readonly deployWith?: string | undefined;
}

/** The missions file: every mission, and when the owner last opened the mission log. */
export interface MissionsFile {
  readonly missions: ReadonlyArray<Mission>;
  readonly seenAt: number;
}

export const EMPTY_MISSIONS: MissionsFile = { missions: [], seenAt: 0 };

/** How long a finished mission stays in the mission log. */
export const MISSION_LOG_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The file without finished missions older than the log keeps. */
export const pruneMissions = (file: MissionsFile, now: number): MissionsFile => ({
  ...file,
  missions: file.missions.filter(
    (mission) =>
      !isFinished(mission) || (mission.finishedAt ?? now) > now - MISSION_LOG_DAYS * DAY_MS,
  ),
});

/** Why an issue cannot be sent on a mission, or none when it can. */
export const sendRefusal = (
  file: MissionsFile,
  planet: string,
  issue: Pick<Issue, 'number' | 'state' | 'pull'>,
): string | undefined => {
  if (issue.pull) return `#${issue.number} is a pull request, not an issue.`;
  if (issue.state !== 'open') return `#${issue.number} is closed.`;
  const unfinished = file.missions.find(
    (mission) =>
      mission.planet === planet && mission.issue.number === issue.number && !isFinished(mission),
  );
  return unfinished === undefined
    ? undefined
    : `#${issue.number} is on a mission already (${unfinished.state}).`;
};

/** The running mission, if any. */
export const runningMission = (file: MissionsFile): Mission | undefined =>
  file.missions.find(isRunning);

/** The queued missions, oldest first. */
export const missionQueue = (file: MissionsFile): ReadonlyArray<Mission> =>
  file.missions.filter((mission) => mission.state === 'queued').sort((a, b) => a.sentAt - b.sentAt);

/** The mission whose turn it is: the oldest queued one, when none is running or lost. */
export const nextMission = (file: MissionsFile): Mission | undefined =>
  runningMission(file) === undefined ? missionQueue(file)[0] : undefined;

/** The worktree an earlier, finished mission of the same issue kept, for a mission sent again. */
export const keptWorktree = (file: MissionsFile, mission: Mission): MissionWorktree | undefined =>
  file.missions
    .filter(
      (other) =>
        other.id !== mission.id &&
        other.planet === mission.planet &&
        other.issue.number === mission.issue.number &&
        (other.state === 'failed' || other.state === 'aborted') &&
        other.worktree !== undefined,
    )
    .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0))[0]?.worktree;

/** The mission log: finished missions, newest first. */
export const missionLog = (file: MissionsFile): ReadonlyArray<Mission> =>
  file.missions.filter(isFinished).sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0));

/** Whether a finished mission finished after the owner last opened the log. */
export const isNewInLog = (file: MissionsFile, mission: Mission): boolean =>
  isFinished(mission) && (mission.finishedAt ?? 0) > file.seenAt;

/** How many finished missions are new since the owner last opened the log. */
export const newInLog = (file: MissionsFile): number =>
  file.missions.filter((mission) => isNewInLog(file, mission)).length;

/** What the server reads about a running mission to tell its state. */
export interface MissionFacts {
  /** Its agent as the multiplexer has it now; none when the agent is gone. */
  readonly agent: { readonly status: string } | undefined;
  /** The pull request its agent attached on its repository, with its state on Gitea. */
  readonly pullRequest:
    | (MissionPullRequest & { readonly state: 'open' | 'closed' | 'merged' })
    | undefined;
}

/** The next step of a running mission. */
export type MissionStep =
  | { readonly _tag: 'Stay' }
  | { readonly _tag: 'Move'; readonly state: 'working' | 'waiting' | 'pull-request' }
  | { readonly _tag: 'Lost' }
  | { readonly _tag: 'Merged'; readonly pullRequest: MissionPullRequest }
  | { readonly _tag: 'Failed'; readonly reason: string };

/**
 * The step a running mission takes from the facts: merged or closed pull requests end it, a gone
 * agent loses it, an attached pull request moves it on, and the agent's status says whether it
 * waits on the owner. A lost mission stays lost until the owner resumes or aborts it.
 */
export const missionStep = (mission: Mission, facts: MissionFacts): MissionStep => {
  if (mission.state === 'lost') return { _tag: 'Stay' };
  const pull = facts.pullRequest;
  if (pull?.state === 'merged') {
    return { _tag: 'Merged', pullRequest: { number: pull.number, url: pull.url } };
  }
  if (pull?.state === 'closed') {
    return { _tag: 'Failed', reason: `Pull request #${pull.number} was closed without merging.` };
  }
  if (facts.agent === undefined) return { _tag: 'Lost' };
  const state =
    pull !== undefined ? 'pull-request' : facts.agent.status === 'blocked' ? 'waiting' : 'working';
  return state === mission.state ? { _tag: 'Stay' } : { _tag: 'Move', state };
};

/** The mission with `id` changed by `change`; the others as they are. */
export const updateMission = (
  file: MissionsFile,
  id: string,
  change: (mission: Mission) => Mission,
): MissionsFile => ({
  ...file,
  missions: file.missions.map((mission) => (mission.id === id ? change(mission) : mission)),
});

const LANE_STEPS: Record<Lane, string> = {
  hop: 'This is a hop: flight-implement (the change itself, one task) and then flight-ship.',
  'full-flight':
    'This is a full flight: flight-grill, flight-spec, flight-plan, flight-tasks, flight-verify, flight-implement and flight-ship.',
};

/**
 * The first prompt of a mission's agent: the flight rules, its lane, the issue with its text, and
 * what being on a mission means. `continued` when it starts in the worktree of an earlier mission.
 */
export const missionPrompt = (input: {
  readonly lane: Lane;
  readonly issue: Pick<Issue, 'number' | 'title' | 'body'> & { readonly url: string };
  readonly repository: GiteaRepository;
  readonly continued: boolean;
}): string =>
  [
    `You are on a mission for Pocket Comms: carry out issue #${input.issue.number} of ${input.repository.owner}/${input.repository.name} on your own.`,
    '',
    `Load the flight-rules skill and follow it. ${LANE_STEPS[input.lane]}`,
    'Load the comms-mission skill too: it says how you work on a mission.',
    '',
    'On a mission:',
    '- Ask the owner with your question tool, as always, and also post every question, and in a full flight the confirmed grilling summary, as a comment on the issue (comms-mission skill).',
    '- Attach your pull request to this conversation with the comms-attach-pull-request skill.',
    "- Merge the pull request yourself once CI is green, as the mission bot (comms-mission skill), unless the flight rules' stops say to ask first.",
    '- Never deploy.',
    '- At the end, report your outcome in one paragraph with the comms-mission skill: done after the merge, or failed when you cannot go on.',
    ...(input.continued
      ? [
          '',
          'An earlier mission of this issue stopped in this worktree. Continue from your branch: read its commits and any pull request first.',
        ]
      : []),
    '',
    `Issue #${input.issue.number}: ${input.issue.title}`,
    input.issue.url,
    '',
    input.issue.body.trim() === '' ? '(The issue has no description.)' : input.issue.body,
  ].join('\n');

/** The comment the bot leaves when a mission starts. */
export const startComment = (lane: Lane, continued: boolean): string =>
  `Mission started (${lane === 'hop' ? 'hop' : 'full flight'})${continued ? ', continuing from the kept worktree' : ''}. Pocket Comms follows it in Mission Control.`;

/** The comment the bot leaves when a mission ends without a merge. */
export const endComment = (state: 'failed' | 'aborted', reason: string): string =>
  state === 'aborted'
    ? `Mission aborted: ${reason} The branch and the worktree are kept; sending the issue again continues from them.`
    : `Mission failed: ${reason} The branch and the worktree are kept; sending the issue again continues from them.`;

// ---- Deploy (spec 036) ---------------------------------------------------------------------

/** The planet's missions that wait for the owner to deploy, oldest first. */
export const awaitingDeploy = (file: MissionsFile, planet: string): ReadonlyArray<Mission> =>
  file.missions
    .filter((mission) => mission.planet === planet && mission.state === 'awaiting-deploy')
    .sort((a, b) => (a.finishedAt ?? 0) - (b.finishedAt ?? 0));

/**
 * Whether the planet's next merge must wait for the owner too: a mission waits for the owner's
 * Deploy, or one is queued by it (spec 036, requirement 8).
 */
export const planetWaitsForOwner = (file: MissionsFile, planet: string): boolean =>
  file.missions.some(
    (mission) =>
      mission.planet === planet &&
      (mission.state === 'awaiting-deploy' ||
        (mission.deploy !== undefined && !isFinished(mission))),
  );

/**
 * The planet's latest finished deploy: deployed, rolled back, or a release that failed and opened
 * a fix issue; none before the first.
 */
export const lastDeploy = (file: MissionsFile, planet: string): Mission | undefined =>
  file.missions
    .filter(
      (mission) =>
        mission.planet === planet &&
        (mission.state === 'deployed' ||
          mission.state === 'rolled-back' ||
          (mission.state === 'failed' && mission.fixIssue !== undefined)),
    )
    .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0))[0];

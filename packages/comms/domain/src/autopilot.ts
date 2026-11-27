import * as Result from 'effect/Result';
import type { FieldIssue } from '@pocket-comms/backend-shared';
import { InvalidInputError } from './errors.js';
import { isInProgressLabel, type Issue } from './issue.js';
import { isFinished, laneLabel, type Mission } from './mission.js';

// The rules of Autopilot (spec 038, ADR 0021): the Autopilot window, the budget and the switch;
// which issues the triage takes and what its verdicts write; which hops Autopilot sends and in
// what order; the breaker; and the morning summary. Nothing here reads the clock or Gitea.

/** The owner's settings of Autopilot, for all planets. */
export interface AutopilotSettings {
  /** The Autopilot switch. */
  readonly enabled: boolean;
  /** The Autopilot window's start and end, `HH:MM` in the server's local time. */
  readonly start: string;
  readonly end: string;
  /** The most missions Autopilot sends in one window, across all planets. */
  readonly budget: number;
}

export const DEFAULT_AUTOPILOT: AutopilotSettings = {
  enabled: true,
  start: '23:00',
  end: '07:00',
  budget: 5,
};

export const MAX_BUDGET = 50;

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/u;

/** The minutes after midnight of an `HH:MM` time; none when it is not one. */
export const minutesOf = (time: string): number | undefined => {
  const match = TIME.exec(time);
  return match === null ? undefined : Number(match[1]) * 60 + Number(match[2]);
};

/** The settings when the owner's input is valid: two times that differ, a budget of 0 to 50. */
export const parseAutopilotSettings = (
  input: AutopilotSettings,
): Result.Result<AutopilotSettings, InvalidInputError> => {
  const start = minutesOf(input.start);
  const end = minutesOf(input.end);
  const issues: Array<FieldIssue> = [
    ...(start === undefined ? [{ field: 'start', message: 'Give the start as HH:MM.' }] : []),
    ...(end === undefined ? [{ field: 'end', message: 'Give the end as HH:MM.' }] : []),
    ...(start !== undefined && start === end
      ? [{ field: 'end', message: 'The window must end at another time than it starts.' }]
      : []),
    ...(!Number.isInteger(input.budget) || input.budget < 0 || input.budget > MAX_BUDGET
      ? [{ field: 'budget', message: `The budget is a whole number from 0 to ${MAX_BUDGET}.` }]
      : []),
  ];
  return issues.length === 0
    ? Result.succeed(input)
    : Result.fail(new InvalidInputError({ issues }));
};

/** The server's local time: today's and yesterday's date (`YYYY-MM-DD`), and minutes after midnight. */
export interface LocalTime {
  readonly date: string;
  readonly yesterday: string;
  readonly minutes: number;
}

/**
 * The Autopilot window the local time is in, named by the date it opened; none outside it. A window
 * may cross midnight: 23:00 to 07:00 opened yesterday at 06:00.
 */
export const windowOf = (settings: AutopilotSettings, local: LocalTime): string | undefined => {
  const start = minutesOf(settings.start);
  const end = minutesOf(settings.end);
  if (start === undefined || end === undefined || start === end) return undefined;
  if (start < end) return local.minutes >= start && local.minutes < end ? local.date : undefined;
  if (local.minutes >= start) return local.date;
  return local.minutes < end ? local.yesterday : undefined;
};

// ---- The triage ---------------------------------------------------------------------------------

/** What the triage says of an issue. */
export type TriageVerdict = 'hop' | 'full-flight' | 'not-ready';

export const TRIAGE_VERDICTS: ReadonlyArray<TriageVerdict> = ['hop', 'full-flight', 'not-ready'];

export const NOT_READY_LABEL = 'autopilot:not-ready';
export const SKIP_LABEL = 'autopilot:skip';
export const PRIORITY_LABELS = ['priority/high', 'priority/medium'] as const;

export const AUTOPILOT_LABEL_STYLE = {
  color: '#0e8a16',
  description: 'Mission Control: what Autopilot decided (spec 038).',
} as const;

/** The title every fix issue starts with (spec 036). */
const FIX_ISSUE_TITLE = 'Fix the failed deploy';

/** At most this many issues of a planet are triaged in one window, the oldest first. */
export const TRIAGE_LIMIT = 30;

/** The label a verdict sets. */
export const verdictLabel = (verdict: TriageVerdict): string =>
  verdict === 'not-ready' ? NOT_READY_LABEL : laneLabel(verdict);

const VERDICT_LABELS = TRIAGE_VERDICTS.map(verdictLabel);

const VERDICT_WORDS: Record<TriageVerdict, string> = {
  hop: 'hop',
  'full-flight': 'full flight',
  'not-ready': 'not ready',
};

/** The comment the bot leaves with a verdict. */
export const triageComment = (verdict: TriageVerdict, reason: string): string =>
  `Autopilot triage: ${VERDICT_WORDS[verdict]} — ${reason.trim()}`;

/** What the triage wrote on an issue, to tell later whether the issue changed since. */
export interface TriagedIssue {
  readonly planet: string;
  readonly number: number;
  readonly hash: string;
  readonly verdict: TriageVerdict;
}

/** A short fingerprint of an issue's title and text (FNV-1a, 32 bits). */
export const issueHash = (title: string, body: string): string => {
  let hash = 0x811c9dc5;
  for (const char of `${title}\u0000${body}`) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
};

/** The issue numbers the open pull requests among `open` name, as `#<number>`. */
export const namedByPullRequests = (open: ReadonlyArray<Issue>): ReadonlySet<number> =>
  new Set(
    open
      .filter((item) => item.pull && item.state === 'open')
      .flatMap((pull) =>
        [...`${pull.title}\n${pull.body}`.matchAll(/#(\d+)\b/gu)].map((match) => Number(match[1])),
      ),
  );

/**
 * Whether Autopilot leaves an issue alone, to triage and to send (spec 038, requirements 8 and
 * 11): a pull request, closed, in progress, skipped, named by an open pull request, on an
 * unfinished mission, or a fix issue.
 */
const leftAlone = (
  issue: Issue,
  named: ReadonlySet<number>,
  onMission: ReadonlySet<number>,
): boolean =>
  issue.pull ||
  issue.state !== 'open' ||
  issue.labels.some(isInProgressLabel) ||
  issue.labels.includes(SKIP_LABEL) ||
  named.has(issue.number) ||
  onMission.has(issue.number) ||
  issue.title.startsWith(FIX_ISSUE_TITLE);

/**
 * The issues of a planet the triage takes (spec 038, requirement 8), oldest first, at most 30:
 * those without a verdict label, and those Autopilot triaged whose title or text changed since
 * while their label is still Autopilot's. A label the owner set is never triaged again.
 */
export const toTriage = (
  planet: string,
  open: ReadonlyArray<Issue>,
  triaged: ReadonlyArray<TriagedIssue>,
  onMission: ReadonlySet<number>,
): ReadonlyArray<Issue> => {
  const named = namedByPullRequests(open);
  return open
    .filter((issue) => {
      if (leftAlone(issue, named, onMission)) return false;
      const labels = issue.labels.filter((label) => VERDICT_LABELS.includes(label));
      if (labels.length === 0) return true;
      const before = triaged.find((each) => each.planet === planet && each.number === issue.number);
      return (
        before !== undefined &&
        labels.length === 1 &&
        labels[0] === verdictLabel(before.verdict) &&
        before.hash !== issueHash(issue.title, issue.body)
      );
    })
    .sort((a, b) => a.number - b.number)
    .slice(0, TRIAGE_LIMIT);
};

// ---- Sending ------------------------------------------------------------------------------------

/** Whether Autopilot may send an issue (spec 038, requirement 11): an open, untouched hop. */
export const isSendableHop = (
  issue: Issue,
  named: ReadonlySet<number>,
  onMission: ReadonlySet<number>,
): boolean =>
  !leftAlone(issue, named, onMission) &&
  issue.labels.includes(laneLabel('hop')) &&
  !issue.labels.includes(NOT_READY_LABEL);

/** A hop Autopilot may send, with its planet. */
export interface HopCandidate {
  readonly planet: string;
  readonly issue: Issue;
}

const priorityOf = (issue: Issue): number => {
  const index = PRIORITY_LABELS.findIndex((label) => issue.labels.includes(label));
  return index < 0 ? PRIORITY_LABELS.length : index;
};

/**
 * The hop to send next (spec 038, requirement 12): planets take turns, the one with the fewest
 * missions sent in this window first, then by name; within a planet, `priority/high`, then
 * `priority/medium`, then the rest, each oldest first.
 */
export const pickHop = (
  candidates: ReadonlyArray<HopCandidate>,
  sentByPlanet: ReadonlyMap<string, number>,
): HopCandidate | undefined =>
  [...candidates].sort(
    (a, b) =>
      (sentByPlanet.get(a.planet) ?? 0) - (sentByPlanet.get(b.planet) ?? 0) ||
      a.planet.localeCompare(b.planet) ||
      priorityOf(a.issue) - priorityOf(b.issue) ||
      a.issue.number - b.issue.number,
  )[0];

// ---- The night ----------------------------------------------------------------------------------

/** One verdict of a window's triage. */
export interface TriageResult {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly verdict: TriageVerdict;
  readonly reason: string;
}

/** A planet's triage in a window: its verdicts, or why it was skipped. */
export interface PlanetTriage {
  readonly planet: string;
  readonly verdicts: ReadonlyArray<TriageResult>;
  readonly skipped?: string | undefined;
}

/** How a mission Autopilot sent ended, in the order Autopilot saw the endings. */
export interface NightEnding {
  readonly id: string;
  readonly failed: boolean;
}

/** One Autopilot window: what it triaged and sent, and why it stopped. */
export interface AutopilotNight {
  /** The window, by the date it opened. */
  readonly window: string;
  /** Whether the planets were triaged in this window. */
  readonly triaged: boolean;
  readonly triage: ReadonlyArray<PlanetTriage>;
  /** The missions Autopilot sent, in order. */
  readonly sent: ReadonlyArray<string>;
  readonly endings: ReadonlyArray<NightEnding>;
  /** Why Autopilot sends nothing more in this window. */
  readonly stopped?: string | undefined;
  /** Whether the morning summary went out. */
  readonly summarySent: boolean;
}

export const newNight = (window: string): AutopilotNight => ({
  window,
  triaged: false,
  triage: [],
  sent: [],
  endings: [],
  summarySent: false,
});

/** The states that end a mission Autopilot sent as a failure (spec 038, requirement 14). */
export const isAutopilotFailure = (mission: Mission): boolean =>
  mission.state === 'failed' || mission.state === 'aborted' || mission.state === 'lost';

/** Whether a mission's ending is known: finished, or lost. */
export const hasEnded = (mission: Mission): boolean =>
  mission.state === 'lost' || isFinished(mission);

/** Whether the last two endings of the window are failures (spec 038, requirement 15). */
export const breakerTripped = (endings: ReadonlyArray<NightEnding>): boolean =>
  endings.length >= 2 && endings.slice(-2).every((ending) => ending.failed);

export const BREAKER_REASON = 'two missions in a row failed.';

const counted = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

/**
 * The morning summary of a window (spec 038, requirement 19); none when Autopilot neither
 * triaged nor sent anything in it.
 */
export const nightSummary = (
  night: AutopilotNight,
  missions: ReadonlyArray<Mission>,
): string | undefined => {
  const sent = night.sent
    .map((id) => missions.find((mission) => mission.id === id))
    .filter((mission): mission is Mission => mission !== undefined);
  const verdicts = night.triage.flatMap((planet) => planet.verdicts);
  const skipped = night.triage.filter((planet) => planet.skipped !== undefined);
  if (
    sent.length === 0 &&
    verdicts.length === 0 &&
    skipped.length === 0 &&
    night.stopped === undefined
  ) {
    return undefined;
  }
  const of = (states: ReadonlyArray<string>) =>
    sent.filter((mission) => states.includes(mission.state)).length;
  const deployed = of(['deployed']);
  const merged = of(['merged', 'not-deployed', 'nothing-to-release', 'awaiting-deploy']);
  const failed = of(['failed', 'aborted', 'lost', 'held', 'rolled-back', 'down', 'deploy-lost']);
  const running = sent.length - deployed - merged - failed;
  const fullFlights = verdicts.filter((verdict) => verdict.verdict === 'full-flight').length;
  const notReady = verdicts.filter((verdict) => verdict.verdict === 'not-ready').length;
  const parts = [
    deployed > 0 ? `${deployed} deployed` : undefined,
    merged > 0 ? `${merged} merged without a deploy` : undefined,
    failed > 0 ? `${failed} failed` : undefined,
    running > 0 ? `${running} still running` : undefined,
    fullFlights > 0
      ? `${counted(fullFlights, 'full flight waits', 'full flights wait')} for your grilling`
      : undefined,
    notReady > 0 ? `${notReady} not ready` : undefined,
  ].filter((part): part is string => part !== undefined);
  const head = `Autopilot: ${parts.length === 0 ? 'nothing to send' : parts.join(', ')}.`;
  const why = [
    ...(night.stopped === undefined ? [] : [`Stopped: ${night.stopped}`]),
    ...skipped.map((planet) => `Triage of ${planet.planet} skipped: ${planet.skipped}`),
  ];
  return [head, ...why].join(' ');
};

/** The Autopilot file: the owner's settings, what the triage wrote, and the current or last window. */
export interface AutopilotFile {
  readonly settings: AutopilotSettings;
  readonly triaged: ReadonlyArray<TriagedIssue>;
  readonly night?: AutopilotNight | undefined;
}

export const EMPTY_AUTOPILOT: AutopilotFile = { settings: DEFAULT_AUTOPILOT, triaged: [] };

import type { Lane, MissionState } from '@pocket-comms/comms-domain';

/** A mission as the cockpit shows it (spec 035). Times are epoch milliseconds. */
export interface MissionDto {
  readonly id: string;
  readonly planet: string;
  readonly issue: { readonly number: number; readonly title: string; readonly url: string };
  readonly lane: Lane;
  readonly state: MissionState;
  readonly sentAt: number;
  readonly startedAt?: number | undefined;
  readonly finishedAt?: number | undefined;
  /** Its agent's name, while it has one. */
  readonly agent?: string | undefined;
  readonly pullRequest?: { readonly number: number; readonly url: string } | undefined;
  readonly outcome?: string | undefined;
  readonly reason?: string | undefined;
  /** The tags it released (spec 036). */
  readonly versions?: ReadonlyArray<string> | undefined;
  /** The deploy script's output of a failed deploy. */
  readonly output?: string | undefined;
  /** The issue a failed release or deploy opened. */
  readonly fixIssue?: number | undefined;
  /** The mission whose Deploy it ships with. */
  readonly deployWith?: string | undefined;
  /** In the log: finished since the owner last opened it. */
  readonly isNew?: boolean | undefined;
}

/** Mission Control: the running mission, the mission queue and the mission log. */
export interface MissionsDto {
  readonly running?: MissionDto | undefined;
  readonly queue: ReadonlyArray<MissionDto>;
  readonly log: ReadonlyArray<MissionDto>;
  readonly newCount: number;
}

/** What an agent reports at the end of its mission. */
export interface MissionOutcomeInput {
  readonly result: 'done' | 'failed';
  readonly outcome: string;
}

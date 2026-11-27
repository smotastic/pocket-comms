import type { AutopilotSettings, MissionState, PlanetTriage } from '@pocket-comms/comms-domain';

/** A mission Autopilot sent in a window (spec 038). */
export interface AutopilotMissionDto {
  readonly id: string;
  readonly planet: string;
  readonly issue: { readonly number: number; readonly title: string; readonly url: string };
  readonly state: MissionState;
}

/** The current or latest Autopilot window (spec 038, requirement 20). */
export interface AutopilotNightDto {
  /** The window, by the date it opened (`YYYY-MM-DD`). */
  readonly window: string;
  readonly triaged: boolean;
  readonly triage: ReadonlyArray<PlanetTriage>;
  readonly sent: ReadonlyArray<AutopilotMissionDto>;
  /** Why Autopilot sends nothing more in this window. */
  readonly stopped?: string | undefined;
}

/** Autopilot in Mission Control: the owner's settings, whether the window is open, the planets and the window. */
export interface AutopilotDto {
  readonly settings: AutopilotSettings;
  readonly open: boolean;
  /** The planets at autopilot in effect. */
  readonly planets: ReadonlyArray<string>;
  readonly night?: AutopilotNightDto | undefined;
}

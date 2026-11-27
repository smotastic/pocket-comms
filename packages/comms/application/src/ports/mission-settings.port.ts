import * as Context from 'effect/Context';

/**
 * Where the Claude settings of a mission's agent are (spec 035, ADR 0019): auto mode and the deny
 * list, shipped with the server and passed with `--settings`.
 */
export class MissionSettings extends Context.Service<
  MissionSettings,
  { readonly settingsPath: string }
>()('comms/application/MissionSettings') {}

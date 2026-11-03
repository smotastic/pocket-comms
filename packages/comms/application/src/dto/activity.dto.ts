import type { ActivityEvent } from '@pocket-comms/comms-domain';

/** One event of the timeline, and whether its agent still runs. */
export type ActivityEventDto = ActivityEvent & { readonly live: boolean };

/** The timeline, newest first. */
export interface ActivityDto {
  readonly events: ReadonlyArray<ActivityEventDto>;
}

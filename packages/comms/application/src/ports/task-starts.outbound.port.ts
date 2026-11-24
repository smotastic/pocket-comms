import type { TaskStart } from '@pocket-comms/comms-domain';
import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';
import type { TaskStartsStoreError } from '../errors.js';

/**
 * The task starts whose first prompt is not yet delivered (spec 032), one per worktree folder,
 * kept across restarts. A change replaces or removes one start and leaves the others alone.
 */
export class TaskStartsOutbound extends Context.Service<
  TaskStartsOutbound,
  {
    readonly load: Effect.Effect<ReadonlyArray<TaskStart>, TaskStartsStoreError>;
    /** Keeps `start` in place of the one of its folder. */
    readonly put: (start: TaskStart) => Effect.Effect<void, TaskStartsStoreError>;
    /** Forgets the start of `folder`; none there changes nothing. */
    readonly forget: (folder: string) => Effect.Effect<void, TaskStartsStoreError>;
  }
>()('comms/application/TaskStartsOutbound') {}

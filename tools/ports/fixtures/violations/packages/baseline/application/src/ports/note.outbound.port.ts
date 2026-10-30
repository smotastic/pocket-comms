import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';
import type { Note } from '../../../domain/src/index.js';

/** A port-owned type: type-only exports are allowed next to the port classes. */
export interface NoteQuery {
  readonly limit: number;
}

export class NoteRepositoryOutbound extends Context.Service<
  NoteRepositoryOutbound,
  {
    readonly insert: (note: Note) => Effect.Effect<void>;
    readonly list: (query: NoteQuery) => Effect.Effect<ReadonlyArray<Note>>;
  }
>()('baseline/application/NoteRepositoryOutbound') {}

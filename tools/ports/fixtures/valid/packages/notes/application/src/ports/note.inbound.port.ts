import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import type { Note } from '../../../domain/src/index.js';
import { makeCreateNote } from '../use-cases/create-note.use-case.js';
import { makeListNotes } from '../use-cases/list-notes.use-case.js';

// One inbound port per resource (ADR 0006): its `layer` joins the use cases of the resource.
export class NotesInbound extends Context.Service<
  NotesInbound,
  {
    readonly create: (text: string) => Effect.Effect<void>;
    readonly list: (limit: number) => Effect.Effect<ReadonlyArray<Note>>;
  }
>()('notes/application/NotesInbound') {
  static readonly layer = Layer.effect(
    NotesInbound,
    Effect.gen(function* () {
      return { ...(yield* makeCreateNote), ...(yield* makeListNotes) };
    }),
  );
}

// Type-only re-exports of a port class are type exports too.
export type { NoteRepositoryOutbound } from './note.outbound.port.js';

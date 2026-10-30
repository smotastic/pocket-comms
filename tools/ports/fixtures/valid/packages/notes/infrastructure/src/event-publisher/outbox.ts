import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import type { Note } from '../../../domain/src/index.js';
import {
  NoteEventPublisherOutbound,
  TransactionOutbound,
} from '../../../application/src/ports/note-event.outbound.port.js';

/** A service of the adapter itself, next to the port it provides. */
export class OutboxRows extends Context.Service<OutboxRows, Array<Note>>()(
  'notes/infrastructure/OutboxRows',
) {}

export const layerOutbox = Layer.effectContext(
  Effect.gen(function* () {
    const transactionOutbound = yield* TransactionOutbound;
    const rows: Array<Note> = [];
    const publish = (note: Note) =>
      transactionOutbound.run(Effect.sync(() => void rows.push(note)));
    return Context.make(NoteEventPublisherOutbound, { publish }).pipe(
      Context.add(OutboxRows, rows),
    );
  }),
);

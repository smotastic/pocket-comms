import * as Effect from 'effect/Effect';
import { NoteRepositoryOutbound } from '../ports/note.outbound.port.js';

export const makeListNotes = Effect.gen(function* () {
  const noteRepositoryOutbound = yield* NoteRepositoryOutbound;
  return {
    list: (limit: number) => noteRepositoryOutbound.list({ limit }),
  };
});

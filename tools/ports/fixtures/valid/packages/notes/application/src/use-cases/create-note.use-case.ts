import * as Effect from 'effect/Effect';
import { NoteRepositoryOutbound } from '../ports/note.outbound.port.js';

export const makeCreateNote = Effect.gen(function* () {
  const noteRepositoryOutbound = yield* NoteRepositoryOutbound;
  return {
    create: (text: string) => noteRepositoryOutbound.insert({ id: text, text }),
  };
});

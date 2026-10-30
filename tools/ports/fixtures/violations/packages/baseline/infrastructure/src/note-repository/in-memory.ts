import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import type { Note } from '../../../domain/src/index.js';
import { NoteRepositoryOutbound } from '../../../application/src/ports/note.outbound.port.js';

export const layerInMemory = Layer.sync(NoteRepositoryOutbound, () => {
  const notes: Array<Note> = [];
  return {
    insert: (note: Note) => Effect.sync(() => void notes.push(note)),
    list: ({ limit }) => Effect.sync(() => notes.slice(0, limit)),
  };
});

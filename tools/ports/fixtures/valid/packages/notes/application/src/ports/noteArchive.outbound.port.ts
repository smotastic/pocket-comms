import type { NoteQuery } from './note.outbound.port.js';

// Any resource name is allowed before the direction; this file also re-exports types only.
export type { NoteQuery };
export type * as NotePorts from './note.outbound.port.js';

import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { makeCreateNote } from '../use-cases/create-note.use-case.js';

export class CreateNoteInbound extends Context.Service<
  CreateNoteInbound,
  { readonly create: (text: string) => Effect.Effect<void> }
>()('baseline/application/CreateNoteInbound') {
  static readonly layer = Layer.effect(CreateNoteInbound, makeCreateNote);
}

import { Context as C } from 'effect';
import type * as Effect from 'effect/Effect';
import type { Note } from '../../../domain/src/index.js';

// The outbox shape: the publisher writes into the transaction that stores the change.
export class NoteEventPublisherOutbound extends C.Service<
  NoteEventPublisherOutbound,
  { readonly publish: (note: Note) => Effect.Effect<void> }
>()('notes/application/NoteEventPublisherOutbound') {}

export class TransactionOutbound extends C.Service<
  TransactionOutbound,
  { readonly run: <A>(effect: Effect.Effect<A>) => Effect.Effect<A> }
>()('notes/application/TransactionOutbound') {}

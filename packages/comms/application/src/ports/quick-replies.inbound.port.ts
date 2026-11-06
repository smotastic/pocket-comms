import type { InvalidInputError } from '@pocket-comms/comms-domain';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import type { QuickRepliesDto } from '../dto/quick-replies.dto.js';
import type { QuickRepliesStoreError } from '../errors.js';
import { makeQuickReplies } from '../use-cases/quick-replies.use-case.js';

// The inbound port of the quick replies resource: the owner's own replies, one list for every
// conversation (spec 025).

export class QuickRepliesInbound extends Context.Service<
  QuickRepliesInbound,
  {
    readonly list: Effect.Effect<QuickRepliesDto, QuickRepliesStoreError>;
    readonly replace: (
      replies: ReadonlyArray<string>,
    ) => Effect.Effect<QuickRepliesDto, InvalidInputError | QuickRepliesStoreError>;
  }
>()('comms/application/QuickRepliesInbound') {
  static readonly layer = Layer.effect(QuickRepliesInbound, makeQuickReplies);
}

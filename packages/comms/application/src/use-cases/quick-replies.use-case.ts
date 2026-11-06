import { DEFAULT_QUICK_REPLIES, parseQuickReplies } from '@pocket-comms/comms-domain';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import type { QuickRepliesDto } from '../dto/quick-replies.dto.js';
import { QuickRepliesOutbound } from '../ports/quick-replies.outbound.port.js';

// The owner's quick replies: the saved list, or the default one until the owner saves their own.

export const makeQuickReplies = Effect.gen(function* () {
  const quickRepliesOutbound = yield* QuickRepliesOutbound;

  const list = quickRepliesOutbound.load.pipe(
    Effect.map(
      (saved): QuickRepliesDto => ({
        replies: Option.getOrElse(saved, () => DEFAULT_QUICK_REPLIES),
      }),
    ),
    Effect.withSpan('QuickReplies.list'),
  );

  const replace = Effect.fn('QuickReplies.replace')(function* (replies: ReadonlyArray<string>) {
    const parsed = yield* Effect.fromResult(parseQuickReplies(replies));
    yield* quickRepliesOutbound.save(parsed);
    return { replies: parsed } satisfies QuickRepliesDto;
  });

  return { list, replace };
});

import { completionKey } from '@pocket-comms/comms-domain';
import * as Effect from 'effect/Effect';
import { SeenOutbound } from '../ports/memory.outbound.port.js';
import { makeLoadAgents } from './agents.js';

export const makeAgent = Effect.gen(function* () {
  const seenOutbound = yield* SeenOutbound;
  const { find } = yield* makeLoadAgents;

  const agent = Effect.fn('Agent.agent')(function* (ref: string) {
    return (yield* find(ref)).dto;
  });

  /** Remembers that the owner has seen the current completion of a done agent. */
  const markSeen = Effect.fn('Agent.markSeen')(function* (ref: string) {
    const view = yield* find(ref);
    if (view.agent.status === 'done') yield* seenOutbound.markSeen(completionKey(view.agent));
  });

  return { agent, markSeen };
});

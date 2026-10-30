import { AgentsInbound } from '@pocket-comms/comms-application';
import { CommsApi } from '@pocket-comms/comms-contract';
import * as Effect from 'effect/Effect';
import { HttpApiBuilder } from 'effect/http-api';
import { problems } from './problems.js';

/** Implements the `agents` group; the wire shapes equal the application DTOs. */
export const agentsHandlers = HttpApiBuilder.group(
  CommsApi,
  'agents',
  Effect.fn(function* (handlers) {
    const agentsInbound = yield* AgentsInbound;

    // The failures every lookup of an agent can have.
    const lookup = {
      AgentNotFoundError: problems.agentNotFound,
      HerdrUnavailableError: problems.herdrUnavailable,
    } as const;

    return handlers
      .handle('overview', () =>
        agentsInbound.overview.pipe(
          Effect.catchTags({ HerdrUnavailableError: problems.herdrUnavailable }),
        ),
      )
      .handle('overviewEvents', () => Effect.succeed(agentsInbound.overviewChanges))
      .handle('agent', ({ params }) =>
        agentsInbound.agent(params.agent).pipe(Effect.catchTags(lookup)),
      )
      .handle('transcript', ({ params }) =>
        agentsInbound.transcript(params.agent).pipe(
          Effect.catchTags({
            ...lookup,
            TranscriptUnavailableError: problems.transcriptUnavailable,
          }),
        ),
      )
      .handle('agentEvents', ({ params }) =>
        agentsInbound.agentEvents(params.agent).pipe(Effect.catchTags(lookup)),
      )
      .handle('screen', ({ params }) =>
        agentsInbound.screen(params.agent).pipe(
          Effect.map((text) => ({ text })),
          Effect.catchTags({ ...lookup, HerdrRejectedError: problems.herdrRejected }),
        ),
      )
      .handle('prompt', ({ params, payload }) =>
        agentsInbound.prompt(params.agent, payload.text).pipe(
          Effect.catchTags({
            ...lookup,
            HerdrRejectedError: problems.herdrRejected,
            InvalidInputError: problems.invalidInput,
          }),
        ),
      )
      .handle('keys', ({ params, payload }) =>
        agentsInbound.sendKeys(params.agent, payload.keys).pipe(
          Effect.catchTags({
            ...lookup,
            HerdrRejectedError: problems.herdrRejected,
            InvalidInputError: problems.invalidInput,
          }),
        ),
      )
      .handle('seen', ({ params }) =>
        agentsInbound.markSeen(params.agent).pipe(Effect.catchTags(lookup)),
      );
  }),
);

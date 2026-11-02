import { BrainstormInbound } from '@pocket-comms/comms-application';
import { CommsApi } from '@pocket-comms/comms-contract';
import * as Effect from 'effect/Effect';
import * as Stream from 'effect/Stream';
import { HttpApiBuilder } from 'effect/http-api';
import { problems } from './problems.js';

/** Implements the `brainstorm` group (spec 013); the wire shapes equal the application DTOs. */
export const brainstormHandlers = HttpApiBuilder.group(
  CommsApi,
  'brainstorm',
  Effect.fn(function* (handlers) {
    const brainstormInbound = yield* BrainstormInbound;

    return handlers
      .handle('state', () => brainstormInbound.state)
      .handle('events', () =>
        Effect.succeed(
          brainstormInbound.events.pipe(Stream.map((data) => ({ event: 'brainstorm', data }))),
        ),
      )
      .handle('send', ({ payload }) =>
        brainstormInbound.send(payload.text).pipe(
          Effect.catchTags({
            BrainstormNotSetUpError: problems.brainstormNotSetUp,
            BrainstormBusyError: problems.brainstormBusy,
            InvalidInputError: problems.invalidInput,
          }),
        ),
      )
      .handle('decide', ({ params, payload }) =>
        brainstormInbound.decide(params.proposal, payload).pipe(
          Effect.catchTags({
            BrainstormNotSetUpError: problems.brainstormNotSetUp,
            BrainstormBusyError: problems.brainstormBusy,
            ProposalNotFoundError: problems.proposalNotFound,
            ProposalDecidedError: problems.proposalDecided,
            InvalidInputError: problems.invalidInput,
            NoGiteaRemoteError: problems.noGiteaRemote,
            GiteaNotConfiguredError: problems.giteaNotConfigured,
            GiteaUnavailableError: problems.giteaUnavailable,
          }),
        ),
      )
      .handle('reset', () => brainstormInbound.reset());
  }),
);

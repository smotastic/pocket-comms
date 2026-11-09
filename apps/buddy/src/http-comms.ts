import { CommsApi } from '@pocket-comms/comms-contract';
import {
  ConflictProblem,
  ForbiddenProblem,
  NotFoundProblem,
  ServiceUnavailableProblem,
  ValidationProblem,
} from '@pocket-comms/contracts-problem-details';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Stream from 'effect/Stream';
import { FetchHttpClient } from 'effect/http';
import * as HttpClientError from 'effect/http/HttpClientError';
import { HttpApiClient } from 'effect/http-api';
import { Busy, Comms, Failed, NotSetUp, Refused, Unreachable, type CommsError } from './comms.js';

// comms over HTTP, through the typed client of its contract. Its problems become the buddy's
// errors by their type, so the core can tell what to try again.

const PROBLEM_PREFIX = 'urn:pocket-comms:problem:';

const slugOf = (problem: { readonly type: string }) =>
  problem.type.startsWith(PROBLEM_PREFIX)
    ? problem.type.slice(PROBLEM_PREFIX.length)
    : problem.type;

const reasonOf = (problem: { readonly title: string; readonly detail?: string | undefined }) =>
  problem.detail ?? problem.title;

/** The buddy's error for a failure of the client, by the contract's problem classes. */
export const toCommsError = (error: unknown): CommsError => {
  if (HttpClientError.isHttpClientError(error)) {
    return new Unreachable({ reason: 'comms cannot be reached.' });
  }
  if (error instanceof ValidationProblem) {
    return new Refused({ reason: error.detail ?? error.errors[0]?.message ?? error.title });
  }
  if (error instanceof NotFoundProblem) return new Refused({ reason: reasonOf(error) });
  if (error instanceof ForbiddenProblem) {
    return new NotSetUp({
      reason: 'comms refused this machine: log in to the tailnet as the owner.',
    });
  }
  if (error instanceof ConflictProblem) {
    const slug = slugOf(error);
    if (slug === 'brainstorm-busy') return new Busy();
    if (slug === 'brainstorm-not-set-up') return new NotSetUp({ reason: reasonOf(error) });
    // Any other conflict, such as a proposal decided already, does not go away by trying again.
    return new Refused({ reason: reasonOf(error) });
  }
  if (error instanceof ServiceUnavailableProblem) {
    return slugOf(error) === 'speech-not-set-up'
      ? new NotSetUp({ reason: reasonOf(error) })
      : new Failed({ reason: reasonOf(error) });
  }
  return new Failed({ reason: 'comms answered something the buddy does not understand.' });
};

export const layer = (baseUrl: string) =>
  Layer.effect(
    Comms,
    Effect.gen(function* () {
      const api = yield* HttpApiClient.make(CommsApi, { baseUrl });
      const call = <A, E>(request: Effect.Effect<A, E>) =>
        request.pipe(Effect.mapError(toCommsError));

      return {
        transcribe: (clip) =>
          call(api.speech.transcribe({ payload: clip })).pipe(Effect.map((result) => result.text)),
        send: (message) => call(api.brainstorm.send({ payload: { text: message } })),
        answering: call(api.brainstorm.state()).pipe(
          Effect.flatMap((state) =>
            state._tag === 'Ready'
              ? Effect.succeed(state.answering)
              : Effect.fail(new NotSetUp({ reason: state.reason })),
          ),
        ),
        events: (after) =>
          Stream.unwrap(call(api.brainstorm.events({ query: { after } }))).pipe(
            Stream.map((event) => event.data),
            Stream.mapError(toCommsError),
          ),
        // Each kind of decision is its own request shape to the client.
        decide: (proposal, decision) =>
          call(
            decision._tag === 'Create'
              ? api.brainstorm.decide({ params: { proposal }, payload: decision })
              : api.brainstorm.decide({ params: { proposal }, payload: decision }),
          ),
      };
    }),
  ).pipe(Layer.provide(FetchHttpClient.layer));

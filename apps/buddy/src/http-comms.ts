import { CommsApi } from '@pocket-comms/comms-contract';
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

const field = (value: unknown, name: string): unknown =>
  typeof value === 'object' && value !== null ? Reflect.get(value, name) : undefined;

const text = (value: unknown) => (typeof value === 'string' ? value : undefined);

/** The words of a validation problem: its detail, or its first field's message. */
const firstIssue = (error: unknown) => {
  const errors = field(error, 'errors');
  return Array.isArray(errors) ? text(field(errors[0], 'message')) : undefined;
};

export const toCommsError = (error: unknown): CommsError => {
  if (HttpClientError.isHttpClientError(error)) {
    return new Unreachable({ reason: 'comms cannot be reached.' });
  }
  const type = text(field(error, 'type'));
  const status = field(error, 'status');
  if (type === undefined || typeof status !== 'number') {
    return new Failed({ reason: 'comms answered something the buddy does not understand.' });
  }
  const slug = type.startsWith(PROBLEM_PREFIX) ? type.slice(PROBLEM_PREFIX.length) : type;
  const reason =
    text(field(error, 'detail')) ?? firstIssue(error) ?? text(field(error, 'title')) ?? slug;
  if (slug === 'brainstorm-busy') return new Busy();
  if (slug === 'brainstorm-not-set-up' || slug === 'speech-not-set-up') {
    return new NotSetUp({ reason });
  }
  if (status === 403) {
    return new NotSetUp({
      reason: 'comms refused this machine: log in to the tailnet as the owner.',
    });
  }
  if (status === 422) return new Refused({ reason });
  return new Failed({ reason });
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

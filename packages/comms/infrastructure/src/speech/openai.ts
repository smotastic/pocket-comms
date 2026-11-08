import {
  type Clip,
  SpeechNotSetUpError,
  SpeechOutbound,
  SpeechUnavailableError,
} from '@pocket-comms/comms-application';
import { CLIP_EXTENSIONS } from '@pocket-comms/comms-domain';
import type * as Duration from 'effect/Duration';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Schema from 'effect/Schema';

// A speech-to-text service with the OpenAI transcription API, such as speaches with
// faster-whisper. It sends no language, so the service detects one per clip. A reason never
// names the service's address, because the phone shows it.

export interface OpenAiOptions {
  /** The API base, such as `http://localhost:4430/v1`. */
  readonly url: string;
  /** The model the service transcribes with, such as `Systran/faster-whisper-small`. */
  readonly model: string;
  /** How long one clip may take. Default 90 seconds, room for two minutes of speech on a CPU. */
  readonly timeout?: Duration.Input;
}

// `fetch` names the network error (refused, unknown host) in its `cause`.
const causeOf = (error: unknown): string => {
  if (!(error instanceof Error)) return String(error);
  return error.cause instanceof Error ? `${error.message}: ${error.cause.message}` : error.message;
};

const decodeAnswer = Schema.decodeUnknownEffect(Schema.Struct({ text: Schema.String }));

export const layerOpenAi = ({ url, model, timeout = '90 seconds' }: OpenAiOptions) => {
  const endpoint = `${url.replace(/\/+$/u, '')}/audio/transcriptions`;
  const unavailable = (reason: string) => new SpeechUnavailableError({ reason });
  const unknownShape = () => unavailable('The speech service answered in an unknown shape.');

  const transcribe = ({ bytes, format }: Clip) =>
    Effect.gen(function* () {
      const form = new FormData();
      form.append('file', new Blob([bytes.slice()]), `clip.${CLIP_EXTENSIONS[format]}`);
      form.append('model', model);
      const reply = yield* Effect.tryPromise({
        // A redirect is not followed, so a clip never goes to another address. The body is read
        // under the same signal, so the deadline also ends an answer that stops halfway.
        try: async (signal) => {
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: { accept: 'application/json' },
            body: form,
            signal,
            redirect: 'manual',
          });
          if (!response.ok) {
            await response.body?.cancel();
            return { status: response.status, ok: false, body: '' };
          }
          return { status: response.status, ok: true, body: await response.text() };
        },
        catch: (cause) => cause,
      }).pipe(
        // The phone gets a reason without the address; the server log keeps the cause.
        Effect.catch((cause) =>
          Effect.logWarning('The speech service cannot be reached').pipe(
            Effect.annotateLogs({ cause: causeOf(cause) }),
            Effect.andThen(Effect.fail(unavailable('The speech service cannot be reached.'))),
          ),
        ),
      );
      if (reply.status >= 300 && reply.status < 400) {
        return yield* unavailable(`The speech service answered with a redirect (${reply.status}).`);
      }
      if (!reply.ok) return yield* unavailable(`The speech service answered ${reply.status}.`);
      const answer = yield* Effect.try({
        try: () => JSON.parse(reply.body) as unknown,
        catch: unknownShape,
      });
      const { text } = yield* decodeAnswer(answer).pipe(Effect.mapError(unknownShape));
      return text;
    }).pipe(
      Effect.timeoutOrElse({
        duration: timeout,
        orElse: () => Effect.fail(unavailable('The speech service did not answer in time.')),
      }),
      Effect.withSpan('Speech.transcribe', { attributes: { format, bytes: bytes.length } }),
    );

  return Layer.succeed(SpeechOutbound, { available: true, transcribe });
};

/** The server without a speech service: voice messages are not offered. */
export const layerNotSetUp = Layer.succeed(SpeechOutbound, {
  available: false,
  transcribe: () => Effect.fail(new SpeechNotSetUpError()),
});

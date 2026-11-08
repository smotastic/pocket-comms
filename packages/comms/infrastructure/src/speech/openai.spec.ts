import { describe, expect, it } from '@effect/vitest';
import {
  SpeechNotSetUpError,
  SpeechOutbound,
  SpeechUnavailableError,
} from '@pocket-comms/comms-application';
import * as Effect from 'effect/Effect';
import * as Logger from 'effect/Logger';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { layerNotSetUp, layerOpenAi, type OpenAiOptions } from './openai.js';

interface Seen {
  readonly method: string | undefined;
  readonly url: string | undefined;
  readonly contentType: string | undefined;
  readonly body: string;
}

interface Answer {
  readonly status: number;
  readonly body: unknown;
  readonly location?: string;
  /** Sends the headers and the start of the body, then never ends it. */
  readonly stall?: true;
}

// A fake speech service on a free local port; it answers through `answer`, or never when that is
// undefined, and records every request.
const fakeService = (answer: Answer | undefined) =>
  Effect.acquireRelease(
    Effect.callback<{ readonly url: string; readonly seen: Array<Seen>; close: () => void }>(
      (resume) => {
        const seen: Array<Seen> = [];
        const server = createServer((request: IncomingMessage, response: ServerResponse) => {
          const chunks: Array<Buffer> = [];
          request.on('data', (chunk: Buffer) => chunks.push(chunk));
          request.on('end', () => {
            seen.push({
              method: request.method,
              url: request.url,
              contentType: request.headers['content-type'],
              body: Buffer.concat(chunks).toString('latin1'),
            });
            if (answer === undefined) return;
            response.writeHead(answer.status, {
              'content-type': 'application/json',
              ...(answer.location === undefined ? {} : { location: answer.location }),
            });
            if (answer.stall === true) {
              response.write('{"text": "Hal');
              return;
            }
            response.end(
              typeof answer.body === 'string' ? answer.body : JSON.stringify(answer.body),
            );
          });
        });
        server.listen(0, '127.0.0.1', () => {
          const { port } = server.address() as AddressInfo;
          resume(
            Effect.succeed({
              url: `http://127.0.0.1:${port}/v1`,
              seen,
              close: () => {
                server.closeAllConnections();
                server.close();
              },
            }),
          );
        });
      },
    ),
    (service) => Effect.sync(() => service.close()),
  );

const MODEL = 'Systran/faster-whisper-small';
const CLIP = { bytes: Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, 1, 2]), format: 'webm' as const };

const withService = <A, E>(
  options: Omit<OpenAiOptions, 'model'>,
  use: (outbound: SpeechOutbound['Service']) => Effect.Effect<A, E>,
) => SpeechOutbound.use(use).pipe(Effect.provide(layerOpenAi({ model: MODEL, ...options })));

describe('Speech.layerOpenAi', () => {
  it.live('posts the clip and the model as one multipart request and answers the text', () =>
    Effect.gen(function* () {
      const service = yield* fakeService({ status: 200, body: { text: ' Hallo Welt ' } });

      const text = yield* withService({ url: `${service.url}/` }, (outbound) => {
        expect(outbound.available).toBe(true);
        return outbound.transcribe(CLIP);
      });

      expect(text).toBe(' Hallo Welt ');
      expect(service.seen).toHaveLength(1);
      const [request] = service.seen;
      expect(request?.method).toBe('POST');
      expect(request?.url).toBe('/v1/audio/transcriptions');
      expect(request?.contentType).toMatch(/^multipart\/form-data; boundary=/u);
      expect(request?.body).toContain('name="file"; filename="clip.webm"');
      expect(request?.body).toContain(`name="model"\r\n\r\n${MODEL}\r\n`);
      expect(request?.body).toContain('\x1a\x45\xdf\xa3');
      expect(request?.body).not.toContain('name="language"');
    }).pipe(Effect.scoped),
  );

  it.live.each<readonly [Answer, string]>([
    [{ status: 500, body: { detail: 'boom' } }, 'The speech service answered 500.'],
    [{ status: 422, body: 'bad' }, 'The speech service answered 422.'],
    [{ status: 200, body: { words: [] } }, 'The speech service answered in an unknown shape.'],
    [{ status: 200, body: 'not json' }, 'The speech service answered in an unknown shape.'],
    [
      { status: 302, body: '', location: 'http://elsewhere.test/' },
      'The speech service answered with a redirect (302).',
    ],
  ])('reports a failed answer without the address', ([answer, reason]) =>
    Effect.gen(function* () {
      const service = yield* fakeService(answer);

      const error = yield* withService({ url: service.url }, (outbound) =>
        outbound.transcribe(CLIP).pipe(Effect.flip),
      );

      expect(error).toEqual(new SpeechUnavailableError({ reason }));
      expect(service.seen).toHaveLength(1);
    }).pipe(Effect.scoped),
  );

  it.live('reports a service that does not answer in time', () =>
    Effect.gen(function* () {
      const service = yield* fakeService(undefined);

      const error = yield* withService({ url: service.url, timeout: '50 millis' }, (outbound) =>
        outbound.transcribe(CLIP).pipe(Effect.flip),
      );

      expect(error).toEqual(
        new SpeechUnavailableError({ reason: 'The speech service did not answer in time.' }),
      );
    }).pipe(Effect.scoped),
  );

  it.live('reports a service that stops in the middle of its answer', () =>
    Effect.gen(function* () {
      const service = yield* fakeService({ status: 200, body: '', stall: true });

      const error = yield* withService({ url: service.url, timeout: '100 millis' }, (outbound) =>
        outbound.transcribe(CLIP).pipe(Effect.flip),
      );

      expect(error).toEqual(
        new SpeechUnavailableError({ reason: 'The speech service did not answer in time.' }),
      );
    }).pipe(Effect.scoped),
  );

  it.live('logs why an unreachable service failed, for the server only', () =>
    Effect.gen(function* () {
      const logs: Array<string> = [];
      const logger = Logger.make((options) => logs.push(Logger.formatLogFmt.log(options)));

      yield* withService({ url: 'localhost:4430/v1' }, (outbound) =>
        outbound.transcribe(CLIP).pipe(Effect.flip),
      ).pipe(Effect.provide(Logger.layer([logger], { mergeWithExisting: false })));

      expect(logs).toHaveLength(1);
      expect(logs[0]).toContain('The speech service cannot be reached');
      expect(logs[0]).toMatch(/cause=/u);
    }),
  );

  it.live('reports an unreachable service without its address', () =>
    Effect.gen(function* () {
      const service = yield* fakeService({ status: 200, body: { text: '' } });
      service.close();

      const error = yield* withService({ url: service.url }, (outbound) =>
        outbound.transcribe(CLIP).pipe(Effect.flip),
      );

      expect(error).toEqual(
        new SpeechUnavailableError({ reason: 'The speech service cannot be reached.' }),
      );
    }).pipe(Effect.scoped),
  );
});

describe('Speech.layerNotSetUp', () => {
  it.effect('is not available and transcribes nothing', () =>
    Effect.gen(function* () {
      const outbound = yield* SpeechOutbound;

      expect(outbound.available).toBe(false);
      expect(yield* outbound.transcribe(CLIP).pipe(Effect.flip)).toEqual(new SpeechNotSetUpError());
    }).pipe(Effect.provide(layerNotSetUp)),
  );
});

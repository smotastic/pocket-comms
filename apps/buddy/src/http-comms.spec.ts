import { afterEach, describe, expect, it } from '@effect/vitest';
import * as Effect from 'effect/Effect';
import * as Stream from 'effect/Stream';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { Comms } from './comms.js';
import * as HttpComms from './http-comms.js';

interface Seen {
  readonly method: string;
  readonly url: string;
  readonly type: string | undefined;
  readonly body: Buffer;
}

let server: Server | undefined;
afterEach(async () => {
  await new Promise((resolve) =>
    server === undefined ? resolve(undefined) : server.close(resolve),
  );
  server = undefined;
});

/** Serves `answer` on a free port and answers its address and the requests it saw. */
const serve = (answer: (request: Seen, response: ServerResponse) => void) =>
  Effect.promise(
    () =>
      new Promise<{ readonly url: string; readonly seen: Array<Seen> }>((resolve) => {
        const seen: Array<Seen> = [];
        server = createServer((request: IncomingMessage, response) => {
          const chunks: Array<Buffer> = [];
          request.on('data', (chunk: Buffer) => chunks.push(chunk));
          request.on('end', () => {
            const one = {
              method: request.method ?? '',
              url: request.url ?? '',
              type: request.headers['content-type'],
              body: Buffer.concat(chunks),
            };
            seen.push(one);
            answer(one, response);
          });
        });
        server.listen(0, '127.0.0.1', () => {
          const address = server?.address();
          if (typeof address === 'object' && address !== null) {
            resolve({ url: `http://127.0.0.1:${address.port}`, seen });
          }
        });
      }),
  );

const json = (
  response: ServerResponse,
  status: number,
  body: unknown,
  type = 'application/json',
) => {
  response.writeHead(status, { 'content-type': type });
  response.end(JSON.stringify(body));
};

const problem = (response: ServerResponse, status: number, slug: string, extra = {}) =>
  json(
    response,
    status,
    { type: `urn:pocket-comms:problem:${slug}`, title: slug, status, ...extra },
    'application/problem+json',
  );

const withComms = <A, E>(url: string, body: (comms: Comms['Service']) => Effect.Effect<A, E>) =>
  Comms.use(body).pipe(Effect.provide(HttpComms.layer(url)));

const WAV = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]);

describe('HttpComms', () => {
  it.live('sends the clip as raw bytes and answers its words', () =>
    Effect.gen(function* () {
      const { url, seen } = yield* serve((_, response) =>
        json(response, 200, { text: 'dark mode' }),
      );

      const text = yield* withComms(url, (comms) => comms.transcribe(WAV));

      expect(text).toBe('dark mode');
      expect(seen[0]?.url).toBe('/api/v1/speech/transcriptions');
      expect(seen[0]?.type).toBe('application/octet-stream');
      expect([...(seen[0]?.body ?? [])]).toEqual([...WAV]);
    }),
  );

  it.live('sends a message as the owner’s', () =>
    Effect.gen(function* () {
      const { url, seen } = yield* serve((_, response) => {
        response.writeHead(204);
        response.end();
      });

      yield* withComms(url, (comms) => comms.send('dark mode'));

      expect(seen[0]?.url).toBe('/api/v1/brainstorm/messages');
      expect(JSON.parse(seen[0]?.body.toString() ?? '')).toEqual({ text: 'dark mode' });
    }),
  );

  it.live('tells that Pi is still answering', () =>
    Effect.gen(function* () {
      const { url } = yield* serve((_, response) => problem(response, 409, 'brainstorm-busy'));

      const error = yield* withComms(url, (comms) => comms.send('x')).pipe(Effect.flip);

      expect(error._tag).toBe('Busy');
    }),
  );

  it.live('tells what is not set up', () =>
    Effect.gen(function* () {
      const { url } = yield* serve((_, response) =>
        problem(response, 503, 'speech-not-set-up', { detail: 'Set COMMS_SPEECH_URL.' }),
      );

      const error = yield* withComms(url, (comms) => comms.transcribe(WAV)).pipe(Effect.flip);

      expect(error).toMatchObject({ _tag: 'NotSetUp', reason: 'Set COMMS_SPEECH_URL.' });
    }),
  );

  it.live('tells that comms refused the clip itself, with its reason', () =>
    Effect.gen(function* () {
      const { url } = yield* serve((_, response) =>
        problem(response, 422, 'invalid-request', {
          errors: [{ field: 'file', message: 'Only audio can be transcribed.' }],
        }),
      );

      const error = yield* withComms(url, (comms) => comms.transcribe(WAV)).pipe(Effect.flip);

      expect(error).toMatchObject({ _tag: 'Refused', reason: 'Only audio can be transcribed.' });
    }),
  );

  it.live('tells that comms refused a message itself', () =>
    Effect.gen(function* () {
      const { url } = yield* serve((_, response) =>
        problem(response, 422, 'invalid-request', {
          errors: [{ field: 'text', message: 'The message is too long.' }],
        }),
      );

      const error = yield* withComms(url, (comms) => comms.send('x')).pipe(Effect.flip);

      expect(error).toMatchObject({ _tag: 'Refused', reason: 'The message is too long.' });
    }),
  );

  it.live('tells that comms refused this machine’s login', () =>
    Effect.gen(function* () {
      const { url } = yield* serve((_, response) => problem(response, 403, 'forbidden'));

      const error = yield* withComms(url, (comms) => comms.send('x')).pipe(Effect.flip);

      expect(error._tag).toBe('NotSetUp');
    }),
  );

  it.live('tells that the speech service failed, worth another try', () =>
    Effect.gen(function* () {
      const { url } = yield* serve((_, response) =>
        problem(response, 503, 'speech-unavailable', { detail: 'It did not answer in time.' }),
      );

      const error = yield* withComms(url, (comms) => comms.transcribe(WAV)).pipe(Effect.flip);

      expect(error).toMatchObject({ _tag: 'Failed', reason: 'It did not answer in time.' });
    }),
  );

  it.live('tells that comms cannot be reached', () =>
    Effect.gen(function* () {
      const { url } = yield* serve(() => undefined);
      yield* Effect.promise(() => new Promise((resolve) => server?.close(resolve)));
      server = undefined;

      const error = yield* withComms(url, (comms) => comms.send('x')).pipe(Effect.flip);

      expect(error._tag).toBe('Unreachable');
    }),
  );

  it.live('says whether Pi is answering, and when the chat is not set up', () =>
    Effect.gen(function* () {
      let answer: unknown = {
        _tag: 'Ready',
        answering: true,
        seesPictures: false,
        pictures: [],
        voice: true,
        entries: [],
      };
      const { url } = yield* serve((_, response) => json(response, 200, answer));

      expect(yield* withComms(url, (comms) => comms.answering)).toBe(true);
      answer = { _tag: 'NotSetUp', reason: 'Set COMMS_BRAINSTORM_MODEL.' };
      const error = yield* withComms(url, (comms) => comms.answering).pipe(Effect.flip);
      expect(error).toMatchObject({ _tag: 'NotSetUp', reason: 'Set COMMS_BRAINSTORM_MODEL.' });
    }),
  );

  it.live('follows the chat’s events after a number, whatever chunks they come in', () =>
    Effect.gen(function* () {
      const events =
        'event: brainstorm\ndata: {"kind":"entry","sequence":4,"entry":{"kind":"said","id":"u1","at":1,"text":"dark mode","images":[]}}\n\n' +
        'event: brainstorm\ndata: {"kind":"delta","text":"Nice"}\n\n';
      const { url, seen } = yield* serve((_, response) => {
        response.writeHead(200, { 'content-type': 'text/event-stream' });
        // Split inside a line and inside the JSON.
        response.write(events.slice(0, 30));
        setTimeout(() => {
          response.write(events.slice(30, 120));
          setTimeout(() => response.end(events.slice(120)), 10);
        }, 10);
      });

      const received = yield* withComms(url, (comms) => Stream.runCollect(comms.events(3)));

      expect(seen[0]?.url).toBe('/api/v1/brainstorm/events?after=3');
      expect(received).toEqual([
        {
          kind: 'entry',
          sequence: 4,
          entry: { kind: 'said', id: 'u1', at: 1, text: 'dark mode', images: [] },
        },
        { kind: 'delta', text: 'Nice' },
      ]);
    }),
  );

  it.live('decides a proposal', () =>
    Effect.gen(function* () {
      const { url, seen } = yield* serve((_, response) => {
        response.writeHead(204);
        response.end();
      });

      yield* withComms(url, (comms) =>
        comms.decide('p1', {
          _tag: 'Create',
          draft: { project: 'pocket-home', title: 'Dark mode', body: 'A toggle.' },
        }),
      );

      expect(seen[0]?.url).toBe('/api/v1/brainstorm/proposals/p1/decision');
      expect(JSON.parse(seen[0]?.body.toString() ?? '')).toEqual({
        _tag: 'Create',
        draft: { project: 'pocket-home', title: 'Dark mode', body: 'A toggle.' },
      });
    }),
  );
});

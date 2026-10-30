import { describe, expect, it } from '@effect/vitest';
import { TranscriptOutbound, type TranscriptSource } from '@pocket-comms/comms-application';
import * as Effect from 'effect/Effect';
import * as Fiber from 'effect/Fiber';
import * as Option from 'effect/Option';
import * as Stream from 'effect/Stream';
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { claudeSessionPath } from './claude.js';
import { layerFiles } from './files.js';
import { piSessionFolder } from './pi.js';

const fixture = (name: string) =>
  readFileSync(new URL(`../testing/fixtures/${name}`, import.meta.url), 'utf8');

const claude: TranscriptSource = { ref: 'kirk', format: 'claude', session: 's1', cwd: '/work/app' };
const pi: TranscriptSource = { ref: 'spock', format: 'pi', session: 's2', cwd: '/work/app' };

/** A fresh home folder with a Claude and a Pi session of the fixtures. */
const home = () => {
  const root = mkdtempSync(join(tmpdir(), 'comms-transcripts-'));
  const claudeFile = claudeSessionPath(root, '/work/app', 's1');
  mkdirSync(join(claudeFile, '..'), { recursive: true });
  writeFileSync(claudeFile, fixture('claude-session.jsonl'));
  const piFolder = piSessionFolder(root, '/work/app');
  mkdirSync(piFolder, { recursive: true });
  const piFile = join(piFolder, '2026-10-30T20-15-54-629Z_s2.jsonl');
  writeFileSync(piFile, fixture('pi-session.jsonl'));
  return { root, claudeFile, piFile };
};

const line = (text: string, uuid: string) =>
  `${JSON.stringify({
    type: 'assistant',
    isSidechain: false,
    uuid,
    timestamp: '2026-10-30T15:18:00Z',
    message: { role: 'assistant', content: [{ type: 'text', text }] },
  })}\n`;

describe('Transcript.layerFiles', () => {
  it.effect('reads the entries and the modification time of a Claude session', () => {
    const { root, claudeFile } = home();
    utimesSync(claudeFile, new Date(5_000), new Date(5_000));
    return Effect.gen(function* () {
      const transcript = yield* TranscriptOutbound.use((port) => port.read(claude));

      expect(transcript.entries.map((entry) => entry.id)).toEqual([
        'u-1',
        'a-1:0',
        'toolu-edit',
        'toolu-bash',
        'toolu-read',
        'a-5:0',
        'toolu-build',
      ]);
      expect(transcript.modifiedAt).toBe(5_000);
    }).pipe(Effect.provide(layerFiles({ home: root })));
  });

  it.effect('reads a Pi session from its timestamped file', () => {
    const { root } = home();
    return Effect.gen(function* () {
      const transcript = yield* TranscriptOutbound.use((port) => port.read(pi));

      expect(transcript.entries[0]).toMatchObject({ type: 'user', text: 'Port the chat kit' });
    }).pipe(Effect.provide(layerFiles({ home: root })));
  });

  it.effect('finds a Claude session in another project folder', () => {
    const { root } = home();
    const moved: TranscriptSource = { ...claude, cwd: '/work/app/packages/web' };
    return Effect.gen(function* () {
      const transcript = yield* TranscriptOutbound.use((port) => port.read(moved));

      expect(transcript.entries).toHaveLength(7);
    }).pipe(Effect.provide(layerFiles({ home: root })));
  });

  it.effect('keeps only the latest entries', () => {
    const { root } = home();
    return Effect.gen(function* () {
      const transcript = yield* TranscriptOutbound.use((port) => port.read(claude));

      expect(transcript.entries.map((entry) => entry.id)).toEqual(['a-5:0', 'toolu-build']);
    }).pipe(Effect.provide(layerFiles({ home: root, maxEntries: 2 })));
  });

  it.effect('reports a missing session file', () => {
    const { root } = home();
    return Effect.gen(function* () {
      const error = yield* TranscriptOutbound.use((port) =>
        port.read({ ...claude, session: 'gone' }),
      ).pipe(Effect.flip);

      expect(error._tag).toBe('TranscriptUnavailableError');
      expect(
        yield* TranscriptOutbound.use((port) => port.modifiedAt({ ...claude, session: 'gone' })),
      ).toEqual(Option.none());
    }).pipe(Effect.provide(layerFiles({ home: root })));
  });

  it.live('follows the lines appended to the file, also when one arrives in pieces', () => {
    const { root, claudeFile } = home();
    return Effect.gen(function* () {
      const fiber = yield* TranscriptOutbound.use((port) =>
        Effect.succeed(port.follow(claude)),
      ).pipe(
        Effect.flatMap((stream) => stream.pipe(Stream.take(2), Stream.runCollect)),
        Effect.forkChild,
      );
      yield* Effect.sleep('60 millis');

      appendFileSync(claudeFile, line('First new reply', 'n-1'));
      yield* Effect.sleep('60 millis');
      const second = line('Second new reply', 'n-2');
      appendFileSync(claudeFile, second.slice(0, 20));
      yield* Effect.sleep('60 millis');
      appendFileSync(claudeFile, second.slice(20));
      const batches = yield* Fiber.join(fiber);

      expect(batches.map((batch) => batch.map((entry) => entry.id))).toEqual([
        ['n-1:0'],
        ['n-2:0'],
      ]);
    }).pipe(Effect.provide(layerFiles({ home: root, pollInterval: '20 millis' })));
  });

  it.live('reports the outcome of a tool call that started before the stream did', () => {
    const { root, claudeFile } = home();
    return Effect.gen(function* () {
      const fiber = yield* TranscriptOutbound.use((port) =>
        Effect.succeed(port.follow(claude)),
      ).pipe(
        Effect.flatMap((stream) => stream.pipe(Stream.take(1), Stream.runCollect)),
        Effect.forkChild,
      );
      yield* Effect.sleep('60 millis');

      appendFileSync(
        claudeFile,
        `${JSON.stringify({
          type: 'user',
          isSidechain: false,
          uuid: 'r',
          timestamp: '2026-10-30T15:18:00Z',
          message: {
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: 'toolu-build', content: 'ok' }],
          },
        })}\n`,
      );
      const [batch] = yield* Fiber.join(fiber);

      expect(batch).toEqual([expect.objectContaining({ id: 'toolu-build', outcome: 'ok' })]);
    }).pipe(Effect.provide(layerFiles({ home: root, pollInterval: '20 millis' })));
  });
});

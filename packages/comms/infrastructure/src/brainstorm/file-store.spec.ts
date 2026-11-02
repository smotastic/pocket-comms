import { describe, expect, it } from '@effect/vitest';
import { BrainstormStoreOutbound, type StoredChat } from '@pocket-comms/comms-application';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { layerFile } from './file-store.js';

const folder = () => join(mkdtempSync(join(tmpdir(), 'comms-state-')), 'state');

const chat: StoredChat = {
  id: 'chat-1',
  entries: [
    { type: 'user', id: 'u1', at: 1, text: 'Idea' },
    { type: 'assistant', id: 'a1', at: 2, text: '**Nice**' },
    {
      type: 'proposal',
      id: 'p1',
      at: 3,
      project: 'app',
      title: 'Dark mode',
      body: 'A toggle.',
      state: { _tag: 'created', number: 12, url: 'http://gitea.test/owner/app/issues/12' },
    },
    { type: 'failed', id: 'f1', at: 4, reason: 'The model cannot be reached.' },
  ],
  runtime: Option.some({ adapter: 'pi', state: { messages: [{ role: 'user' }] } }),
};

const store = (path: string) =>
  BrainstormStoreOutbound.pipe(Effect.provide(layerFile({ folder: path })));

describe('the brainstorm file store', () => {
  it.effect('loads nothing before the first save', () =>
    Effect.gen(function* () {
      expect(yield* (yield* store(folder())).load).toEqual(Option.none());
    }),
  );

  it.effect('loads what it saved, in a folder it creates, readable by the owner only', () =>
    Effect.gen(function* () {
      const path = folder();
      const outbound = yield* store(path);

      yield* outbound.save(chat);
      yield* outbound.save({ ...chat, runtime: Option.none() });

      expect(yield* (yield* store(path)).load).toEqual(
        Option.some({ ...chat, runtime: Option.none() }),
      );
      expect(statSync(join(path, 'brainstorm.json')).mode & 0o777).toBe(0o600);
    }),
  );

  it.effect('keeps an unreadable file as .bad and starts without a chat', () =>
    Effect.gen(function* () {
      const path = folder();
      const outbound = yield* store(path);
      yield* outbound.save(chat);
      writeFileSync(join(path, 'brainstorm.json'), '{"version":1,');

      expect(yield* outbound.load).toEqual(Option.none());
      expect(readFileSync(join(path, 'brainstorm.json.bad'), 'utf-8')).toBe('{"version":1,');
      expect(existsSync(join(path, 'brainstorm.json'))).toBe(false);
    }),
  );
});

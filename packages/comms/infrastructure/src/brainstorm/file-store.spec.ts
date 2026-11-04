import { describe, expect, it } from '@effect/vitest';
import { BrainstormStoreOutbound, type StoredChat } from '@pocket-comms/comms-application';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { layerFile } from './file-store.js';

const folder = () => join(mkdtempSync(join(tmpdir(), 'comms-state-')), 'state');

const PICTURE = 'a'.repeat(26);

const chat: StoredChat = {
  id: 'chat-1',
  entries: [
    { type: 'user', id: 'u1', at: 1, text: 'Idea', images: [PICTURE] },
    { type: 'assistant', id: 'a1', at: 2, text: '**Nice**' },
    {
      type: 'proposal',
      kind: 'issue',
      id: 'p1',
      at: 3,
      project: 'app',
      title: 'Dark mode',
      body: 'A toggle.',
      pictures: [PICTURE],
      attached: [{ image: PICTURE, url: 'http://gitea.test/attachments/u-1' }],
      state: { _tag: 'created', number: 12, url: 'http://gitea.test/owner/app/issues/12' },
    },
    {
      type: 'proposal',
      kind: 'issue',
      id: 'p2',
      at: 3,
      project: 'app',
      title: 'Blue door',
      body: 'Paint it.',
      pictures: [PICTURE],
      attached: [],
      state: { _tag: 'attaching', number: 13, url: 'http://gitea.test/owner/app/issues/13' },
    },
    { type: 'failed', id: 'f1', at: 4, reason: 'The model cannot be reached.' },
    {
      type: 'proposal',
      kind: 'edit',
      id: 'e1',
      at: 5,
      project: 'app',
      number: 11,
      url: 'http://gitea.test/owner/app/issues/11',
      title: 'Orchestrator',
      body: 'New.',
      base: { title: 'Orchestrator', body: 'Old.' },
      pictures: [],
      attached: [],
      state: { _tag: 'updated', url: 'http://gitea.test/owner/app/issues/11' },
    },
  ],
  reads: [
    {
      project: 'app',
      number: 11,
      url: 'http://gitea.test/owner/app/issues/11',
      title: 'Orchestrator',
      body: 'New.',
      cut: false,
    },
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

  it.effect('loads a chat saved before edits, with its proposals as new issues', () =>
    Effect.gen(function* () {
      const path = folder();
      const outbound = yield* store(path);
      yield* outbound.save(chat);
      writeFileSync(
        join(path, 'brainstorm.json'),
        JSON.stringify({
          version: 1,
          id: 'chat-0',
          entries: [
            {
              type: 'proposal',
              id: 'p1',
              at: 3,
              project: 'app',
              title: 'Dark mode',
              body: 'A toggle.',
              state: { _tag: 'open' },
            },
          ],
          runtime: null,
        }),
      );

      expect(yield* outbound.load).toEqual(
        Option.some({
          id: 'chat-0',
          entries: [
            {
              type: 'proposal',
              kind: 'issue',
              id: 'p1',
              at: 3,
              project: 'app',
              title: 'Dark mode',
              body: 'A toggle.',
              pictures: [],
              attached: [],
              state: { _tag: 'open' },
            },
          ],
          reads: [],
          runtime: Option.none(),
        }),
      );
    }),
  );

  it.effect('loads a chat saved before pictures, with no pictures anywhere', () =>
    Effect.gen(function* () {
      const path = folder();
      const outbound = yield* store(path);
      yield* outbound.save(chat);
      writeFileSync(
        join(path, 'brainstorm.json'),
        JSON.stringify({
          version: 2,
          id: 'chat-2',
          entries: [
            { type: 'user', id: 'u1', at: 1, text: 'Idea' },
            {
              type: 'proposal',
              kind: 'edit',
              id: 'e1',
              at: 2,
              project: 'app',
              number: 11,
              url: 'http://gitea.test/owner/app/issues/11',
              title: 'T',
              body: 'B',
              base: { title: 'T', body: 'A' },
              state: { _tag: 'open' },
            },
          ],
          reads: [],
          runtime: null,
        }),
      );

      const loaded = yield* outbound.load;
      expect(Option.map(loaded, (stored) => stored.entries)).toEqual(
        Option.some([
          { type: 'user', id: 'u1', at: 1, text: 'Idea', images: [] },
          expect.objectContaining({ kind: 'edit', pictures: [], attached: [] }),
        ]),
      );
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

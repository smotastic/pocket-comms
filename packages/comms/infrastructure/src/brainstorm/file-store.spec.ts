import { describe, expect, it } from '@effect/vitest';
import { BrainstormStoreOutbound, type StoredChat } from '@pocket-comms/comms-application';
import type { EditProposal, IssueProposal } from '@pocket-comms/comms-domain';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { layerFile } from './file-store.js';

const folder = () => join(mkdtempSync(join(tmpdir(), 'comms-state-')), 'state');

const PICTURE = 'a'.repeat(26);

const issue = (id: string, state: IssueProposal['state'], attached: IssueProposal['attached']) =>
  ({
    type: 'proposal',
    kind: 'issue',
    id,
    at: 3,
    project: 'app',
    title: 'Dark mode',
    body: 'A toggle.',
    pictures: [PICTURE],
    attached,
    state,
  }) satisfies IssueProposal;

const edit: EditProposal = {
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
};

const chat: StoredChat = {
  id: 'chat-1',
  log: [
    { sequence: 7, entry: { kind: 'chatStarted' } },
    { sequence: 8, entry: { kind: 'said', id: 'u1', at: 1, text: 'Idea', images: [PICTURE] } },
    {
      sequence: 9,
      entry: { kind: 'toolStarted', callId: 'c1', tool: 'read_issue', target: 'app #11' },
    },
    { sequence: 10, entry: { kind: 'toolFinished', callId: 'c1', isError: false } },
    { sequence: 11, entry: { kind: 'agentMessage', text: '**Nice**' } },
    { sequence: 12, entry: { kind: 'proposal', proposal: issue('p1', { _tag: 'open' }, []) } },
    {
      sequence: 13,
      entry: {
        kind: 'proposal',
        proposal: issue(
          'p1',
          { _tag: 'attaching', number: 13, url: 'http://gitea.test/owner/app/issues/13' },
          [{ image: PICTURE, url: 'http://gitea.test/attachments/u-1' }],
        ),
      },
    },
    { sequence: 14, entry: { kind: 'turnFailed', reason: 'The model cannot be reached.' } },
    { sequence: 15, entry: { kind: 'proposal', proposal: edit } },
    { sequence: 16, entry: { kind: 'turnEnded' } },
    { sequence: 17, entry: { kind: 'turnStopped' } },
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
          log: [
            {
              sequence: 1,
              entry: {
                kind: 'proposal',
                proposal: {
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
              },
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
      expect(Option.map(loaded, (stored) => stored.log)).toEqual(
        Option.some([
          { sequence: 1, entry: { kind: 'said', id: 'u1', at: 1, text: 'Idea', images: [] } },
          {
            sequence: 2,
            entry: {
              kind: 'proposal',
              proposal: expect.objectContaining({ kind: 'edit', pictures: [], attached: [] }),
            },
          },
        ]),
      );
    }),
  );

  it.effect('numbers the entries of a chat saved before the log from their position', () =>
    Effect.gen(function* () {
      const path = folder();
      const outbound = yield* store(path);
      yield* outbound.save(chat);
      writeFileSync(
        join(path, 'brainstorm.json'),
        JSON.stringify({
          version: 3,
          id: 'chat-3',
          entries: [
            { type: 'user', id: 'u1', at: 1, text: 'Idea', images: [PICTURE] },
            { type: 'assistant', id: 'a1', at: 2, text: 'Nice.' },
            { type: 'failed', id: 'f1', at: 3, reason: 'The model cannot be reached.' },
          ],
          reads: [],
          runtime: { adapter: 'pi', state: 1 },
        }),
      );

      expect(yield* outbound.load).toEqual(
        Option.some({
          id: 'chat-3',
          log: [
            {
              sequence: 1,
              entry: { kind: 'said', id: 'u1', at: 1, text: 'Idea', images: [PICTURE] },
            },
            { sequence: 2, entry: { kind: 'agentMessage', text: 'Nice.' } },
            { sequence: 3, entry: { kind: 'turnFailed', reason: 'The model cannot be reached.' } },
          ],
          reads: [],
          runtime: Option.some({ adapter: 'pi', state: 1 }),
        }),
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

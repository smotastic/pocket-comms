import { describe, expect, it } from '@effect/vitest';
import { ConversationOutbound, type ConversationSource } from '@pocket-comms/comms-application';
import * as Effect from 'effect/Effect';
import * as Fiber from 'effect/Fiber';
import * as Option from 'effect/Option';
import * as Stream from 'effect/Stream';
import { TestClock } from 'effect/testing';
import {
  appendFileSync,
  rmSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { STALE_SUBAGENT_MS } from '@pocket-comms/comms-domain';
import { claudeSessionPath } from './claude.js';
import { layerFiles } from './files.js';
import { piSessionFolder } from './pi.js';

const fixture = (name: string) =>
  readFileSync(new URL(`../testing/fixtures/${name}`, import.meta.url), 'utf8');

const claude: ConversationSource = {
  ref: 'kirk',
  format: 'claude',
  session: 's1',
  cwd: '/work/app',
};
const pi: ConversationSource = { ref: 'spock', format: 'pi', session: 's2', cwd: '/work/app' };

/** A fresh home folder with a Claude and a Pi session of the fixtures. */
const home = () => {
  const root = mkdtempSync(join(tmpdir(), 'comms-conversations-'));
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

describe('Conversation.layerFiles', () => {
  it.effect('reads the entries and the modification time of a Claude session', () => {
    const { root, claudeFile } = home();
    utimesSync(claudeFile, new Date(5_000), new Date(5_000));
    return Effect.gen(function* () {
      const conversation = yield* ConversationOutbound.use((port) => port.read(claude));

      expect(conversation.entries.map((entry) => entry.id)).toEqual([
        'u-1',
        'a-1:0',
        'toolu-edit',
        'toolu-bash',
        'toolu-read',
        'a-5:0',
        'toolu-build',
      ]);
      expect(conversation.modifiedAt).toBe(5_000);
    }).pipe(Effect.provide(layerFiles({ home: root })));
  });

  it.effect('reports the modification time in whole milliseconds', () => {
    const { root, claudeFile } = home();
    utimesSync(claudeFile, 5.0004567, 5.0004567);
    return Effect.gen(function* () {
      const conversation = yield* ConversationOutbound.use((port) => port.read(claude));
      const modified = yield* ConversationOutbound.use((port) => port.modifiedAt(claude));

      expect(conversation.modifiedAt).toBe(5_000);
      expect(modified).toEqual(Option.some(5_000));
    }).pipe(Effect.provide(layerFiles({ home: root })));
  });

  it.effect('reads a Pi session from its timestamped file', () => {
    const { root } = home();
    return Effect.gen(function* () {
      const conversation = yield* ConversationOutbound.use((port) => port.read(pi));

      expect(conversation.entries[0]).toMatchObject({ type: 'user', text: 'Port the chat kit' });
    }).pipe(Effect.provide(layerFiles({ home: root })));
  });

  it.effect('reads a Pi session that Herdr names by its file path', () => {
    const { root, piFile } = home();
    // Only the id in the file name counts; the path is never opened as it is.
    const named: ConversationSource = { ...pi, session: `/elsewhere/${piFile.split('/').pop()}` };
    return Effect.gen(function* () {
      const conversation = yield* ConversationOutbound.use((port) => port.read(named));

      expect(conversation.entries[0]).toMatchObject({ type: 'user', text: 'Port the chat kit' });
    }).pipe(Effect.provide(layerFiles({ home: root })));
  });

  it.effect('finds a Claude session in another planet folder', () => {
    const { root } = home();
    const moved: ConversationSource = { ...claude, cwd: '/work/app/packages/web' };
    return Effect.gen(function* () {
      const conversation = yield* ConversationOutbound.use((port) => port.read(moved));

      expect(conversation.entries).toHaveLength(7);
    }).pipe(Effect.provide(layerFiles({ home: root })));
  });

  it.effect('keeps only the latest entries', () => {
    const { root } = home();
    return Effect.gen(function* () {
      const conversation = yield* ConversationOutbound.use((port) => port.read(claude));

      expect(conversation.entries.map((entry) => entry.id)).toEqual(['a-5:0', 'toolu-build']);
    }).pipe(Effect.provide(layerFiles({ home: root, maxEntries: 2 })));
  });

  it.effect('reports a missing session file', () => {
    const { root } = home();
    return Effect.gen(function* () {
      const error = yield* ConversationOutbound.use((port) =>
        port.read({ ...claude, session: 'gone' }),
      ).pipe(Effect.flip);

      expect(error._tag).toBe('ConversationUnavailableError');
      expect(
        yield* ConversationOutbound.use((port) => port.modifiedAt({ ...claude, session: 'gone' })),
      ).toEqual(Option.none());
    }).pipe(Effect.provide(layerFiles({ home: root })));
  });

  it.live('waits for a session file that does not exist yet', () => {
    const { root } = home();
    const later: ConversationSource = { ...claude, session: 'later' };
    return Effect.gen(function* () {
      const fiber = yield* ConversationOutbound.use((port) =>
        port.follow(later).pipe(Stream.take(1), Stream.runCollect),
      ).pipe(Effect.forkChild);
      yield* Effect.sleep('60 millis');

      writeFileSync(claudeSessionPath(root, '/work/app', 'later'), line('Hello', 'h-1'));
      const [first] = yield* Fiber.join(fiber);

      expect(first?.map((entry) => entry.id)).toEqual(['h-1:0']);
    }).pipe(Effect.provide(layerFiles({ home: root, pollInterval: '20 millis' })));
  });

  it.live('starts with the latest entries', () => {
    const { root } = home();
    return Effect.gen(function* () {
      const [first] = yield* ConversationOutbound.use((port) =>
        port.follow(claude).pipe(Stream.take(1), Stream.runCollect),
      );

      expect(first?.map((entry) => entry.id)).toEqual(['a-5:0', 'toolu-build']);
    }).pipe(Effect.provide(layerFiles({ home: root, maxEntries: 2 })));
  });

  it.live('follows the lines appended to the file, also when one arrives in pieces', () => {
    const { root, claudeFile } = home();
    return Effect.gen(function* () {
      const fiber = yield* ConversationOutbound.use((port) =>
        Effect.succeed(port.follow(claude)),
      ).pipe(
        Effect.flatMap((stream) => stream.pipe(Stream.drop(1), Stream.take(2), Stream.runCollect)),
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
      const fiber = yield* ConversationOutbound.use((port) =>
        Effect.succeed(port.follow(claude)),
      ).pipe(
        Effect.flatMap((stream) => stream.pipe(Stream.drop(1), Stream.take(1), Stream.runCollect)),
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

describe('Conversation.layerFiles background', () => {
  // A session whose background work starts before the 300 latest entries.
  const backgroundHome = () => {
    const { root, claudeFile } = home();
    const lines = fixture('claude-background.jsonl').split('\n');
    // Up to the foreground subagent's call: a shell, a monitor and two subagents run.
    writeFileSync(claudeFile, `${lines.slice(0, 8).join('\n')}\n`);
    for (let index = 0; index < 400; index++)
      appendFileSync(claudeFile, line(`Step ${index}`, `x-${index}`));
    return { root, claudeFile, lines };
  };

  it.effect('finds work started before the latest entries a chat shows', () => {
    const { root } = backgroundHome();
    return Effect.gen(function* () {
      const items = yield* ConversationOutbound.use((port) => port.background(claude));

      expect(items.map((item) => item.id)).toEqual([
        'toolu-ci',
        'toolu-mon',
        'toolu-rev',
        'toolu-fg',
      ]);
    }).pipe(Effect.provide(layerFiles({ home: root, maxEntries: 300 })));
  });

  it.effect('reads only what was appended since the last call', () => {
    const { root, claudeFile, lines } = backgroundHome();
    return Effect.gen(function* () {
      const port = yield* ConversationOutbound;
      yield* port.background(claude);
      appendFileSync(claudeFile, `${lines.slice(8).join('\n')}\n`);

      const items = yield* port.background(claude);

      expect(items.map((item) => item.id)).toEqual(['toolu-rev']);
    }).pipe(Effect.provide(layerFiles({ home: root })));
  });

  it.effect('reads a replaced session file again from its start', () => {
    const { root, claudeFile, lines } = backgroundHome();
    return Effect.gen(function* () {
      const port = yield* ConversationOutbound;
      yield* port.background(claude);
      writeFileSync(claudeFile, `${lines.slice(0, 3).join('\n')}\n`);

      const items = yield* port.background(claude);

      expect(items.map((item) => item.id)).toEqual(['toolu-ci']);
    }).pipe(Effect.provide(layerFiles({ home: root })));
  });

  it.effect('gives the same answer to reads of one session at the same time', () => {
    const { root, claudeFile, lines } = backgroundHome();
    return Effect.gen(function* () {
      const port = yield* ConversationOutbound;
      appendFileSync(claudeFile, `${lines.slice(8).join('\n')}\n`);

      const answers = yield* Effect.all(
        Array.from({ length: 5 }, () => port.background(claude)),
        { concurrency: 'unbounded' },
      );

      for (const items of answers) expect(items.map((item) => item.id)).toEqual(['toolu-rev']);
    }).pipe(Effect.provide(layerFiles({ home: root })));
  });

  it.effect('names a running subagent by its meta file', () => {
    const { root, claudeFile } = backgroundHome();
    const folder = join(claudeFile.replace(/\.jsonl$/u, ''), 'subagents');
    mkdirSync(folder, { recursive: true });
    writeFileSync(
      join(folder, 'agent-afedcba9876543210.meta.json'),
      JSON.stringify({
        agentType: 'Explore',
        description: 'Find the config',
        toolUseId: 'toolu-fg',
      }),
    );
    writeFileSync(join(folder, 'agent-broken.meta.json'), '{ not json');
    return Effect.gen(function* () {
      const items = yield* ConversationOutbound.use((port) => port.background(claude));

      expect(items.find((item) => item.id === 'toolu-fg')?.subagent).toBe('afedcba9876543210');
    }).pipe(Effect.provide(layerFiles({ home: root })));
  });

  it.effect('shows a subagent without a meta file without its id', () => {
    const { root } = backgroundHome();
    return Effect.gen(function* () {
      const items = yield* ConversationOutbound.use((port) => port.background(claude));

      expect(items.find((item) => item.id === 'toolu-fg')?.subagent).toBeUndefined();
    }).pipe(Effect.provide(layerFiles({ home: root })));
  });

  describe('a subagent that waits on its own background work', () => {
    const WAITER = 'a3b5ae8dcea2d1b9b';
    const NOTICE_AT = Date.parse('2026-10-30T16:00:20.000Z');
    const json = (value: unknown) => `${JSON.stringify(value)}\n`;
    const entry = (uuid: string, type: string, content: unknown, extra = {}) =>
      json({
        type,
        uuid,
        timestamp: '2026-10-30T16:00:10.000Z',
        message: { role: type, content },
        ...extra,
      });
    // A session whose subagent stopped while its own work goes on, and that subagent's file.
    const waitingHome = (own: string, modifiedAt: number) => {
      const { root, claudeFile } = home();
      writeFileSync(
        claudeFile,
        [
          entry('a-1', 'assistant', [
            { type: 'tool_use', id: 'toolu-w', name: 'Agent', input: { description: 'Step 2' } },
          ]),
          entry('r-1', 'user', [{ type: 'tool_result', tool_use_id: 'toolu-w', content: 'ok' }], {
            toolUseResult: { isAsync: true, agentId: WAITER },
          }),
          json({
            type: 'user',
            uuid: 'n-1',
            timestamp: new Date(NOTICE_AT).toISOString(),
            origin: { kind: 'task-notification' },
            message: {
              role: 'user',
              content: `<task-notification>\n<task-id>${WAITER}</task-id>\n<status>completed</status>\n<summary>Agent "Step 2" is waiting on its own background work</summary>\n</task-notification>`,
            },
          }),
        ].join(''),
      );
      const folder = join(claudeFile.replace(/\.jsonl$/u, ''), 'subagents');
      mkdirSync(folder, { recursive: true });
      const file = join(folder, `agent-${WAITER}.jsonl`);
      writeFileSync(file, own);
      utimesSync(file, new Date(modifiedAt), new Date(modifiedAt));
      return root;
    };
    const sidechain = { isSidechain: true };
    const ownShell = [
      entry(
        's-1',
        'assistant',
        [
          {
            type: 'tool_use',
            id: 'toolu-ci',
            name: 'Bash',
            input: { command: 'wait-ci', description: 'Wait for CI', run_in_background: true },
          },
        ],
        sidechain,
      ),
      entry('s-2', 'user', [{ type: 'tool_result', tool_use_id: 'toolu-ci', content: 'bg' }], {
        ...sidechain,
        toolUseResult: { backgroundTaskId: 'bci' },
      }),
    ].join('');
    const idle = entry('s-1', 'assistant', [{ type: 'text', text: 'Waiting.' }], sidechain);
    const ids = (root: string, now = NOTICE_AT + 60_000) =>
      Effect.gen(function* () {
        yield* TestClock.setTime(now);
        const items = yield* ConversationOutbound.use((port) => port.background(claude));
        return items.map((item) => item.id);
      }).pipe(Effect.provide(layerFiles({ home: root })));

    it.effect('runs while its own file shows work running', () =>
      Effect.gen(function* () {
        expect(yield* ids(waitingHome(ownShell, NOTICE_AT - 1_000))).toEqual(['toolu-w']);
      }),
    );

    it.effect('runs once its file goes on after the notice', () =>
      Effect.gen(function* () {
        expect(yield* ids(waitingHome(idle, NOTICE_AT + 5_000))).toEqual(['toolu-w']);
      }),
    );

    it.effect('has ended when neither shows', () =>
      Effect.gen(function* () {
        expect(yield* ids(waitingHome(idle, NOTICE_AT - 1_000))).toEqual([]);
      }),
    );

    it.effect('has ended when its own work shows no new entry for too long', () =>
      Effect.gen(function* () {
        const root = waitingHome(ownShell, NOTICE_AT - 1_000);
        expect(yield* ids(root, NOTICE_AT + STALE_SUBAGENT_MS)).toEqual([]);
      }),
    );
  });

  describe('a subagent with no new entry for a long time', () => {
    const STALE = 'b4c6bf9edfb3e2cac';
    const STARTED_AT = Date.parse('2026-10-30T16:00:10.000Z');
    const json = (value: unknown) => `${JSON.stringify(value)}\n`;
    const entry = (uuid: string, type: string, content: unknown, extra = {}) =>
      json({
        type,
        uuid,
        timestamp: new Date(STARTED_AT).toISOString(),
        message: { role: type, content },
        ...extra,
      });
    // A session with a background subagent, and that subagent's own file when given.
    const staleHome = (modifiedAt?: number, named = true) => {
      const { root, claudeFile } = home();
      writeFileSync(
        claudeFile,
        [
          entry('a-1', 'assistant', [
            { type: 'tool_use', id: 'toolu-s', name: 'Agent', input: { description: 'Cut' } },
          ]),
          entry('r-1', 'user', [{ type: 'tool_result', tool_use_id: 'toolu-s', content: 'ok' }], {
            toolUseResult: { isAsync: true, ...(named ? { agentId: STALE } : {}) },
          }),
        ].join(''),
      );
      const folder = join(claudeFile.replace(/\.jsonl$/u, ''), 'subagents');
      mkdirSync(folder, { recursive: true });
      const file = join(folder, `agent-${STALE}.jsonl`);
      if (modifiedAt !== undefined) {
        writeFileSync(file, entry('s-1', 'assistant', [{ type: 'text', text: 'On it.' }]));
        utimesSync(file, new Date(modifiedAt), new Date(modifiedAt));
      }
      return { root, file };
    };
    const idsAt = (now: number) =>
      Effect.gen(function* () {
        yield* TestClock.setTime(now);
        const items = yield* ConversationOutbound.use((port) => port.background(claude));
        return items.map((item) => item.id);
      });
    const lastEntryAt = STARTED_AT + 60_000;

    it.effect('runs while its latest entry is recent', () => {
      const { root } = staleHome(lastEntryAt);
      return Effect.gen(function* () {
        expect(yield* idsAt(lastEntryAt + STALE_SUBAGENT_MS)).toEqual(['toolu-s']);
      }).pipe(Effect.provide(layerFiles({ home: root })));
    });

    it.effect('has ended once its latest entry is older than the limit', () => {
      const { root } = staleHome(lastEntryAt);
      return Effect.gen(function* () {
        expect(yield* idsAt(lastEntryAt + STALE_SUBAGENT_MS + 1)).toEqual([]);
      }).pipe(Effect.provide(layerFiles({ home: root })));
    });

    it.effect('has ended without a file of its own long after it started', () => {
      const { root } = staleHome();
      return Effect.gen(function* () {
        expect(yield* idsAt(STARTED_AT + STALE_SUBAGENT_MS + 1)).toEqual([]);
      }).pipe(Effect.provide(layerFiles({ home: root })));
    });

    it.effect('has ended without a known id long after it started', () => {
      const { root } = staleHome(undefined, false);
      return Effect.gen(function* () {
        expect(yield* idsAt(STARTED_AT + STALE_SUBAGENT_MS)).toEqual(['toolu-s']);
        expect(yield* idsAt(STARTED_AT + STALE_SUBAGENT_MS + 1)).toEqual([]);
      }).pipe(Effect.provide(layerFiles({ home: root })));
    });

    it.effect('runs again once a new entry arrives', () => {
      const { root, file } = staleHome(lastEntryAt);
      return Effect.gen(function* () {
        const later = lastEntryAt + STALE_SUBAGENT_MS + 60_000;
        expect(yield* idsAt(later)).toEqual([]);

        appendFileSync(file, entry('s-2', 'assistant', [{ type: 'text', text: 'Back.' }]));
        utimesSync(file, new Date(later), new Date(later));

        expect(yield* idsAt(later + 1_000)).toEqual(['toolu-s']);
      }).pipe(Effect.provide(layerFiles({ home: root })));
    });
  });

  it.effect('has no background work for a Pi session', () => {
    const { root } = home();
    return Effect.gen(function* () {
      expect(yield* ConversationOutbound.use((port) => port.background(pi))).toEqual([]);
    }).pipe(Effect.provide(layerFiles({ home: root })));
  });

  it.effect('fails for a session without a file', () => {
    const { root } = home();
    return Effect.gen(function* () {
      const error = yield* ConversationOutbound.use((port) =>
        port.background({ ...claude, session: 'missing' }),
      ).pipe(Effect.flip);

      expect(error._tag).toBe('ConversationUnavailableError');
    }).pipe(Effect.provide(layerFiles({ home: root })));
  });
});

describe('Conversation.layerFiles subagents', () => {
  // The session s1 with the subagent a0123456789abcdef: its conversation and its meta file.
  const subagentHome = () => {
    const { root, claudeFile } = home();
    const folder = join(claudeFile.replace(/\.jsonl$/u, ''), 'subagents');
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, 'agent-a0123456789abcdef.jsonl'), fixture('claude-subagent.jsonl'));
    writeFileSync(
      join(folder, 'agent-a0123456789abcdef.meta.json'),
      JSON.stringify({
        agentType: 'general-purpose',
        description: 'Review the diff',
        toolUseId: 'toolu-rev',
        requestShape: 'background',
      }),
    );
    return { root, folder };
  };
  const subagent = { ...claude, subagent: 'a0123456789abcdef' };

  it.effect("reads a subagent's own conversation", () => {
    const { root } = subagentHome();
    return Effect.gen(function* () {
      const conversation = yield* ConversationOutbound.use((port) => port.read(subagent));

      expect(conversation.entries.map((entry) => entry.type)).toEqual([
        'user',
        'tool',
        'assistant',
      ]);
    }).pipe(Effect.provide(layerFiles({ home: root })));
  });

  it.effect('reads what Claude records about a subagent', () => {
    const { root } = subagentHome();
    return Effect.gen(function* () {
      const meta = yield* ConversationOutbound.use((port) => port.subagentMeta(subagent));

      expect(meta).toEqual(
        Option.some({
          description: 'Review the diff',
          agentType: 'general-purpose',
          inBackground: true,
        }),
      );
    }).pipe(Effect.provide(layerFiles({ home: root })));
  });

  it.effect('has no record of a subagent without a meta file', () => {
    const { root } = subagentHome();
    return Effect.gen(function* () {
      const meta = yield* ConversationOutbound.use((port) =>
        port.subagentMeta({ ...claude, subagent: 'b2' }),
      );

      expect(meta).toEqual(Option.none());
    }).pipe(Effect.provide(layerFiles({ home: root })));
  });

  it.effect('finds no conversation for an id that is no subagent id', () => {
    const { root, folder } = subagentHome();
    writeFileSync(join(folder, '..', 'x.jsonl'), fixture('claude-subagent.jsonl'));
    return Effect.gen(function* () {
      const error = yield* ConversationOutbound.use((port) =>
        port.read({ ...claude, subagent: '../x' }),
      ).pipe(Effect.flip);
      const modified = yield* ConversationOutbound.use((port) =>
        port.modifiedAt({ ...claude, subagent: '../x' }),
      );

      const meta = yield* ConversationOutbound.use((port) =>
        port.subagentMeta({ ...claude, subagent: '../x' }),
      );

      expect(error._tag).toBe('ConversationUnavailableError');
      expect(modified).toEqual(Option.none());
      expect(meta).toEqual(Option.none());
    }).pipe(Effect.provide(layerFiles({ home: root })));
  });
});

describe('the waiting question from the Claude hook', () => {
  const questions = [
    {
      question: 'Pick a color?',
      header: 'Color',
      options: [{ label: 'Red', description: 'Warm' }, { label: 'Blue' }],
      multiSelect: false,
    },
  ];
  const hookFile = (folder: string, call = 'toolu-ask', session = 's1') => {
    mkdirSync(folder, { recursive: true });
    const path = join(folder, `${session}.json`);
    writeFileSync(path, JSON.stringify({ session, cwd: '/work/app', call, input: { questions } }));
    utimesSync(path, new Date(9_000), new Date(9_000));
    return path;
  };
  const asked = (id: string, uuid: string) =>
    `${JSON.stringify({
      type: 'assistant',
      isSidechain: false,
      uuid,
      timestamp: '2026-10-30T15:19:00Z',
      message: {
        role: 'assistant',
        content: [{ type: 'tool_use', id, name: 'AskUserQuestion', input: { questions } }],
      },
    })}\n`;
  const waiting = {
    type: 'tool',
    id: 'toolu-ask',
    at: 9_000,
    verb: 'Used',
    target: 'AskUserQuestion',
    questions: [
      {
        header: 'Color',
        text: 'Pick a color?',
        options: [{ label: 'Red', description: 'Warm' }, { label: 'Blue' }],
        multiple: false,
      },
    ],
    outcome: 'pending',
  };

  it.effect('ends the conversation with the call the session file does not hold yet', () => {
    const { root } = home();
    const questionsFolder = join(root, 'questions');
    hookFile(questionsFolder);
    return Effect.gen(function* () {
      const { entries } = yield* ConversationOutbound.use((port) => port.read(claude));

      expect(entries.at(-1)).toEqual(waiting);
      expect(entries.at(-2)?.id).toBe('toolu-build');
    }).pipe(Effect.provide(layerFiles({ home: root, questions: questionsFolder })));
  });

  it.effect("shows the session file's entry once it holds the call", () => {
    const { root, claudeFile } = home();
    const questionsFolder = join(root, 'questions');
    hookFile(questionsFolder);
    appendFileSync(claudeFile, asked('toolu-ask', 'q-1'));
    return Effect.gen(function* () {
      const { entries } = yield* ConversationOutbound.use((port) => port.read(claude));

      expect(entries.filter((entry) => entry.id === 'toolu-ask')).toHaveLength(1);
      expect(entries.at(-1)?.at).not.toBe(9_000);
    }).pipe(Effect.provide(layerFiles({ home: root, questions: questionsFolder })));
  });

  it.effect('ignores a file of another session, of a Pi agent, or without questions', () => {
    const { root } = home();
    const questionsFolder = join(root, 'questions');
    writeFileSync(
      hookFile(questionsFolder),
      JSON.stringify({ session: 'other', call: 'toolu-ask', input: { questions } }),
    );
    hookFile(questionsFolder, 'toolu-ask', 's2');
    return Effect.gen(function* () {
      const kirk = yield* ConversationOutbound.use((port) => port.read(claude));
      const spock = yield* ConversationOutbound.use((port) => port.read(pi));

      expect(kirk.entries.at(-1)?.id).toBe('toolu-build');
      expect(spock.entries.some((entry) => entry.id === 'toolu-ask')).toBe(false);
    }).pipe(Effect.provide(layerFiles({ home: root, questions: questionsFolder })));
  });

  it.live('follows the call once the hook writes it, and only once', () => {
    const { root } = home();
    const questionsFolder = join(root, 'questions');
    return Effect.gen(function* () {
      const fiber = yield* ConversationOutbound.use((port) =>
        port.follow(claude).pipe(Stream.take(2), Stream.runCollect),
      ).pipe(Effect.forkChild);
      yield* Effect.sleep('60 millis');

      hookFile(questionsFolder);
      const [, second] = yield* Fiber.join(fiber);

      expect(second).toEqual([waiting]);
    }).pipe(
      Effect.provide(
        layerFiles({ home: root, questions: questionsFolder, pollInterval: '20 millis' }),
      ),
    );
  });

  it.live('starts with the waiting call', () => {
    const { root } = home();
    const questionsFolder = join(root, 'questions');
    hookFile(questionsFolder);
    return Effect.gen(function* () {
      const [first] = yield* ConversationOutbound.use((port) =>
        port.follow(claude).pipe(Stream.take(1), Stream.runCollect),
      );

      expect(first?.map((entry) => entry.id)).toEqual(['toolu-build', 'toolu-ask']);
    }).pipe(Effect.provide(layerFiles({ home: root, maxEntries: 2, questions: questionsFolder })));
  });

  it.live("emits the session file's entry when the call is answered", () => {
    const { root, claudeFile } = home();
    const questionsFolder = join(root, 'questions');
    const path = hookFile(questionsFolder);
    return Effect.gen(function* () {
      const fiber = yield* ConversationOutbound.use((port) =>
        port.follow(claude).pipe(Stream.take(2), Stream.runCollect),
      ).pipe(Effect.forkChild);
      yield* Effect.sleep('60 millis');

      rmSync(path);
      appendFileSync(claudeFile, asked('toolu-ask', 'q-1'));
      const [, second] = yield* Fiber.join(fiber);

      expect(second?.map((entry) => [entry.id, entry.at])).toEqual([
        ['toolu-ask', Date.parse('2026-10-30T15:19:00Z')],
      ]);
    }).pipe(
      Effect.provide(
        layerFiles({ home: root, questions: questionsFolder, pollInterval: '20 millis' }),
      ),
    );
  });
});

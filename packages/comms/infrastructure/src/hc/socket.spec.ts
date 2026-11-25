import { describe, expect, it } from '@effect/vitest';
import { MultiplexerOutbound } from '@pocket-comms/comms-application';
import { OTHER_GROUP } from '@pocket-comms/comms-domain';
import * as Effect from 'effect/Effect';
import * as Fiber from 'effect/Fiber';
import * as Stream from 'effect/Stream';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gitEnvironment } from '../projects/git.js';
import { fakeHcServer, hcTerminal, type HcReply, type HcRequest } from '../testing/hc-server.js';
import { layerSocket } from './socket.js';

const git = (cwd: string, ...args: Array<string>) =>
  execFileSync('git', args, {
    cwd,
    env: {
      ...gitEnvironment(process.env),
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
    },
    stdio: 'pipe',
  }).toString();

// A project `app` with a linked worktree `feat-x` beside it, and a folder outside git.
const folders = () => {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'hc-folders-')));
  const app = join(base, 'app');
  mkdirSync(app);
  git(app, 'init', '--quiet', '--initial-branch=main');
  writeFileSync(join(app, 'README.md'), 'app\n');
  git(app, 'add', '.');
  git(app, 'commit', '--quiet', '-m', 'seed');
  const worktree = join(base, 'worktrees', 'app', 'feat-x');
  git(app, 'worktree', 'add', '--quiet', '-b', 'feat/x', worktree);
  const notes = join(base, 'notes');
  mkdirSync(notes);
  return { app, worktree, notes };
};

const listing =
  (terminals: ReadonlyArray<Record<string, unknown>>) =>
  (request: HcRequest): HcReply => {
    if (request.method === 'terminal.list') return { result: { terminals } };
    const address = request.params['terminal'];
    const found = terminals.find(
      (terminal) => terminal['address'] === address || terminal['name'] === address,
    );
    if (request.method === 'terminal.get') {
      return found === undefined
        ? { error: { kind: 'not_found', message: `no terminal "${String(address)}"` } }
        : { result: found };
    }
    if (request.method === 'terminal.read') {
      return { result: { complete: true, how: 'screen', text: 'the screen' } };
    }
    return { result: {} };
  };

const claudeStarted = hcTerminal({
  address: 't2',
  name: 'feat-x',
  created_ms: 20,
  labels: { 'comms.agent': 'claude', 'comms.session': 'sess-1' },
  foreground: { name: 'claude', cwd: '/work/app' },
  status: { app: 'claude-code', state: 'working' },
  title: '✳ Fix the login',
  turn: 3,
});
const piByHand = hcTerminal({
  address: 't3',
  created_ms: 30,
  foreground: { name: 'node', cwd: '/work/notes' },
  cwd: '/work/notes',
  status: { app: 'pi', state: 'error' },
  title: 'π - notes',
});
const shell = hcTerminal({ address: 't1', created_ms: 10 });
const make = hcTerminal({
  address: 't4',
  created_ms: 40,
  foreground: { name: 'make', cwd: '/work/app' },
  status: { app: 'make', state: 'working' },
});

const provide = (path: string) =>
  Effect.provide(layerSocket({ path, relistInterval: '20 millis' }));

describe('Hc.layerSocket', () => {
  it.live('names itself hc', () =>
    Effect.gen(function* () {
      const server = yield* fakeHcServer(listing([]));
      const multiplexer = yield* MultiplexerOutbound.use((hc) =>
        Effect.succeed(hc.multiplexer),
      ).pipe(provide(server.path));

      expect(multiplexer).toBe('hc');
    }).pipe(Effect.scoped),
  );

  it.live('lists the terminals the app started and those of Claude or Pi, nothing else', () =>
    Effect.gen(function* () {
      const server = yield* fakeHcServer(listing([shell, claudeStarted, piByHand, make]));
      const { agents } = yield* MultiplexerOutbound.use((hc) => hc.snapshot).pipe(
        provide(server.path),
      );

      expect(agents).toEqual([
        {
          paneId: 't2',
          name: 'feat-x',
          kind: 'claude',
          status: 'working',
          title: 'Fix the login',
          workspaceId: '/work/app',
          cwd: '/work/app',
          session: 'sess-1',
          completion: 3,
        },
        {
          paneId: 't3',
          name: undefined,
          kind: 'pi',
          status: 'blocked',
          title: 'π - notes',
          workspaceId: '/work/notes',
          cwd: '/work/notes',
          session: undefined,
          completion: 0,
        },
      ]);
    }).pipe(Effect.scoped),
  );

  it.live('reads an agent the app started that reports nothing yet as unknown', () =>
    Effect.gen(function* () {
      const quiet = hcTerminal({ address: 't5', labels: { 'comms.agent': 'claude' } });
      const server = yield* fakeHcServer(listing([quiet]));
      const { agents } = yield* MultiplexerOutbound.use((hc) => hc.snapshot).pipe(
        provide(server.path),
      );

      expect(agents.map((agent) => [agent.paneId, agent.kind, agent.status])).toEqual([
        ['t5', 'claude', 'unknown'],
      ]);
    }).pipe(Effect.scoped),
  );

  it.live('groups workspaces by their project through git, and others under Other', () =>
    Effect.gen(function* () {
      const { app, worktree, notes } = folders();
      const server = yield* fakeHcServer(
        listing([
          hcTerminal({
            address: 't1',
            created_ms: 5,
            cwd: worktree,
            labels: {
              'comms.agent': 'claude',
              'comms.workspace': worktree,
              'comms.label': 'Fix x',
            },
          }),
          hcTerminal({
            address: 't2',
            created_ms: 6,
            cwd: join(app, 'sub'),
            status: { app: 'claude-code', state: 'idle' },
          }),
          hcTerminal({
            address: 't3',
            created_ms: 7,
            cwd: notes,
            status: { app: 'pi', state: 'idle' },
          }),
        ]),
      );
      mkdirSync(join(app, 'sub'));

      const snapshot = yield* MultiplexerOutbound.use((hc) => hc.snapshot).pipe(
        provide(server.path),
      );

      const key = join(app, '.git');
      expect(snapshot.workspaces).toEqual([
        {
          id: worktree,
          label: 'Fix x',
          group: { key, name: 'app' },
          root: app,
          project: 'app',
          worktree: 'Fix x',
          checkout: worktree,
        },
        {
          id: app,
          label: 'app',
          group: { key, name: 'app' },
          root: app,
          project: 'app',
          checkout: app,
        },
        { id: notes, label: 'notes', group: OTHER_GROUP },
      ]);
      expect(snapshot.agents.map((agent) => [agent.paneId, agent.workspaceId])).toEqual([
        ['t1', worktree],
        ['t2', app],
        ['t3', notes],
      ]);
    }).pipe(Effect.scoped),
  );

  it.live('reads the screen as text, and an agent with whether it takes input', () =>
    Effect.gen(function* () {
      const blocked = hcTerminal({
        address: 't6',
        name: 'asks',
        status: { app: 'claude-code', state: 'blocked', kind: 'question' },
      });
      const idle = hcTerminal({ address: 't7', status: { app: 'claude-code', state: 'idle' } });
      const fresh = hcTerminal({ address: 't8', labels: { 'comms.agent': 'pi' } });
      const server = yield* fakeHcServer(listing([blocked, idle, fresh]));

      const [screen, asks, ready, starting] = yield* MultiplexerOutbound.use((hc) =>
        Effect.all([
          hc.readScreen('t7'),
          hc.readAgent('asks'),
          hc.readAgent('t7'),
          hc.readAgent('t8'),
        ]),
      ).pipe(provide(server.path));

      expect(screen).toBe('the screen');
      expect([asks, ready, starting]).toEqual([
        { status: 'blocked', ready: false },
        { status: 'idle', ready: true },
        { status: 'unknown', ready: false },
      ]);
      expect(server.requests.find((request) => request.method === 'terminal.read')?.params).toEqual(
        { terminal: 't7' },
      );
    }).pipe(Effect.scoped),
  );

  it.live("reports hc's refusal with its kind", () =>
    Effect.gen(function* () {
      const server = yield* fakeHcServer(listing([]));
      const error = yield* MultiplexerOutbound.use((hc) => hc.readAgent('t9')).pipe(
        provide(server.path),
        Effect.flip,
      );

      expect(error).toMatchObject({
        _tag: 'MultiplexerRejectedError',
        ref: 't9',
        code: 'not_found',
      });
    }).pipe(Effect.scoped),
  );

  it.live('is unavailable without a socket, and with a protocol generation it does not speak', () =>
    Effect.gen(function* () {
      const missing = yield* MultiplexerOutbound.use((hc) => hc.snapshot).pipe(
        provide(join(mkdtempSync(join(tmpdir(), 'no-hc-')), 'hc.sock')),
        Effect.flip,
      );
      const server = yield* fakeHcServer((request) =>
        request.method === 'terminal.list' ? { result: { terminals: [] } } : { result: {} },
      );
      server.requests.length = 0;
      const newer = yield* MultiplexerOutbound.use((hc) => hc.snapshot).pipe(
        Effect.provide(layerSocket({ path: server.path, generation: 2 })),
        Effect.flip,
      );

      expect(missing._tag).toBe('MultiplexerUnavailableError');
      expect(newer).toMatchObject({ _tag: 'MultiplexerUnavailableError' });
      expect(newer.reason).toContain('generation');
    }).pipe(Effect.scoped),
  );

  it.live('emits a change for each event, and keeps emitting while hc is away', () =>
    Effect.gen(function* () {
      const server = yield* fakeHcServer(listing([]));
      const layer = layerSocket({ path: server.path, relistInterval: '1 hour' });
      const fiber = yield* MultiplexerOutbound.use((hc) =>
        hc.changes.pipe(Stream.take(2), Stream.runCollect),
      ).pipe(Effect.provide(layer), Effect.forkChild);
      yield* Effect.sleep('100 millis');
      server.emit({ jsonrpc: '2.0', method: 'event', params: { type: 'status' } });
      server.emit({ jsonrpc: '2.0', method: 'event', params: { type: 'created' } });

      expect(yield* Fiber.join(fiber)).toHaveLength(2);

      const away = yield* MultiplexerOutbound.use((hc) =>
        hc.changes.pipe(Stream.take(3), Stream.runCollect),
      ).pipe(
        Effect.provide(
          layerSocket({
            path: join(mkdtempSync(join(tmpdir(), 'no-hc-')), 'hc.sock'),
            relistInterval: '20 millis',
          }),
        ),
      );
      expect(away).toHaveLength(3);
    }).pipe(Effect.scoped),
  );
});

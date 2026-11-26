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
import { gitEnvironment } from '../repositories/git.js';
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

// A planet `app` with a linked worktree `feat-x` beside it, and a folder outside git.
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
  foreground: { name: 'claude', cwd: '/work/app', argv: ['claude'] },
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
      const quiet = hcTerminal({
        address: 't5',
        labels: { 'comms.agent': 'claude' },
        foreground: { name: 'claude', cwd: '/work/app', argv: ['claude'] },
      });
      const server = yield* fakeHcServer(listing([quiet]));
      const { agents } = yield* MultiplexerOutbound.use((hc) => hc.snapshot).pipe(
        provide(server.path),
      );

      expect(agents.map((agent) => [agent.paneId, agent.kind, agent.status])).toEqual([
        ['t5', 'claude', 'unknown'],
      ]);
    }).pipe(Effect.scoped),
  );

  it.live('groups workspaces by their planet through git, and others under Other', () =>
    Effect.gen(function* () {
      const { app, worktree, notes } = folders();
      const server = yield* fakeHcServer(
        listing([
          hcTerminal({
            address: 't1',
            created_ms: 5,
            cwd: worktree,
            foreground: { name: 'claude', cwd: worktree, argv: ['claude'] },
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
          planet: 'app',
          worktree: 'Fix x',
          checkout: worktree,
        },
        {
          id: app,
          label: 'app',
          group: { key, name: 'app' },
          root: app,
          planet: 'app',
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

// A fake hc that runs every new terminal as `t9`, named and labelled as asked, in its `cwd`.
const acting =
  (terminals: ReadonlyArray<Record<string, unknown>>) =>
  (request: HcRequest): HcReply => {
    if (request.method === 'terminal.run') {
      return {
        result: hcTerminal({
          address: 't9',
          name: request.params['name'] ?? null,
          cwd: request.params['cwd'],
          labels: request.params['labels'] ?? {},
        }),
      };
    }
    if (request.method === 'terminal.kill' || request.method === 'terminal.rm') {
      return { result: { address: request.params['terminal'] } };
    }
    if (request.method === 'terminal.send') return { result: { sent: true } };
    return listing(terminals)(request);
  };

const calls = (requests: ReadonlyArray<HcRequest>) =>
  requests
    .filter((request) => request.method !== 'hello')
    .map((request) => [request.method, request.params]);

describe('Hc.layerSocket acting', () => {
  it.live('opens a worktree as a labelled shell, or finds the one already open', () =>
    Effect.gen(function* () {
      const open = hcTerminal({
        address: 't4',
        cwd: '/worktrees/app/fix-1',
        labels: { 'comms.workspace': '/worktrees/app/fix-1', 'comms.label': 'Fix 1' },
      });
      const server = yield* fakeHcServer(acting([open]));

      const [opened, again] = yield* MultiplexerOutbound.use((hc) =>
        Effect.all([
          hc.openWorktree({ cwd: '/work/app', path: '/worktrees/app/feat-x', label: 'Add x' }),
          hc.openWorktree({ cwd: '/work/app', path: '/worktrees/app/fix-1' }),
        ]),
      ).pipe(provide(server.path));

      expect(opened).toEqual({
        workspaceId: '/worktrees/app/feat-x',
        paneId: 't9',
        alreadyOpen: false,
      });
      expect(again).toEqual({
        workspaceId: '/worktrees/app/fix-1',
        paneId: 't4',
        alreadyOpen: true,
      });
      expect(calls(server.requests).filter(([method]) => method === 'terminal.run')).toEqual([
        [
          'terminal.run',
          {
            argv: [],
            cwd: '/worktrees/app/feat-x',
            labels: { 'comms.workspace': '/worktrees/app/feat-x', 'comms.label': 'Add x' },
            no_parent: true,
            no_notify: true,
          },
        ],
      ]);
    }).pipe(Effect.scoped),
  );

  it.live("opens a new shell in a workspace with the workspace's label", () =>
    Effect.gen(function* () {
      const open = hcTerminal({
        address: 't4',
        cwd: '/worktrees/app/fix-1',
        labels: { 'comms.workspace': '/worktrees/app/fix-1', 'comms.label': 'Fix 1' },
      });
      const server = yield* fakeHcServer(acting([open]));

      const shell = yield* MultiplexerOutbound.use((hc) =>
        hc.openShell('/worktrees/app/fix-1'),
      ).pipe(provide(server.path));

      expect(shell).toEqual({ workspaceId: '/worktrees/app/fix-1', paneId: 't9' });
      expect(calls(server.requests).find(([method]) => method === 'terminal.run')?.[1]).toEqual({
        argv: [],
        cwd: '/worktrees/app/fix-1',
        labels: { 'comms.workspace': '/worktrees/app/fix-1', 'comms.label': 'Fix 1' },
        no_parent: true,
        no_notify: true,
      });
    }).pipe(Effect.scoped),
  );

  it.live("starts the agent program itself in the shell's place, never through a shell", () =>
    Effect.gen(function* () {
      const shellOfTask = hcTerminal({
        address: 't4',
        cwd: '/worktrees/app/feat-x',
        labels: { 'comms.workspace': '/worktrees/app/feat-x', 'comms.label': 'Add x' },
      });
      const server = yield* fakeHcServer(acting([shellOfTask]));

      const started = yield* MultiplexerOutbound.use((hc) =>
        hc.startAgent({ paneId: 't4', name: 'feat-x', kind: 'claude' }),
      ).pipe(Effect.provide(layerSocket({ path: server.path, agentArgs: ['--model', 'opus'] })));

      expect(started).toEqual({ status: 'unknown', ready: false, paneId: 't9' });
      expect(calls(server.requests).filter(([method]) => method !== 'terminal.get')).toEqual([
        [
          'terminal.run',
          {
            argv: ['claude', '--model', 'opus'],
            cwd: '/worktrees/app/feat-x',
            name: 'feat-x',
            labels: {
              'comms.workspace': '/worktrees/app/feat-x',
              'comms.label': 'Add x',
              'comms.agent': 'claude',
            },
            keep: true,
            no_parent: true,
            no_notify: true,
          },
        ],
        ['terminal.kill', { terminal: 't4' }],
        ['terminal.rm', { terminal: 't4' }],
      ]);
    }).pipe(Effect.scoped),
  );

  it.live('sends a prompt without forcing it past a waiting agent', () =>
    Effect.gen(function* () {
      const server = yield* fakeHcServer(acting([]));
      yield* MultiplexerOutbound.use((hc) => hc.prompt('feat-x', 'Do it')).pipe(
        provide(server.path),
      );

      expect(calls(server.requests)).toEqual([
        ['terminal.send', { terminal: 'feat-x', text: 'Do it' }],
      ]);
    }).pipe(Effect.scoped),
  );

  it.live('closes a workspace by ending and removing each of its terminals', () =>
    Effect.gen(function* () {
      const inside = (address: string) =>
        hcTerminal({
          address,
          cwd: '/worktrees/app/feat-x',
          labels: { 'comms.workspace': '/worktrees/app/feat-x' },
        });
      const server = yield* fakeHcServer(
        acting([inside('t4'), inside('t5'), hcTerminal({ address: 't6' })]),
      );

      yield* MultiplexerOutbound.use((hc) => hc.closeWorkspace('/worktrees/app/feat-x')).pipe(
        provide(server.path),
      );

      expect(calls(server.requests).filter(([method]) => method !== 'terminal.list')).toEqual([
        ['terminal.kill', { terminal: 't4' }],
        ['terminal.rm', { terminal: 't4' }],
        ['terminal.kill', { terminal: 't5' }],
        ['terminal.rm', { terminal: 't5' }],
      ]);
    }).pipe(Effect.scoped),
  );

  it.live('never asks hc to focus, to run a shell line or to force a send', () =>
    Effect.gen(function* () {
      const shellOfTask = hcTerminal({ address: 't4', cwd: '/worktrees/app/feat-x' });
      const server = yield* fakeHcServer(acting([shellOfTask]));
      yield* MultiplexerOutbound.use((hc) =>
        Effect.all([
          hc.snapshot,
          hc.openWorktree({ cwd: '/work/app', path: '/worktrees/app/feat-x', label: 'x' }),
          hc.openShell('/worktrees/app/feat-x'),
          hc.startAgent({ paneId: 't4', name: 'feat-x', kind: 'pi' }),
          hc.prompt('feat-x', 'go'),
          hc.closeWorkspace('/worktrees/app/feat-x'),
        ]),
      ).pipe(provide(server.path));

      expect(server.requests.filter((request) => request.method.includes('focus'))).toEqual([]);
      expect(server.requests.filter((request) => 'line' in request.params)).toEqual([]);
      expect(server.requests.filter((request) => 'force' in request.params)).toEqual([]);
    }).pipe(Effect.scoped),
  );
});

describe('Hc.layerSocket raw input', () => {
  const agent = hcTerminal({ address: 't7', cols: 132, rows: 40 });

  it.live("types text through an attach stream at the terminal's own size, without Enter", () =>
    Effect.gen(function* () {
      const server = yield* fakeHcServer(listing([agent]));
      yield* MultiplexerOutbound.use((hc) => hc.typeText('t7', 'hello wörld')).pipe(
        provide(server.path),
      );

      expect(
        server.requests.find((request) => request.method === 'terminal.attach')?.params,
      ).toEqual({ terminal: 't7', cols: 132, rows: 40 });
      expect(server.frames.map((frame) => [frame.kind, frame.payload.toString('utf8')])).toEqual([
        [0, 'hello wörld'],
        [2, ''],
      ]);
    }).pipe(Effect.scoped),
  );

  it.live('presses each key as its own write, in order', () =>
    Effect.gen(function* () {
      const server = yield* fakeHcServer(listing([agent]));
      yield* MultiplexerOutbound.use((hc) =>
        hc.sendKeys('t7', [
          'down',
          '1',
          'right',
          'enter',
          'esc',
          'ctrl+c',
          'pageup',
          'pagedown',
          '4',
        ]),
      ).pipe(Effect.provide(layerSocket({ path: server.path, keyGap: '1 millis' })));

      expect(server.frames.map((frame) => [frame.kind, frame.payload.toString('utf8')])).toEqual([
        [0, '\u001b[B'],
        [0, '1'],
        [0, '\u001b[C'],
        [0, '\r'],
        [0, '\u001b'],
        [0, '\u0003'],
        [0, '\u001b[5~'],
        [0, '\u001b[6~'],
        [0, '4'],
        [2, ''],
      ]);
    }).pipe(Effect.scoped),
  );

  it.live('refuses input for a terminal hc does not have', () =>
    Effect.gen(function* () {
      const server = yield* fakeHcServer(listing([agent]));
      const error = yield* MultiplexerOutbound.use((hc) => hc.typeText('t9', 'x')).pipe(
        provide(server.path),
        Effect.flip,
      );

      expect(error).toMatchObject({
        _tag: 'MultiplexerRejectedError',
        ref: 't9',
        code: 'not_found',
      });
      expect(server.frames).toEqual([]);
    }).pipe(Effect.scoped),
  );
});

describe('Hc.layerSocket after review', () => {
  it.live('stops counting a started agent once a shell has taken its place', () =>
    Effect.gen(function* () {
      const replaced = hcTerminal({
        address: 't5',
        labels: { 'comms.agent': 'pi' },
        foreground: { name: 'zsh', cwd: '/work/app', argv: ['/bin/zsh', '-l'] },
      });
      const pi = hcTerminal({
        address: 't6',
        labels: { 'comms.agent': 'pi' },
        foreground: { name: 'node', cwd: '/work/app', argv: ['pi', ''] },
      });
      const server = yield* fakeHcServer(listing([replaced, pi]));
      const { agents } = yield* MultiplexerOutbound.use((hc) => hc.snapshot).pipe(
        provide(server.path),
      );

      expect(agents.map((agent) => [agent.paneId, agent.kind])).toEqual([['t6', 'pi']]);
    }).pipe(Effect.scoped),
  );

  it.live('takes a subscription that lists a terminal titled error as started', () =>
    Effect.gen(function* () {
      const server = yield* fakeHcServer(listing([]), {
        subscribed: {
          seq: 1,
          terminals: [hcTerminal({ title: 'error', status: { state: 'error' } })],
        },
      });
      const fiber = yield* MultiplexerOutbound.use((hc) =>
        hc.changes.pipe(Stream.take(2), Stream.runCollect),
      ).pipe(
        Effect.provide(layerSocket({ path: server.path, relistInterval: '1 hour' })),
        Effect.forkChild,
      );
      yield* Effect.sleep('100 millis');
      server.emit({ jsonrpc: '2.0', method: 'event', params: { type: 'status' } });

      // The first comes from the interval's start, the second only from the event.
      expect(yield* Fiber.join(fiber)).toHaveLength(2);
    }).pipe(Effect.scoped),
  );

  it.live('reports a started agent as started when its old shell does not end', () =>
    Effect.gen(function* () {
      const shellOfTask = hcTerminal({ address: 't4', cwd: '/worktrees/app/feat-x' });
      const server = yield* fakeHcServer((request) =>
        request.method === 'terminal.kill'
          ? { error: { kind: 'internal', message: 'could not signal' } }
          : acting([shellOfTask])(request),
      );

      const started = yield* MultiplexerOutbound.use((hc) =>
        hc.startAgent({ paneId: 't4', name: 'feat-x', kind: 'claude' }),
      ).pipe(provide(server.path));

      expect(started).toMatchObject({ paneId: 't9' });
    }).pipe(Effect.scoped),
  );

  it.live('fails raw input when hc drops the stream before the bytes arrive', () =>
    Effect.gen(function* () {
      const server = yield* fakeHcServer(listing([hcTerminal({ address: 't7' })]), {
        dropAttach: true,
      });
      const error = yield* MultiplexerOutbound.use((hc) => hc.typeText('t7', 'hello')).pipe(
        provide(server.path),
        Effect.flip,
      );

      expect(error._tag).toBe('MultiplexerUnavailableError');
    }).pipe(Effect.scoped),
  );

  it.live('asks git again about a folder it could not place before', () =>
    Effect.gen(function* () {
      const base = realpathSync(mkdtempSync(join(tmpdir(), 'hc-later-')));
      const later = join(base, 'later');
      mkdirSync(later);
      const server = yield* fakeHcServer(
        listing([hcTerminal({ address: 't1', cwd: later, status: { app: 'pi', state: 'idle' } })]),
      );
      const groupOf = MultiplexerOutbound.use((hc) => hc.snapshot).pipe(
        Effect.map((snapshot) => snapshot.workspaces[0]?.group.name),
      );

      const [before, after] = yield* Effect.gen(function* () {
        const first = yield* groupOf;
        git(later, 'init', '--quiet', '--initial-branch=main');
        return [first, yield* groupOf];
      }).pipe(provide(server.path));

      expect([before, after]).toEqual(['Other', 'later']);
    }).pipe(Effect.scoped),
  );
});

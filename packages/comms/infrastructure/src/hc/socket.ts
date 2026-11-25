import {
  MultiplexerOutbound,
  MultiplexerRejectedError,
  MultiplexerUnavailableError,
  type MultiplexerSnapshot,
  type StartedAgent,
} from '@pocket-comms/comms-application';
import {
  OTHER_GROUP,
  statusOf,
  type Agent,
  type AgentStatus,
  type Workspace,
} from '@pocket-comms/comms-domain';
import * as Cause from 'effect/Cause';
import * as Duration from 'effect/Duration';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import * as Queue from 'effect/Queue';
import * as Schema from 'effect/Schema';
import * as Stream from 'effect/Stream';
import { execFile } from 'node:child_process';
import { createConnection } from 'node:net';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { gitEnvironment } from '../projects/git.js';

// hc's API (protocol generation 1): JSON-RPC 2.0, one message per line on a Unix socket. Every
// request here opens its own connection and sends `hello` first, so a core that speaks another
// generation is never misread. `events.subscribe` keeps its connection open and streams one
// notification per line (ADR 0015, spec 033).

export interface SocketOptions {
  readonly path: string;
  /** How long a request may wait for its answer. Default 3 seconds. */
  readonly timeout?: Duration.Input;
  /** How often `changes` emits without an event, and waits before a new subscription. Default 2 s. */
  readonly relistInterval?: Duration.Input;
  /** Extra arguments for every agent the app starts (`COMMS_AGENT_ARGS`). Default none. */
  readonly agentArgs?: ReadonlyArray<string>;
  /** The pause between two keys of one `sendKeys`. Default 50 ms. */
  readonly keyGap?: Duration.Input;
  /** The protocol generation the adapter speaks. Default 1, hc 0.1's. */
  readonly generation?: number;
}

/** `$HC_SOCKET`, or `~/.local/state/herdr-core/default/default.sock`. */
export const defaultSocketPath = (env: Record<string, string | undefined>): string => {
  const configured = env['HC_SOCKET'];
  return configured !== undefined && configured !== ''
    ? configured
    : join(homedir(), '.local', 'state', 'herdr-core', 'default', 'default.sock');
};

/** The labels the app puts on the terminals it starts. */
export const LABELS = {
  /** The kind of agent the app started in the terminal. */
  agent: 'comms.agent',
  /** The workspace the terminal belongs to: the folder of its checkout. */
  workspace: 'comms.workspace',
  /** The workspace's label, such as the task's title. */
  label: 'comms.label',
  /** The agent's session id, set by the agent's own hook (spec 033, requirement 9). */
  session: 'comms.session',
} as const;

const orUndefined = <A>(value: A | null | undefined): A | undefined => value ?? undefined;
const optional = <S extends Schema.Top>(schema: S) => Schema.optional(Schema.NullOr(schema));

const StatusRecord = Schema.Struct({
  app: optional(Schema.String),
  state: Schema.String,
  kind: optional(Schema.String),
});
const TerminalRecord = Schema.Struct({
  address: Schema.String,
  name: optional(Schema.String),
  cwd: optional(Schema.String),
  created_ms: optional(Schema.Number),
  foreground: optional(
    Schema.Struct({ name: optional(Schema.String), cwd: optional(Schema.String) }),
  ),
  labels: optional(Schema.Record(Schema.String, Schema.String)),
  state: optional(Schema.String),
  status: optional(StatusRecord),
  title: optional(Schema.String),
  turn: optional(Schema.Number),
  cols: optional(Schema.Number),
  rows: optional(Schema.Number),
});
type TerminalRecord = typeof TerminalRecord.Type;
const TerminalList = Schema.Struct({ terminals: Schema.Array(TerminalRecord) });
const ScreenRead = Schema.Struct({ text: Schema.String });
const Hello = Schema.Struct({ generation: Schema.Number });

const Message = Schema.Struct({
  id: optional(Schema.Union([Schema.Number, Schema.String])),
  result: Schema.optional(Schema.Unknown),
  error: Schema.optional(
    Schema.Struct({
      code: Schema.Number,
      message: Schema.String,
      data: optional(Schema.Struct({ kind: optional(Schema.String) })),
    }),
  ),
});
const decodeMessage = Schema.decodeUnknownEffect(Schema.fromJsonString(Message));
const decodeLine = (line: string) =>
  Option.getOrUndefined(Schema.decodeUnknownOption(Schema.fromJsonString(Message))(line));
const decodeHello = Schema.decodeUnknownOption(Hello);

// The OSC 7501 apps whose terminals count as agents, and the kind the app calls each.
const AGENT_APPS: Record<string, string> = { 'claude-code': 'claude', pi: 'pi' };

// A title may start with the program's status glyph, such as Claude's `✳`.
const withoutGlyph = (title: string) => title.replace(/^[\p{S}\p{P}\s]+/u, '');

/** Where git places a folder: its checkout, the repository's common git folder and its root. */
interface GitPlace {
  readonly checkout: string;
  readonly key: string;
  readonly root: string;
}

export const layerSocket = ({
  path,
  timeout = '3 seconds',
  relistInterval = '2 seconds',
  agentArgs = [],
  generation = 1,
}: SocketOptions) => {
  const unavailable = (reason: string) => new MultiplexerUnavailableError({ reason });
  let nextId = 0;

  // Sends `hello` and one request on a fresh connection, and reads the request's answer.
  const exchange = (method: string, params: Record<string, unknown>) =>
    Effect.callback<string, MultiplexerUnavailableError>((resume) => {
      const id = ++nextId;
      const socket = createConnection(path);
      let buffer = '';
      let settled = false;
      const settle = (effect: Effect.Effect<string, MultiplexerUnavailableError>) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resume(effect);
      };
      socket.setEncoding('utf8');
      socket.on('connect', () => {
        socket.write(
          `${JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'hello', params: { generation } })}\n` +
            `${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`,
        );
      });
      socket.on('data', (chunk: string) => {
        buffer += chunk;
        let end = buffer.indexOf('\n');
        while (end >= 0) {
          const line = buffer.slice(0, end);
          buffer = buffer.slice(end + 1);
          end = buffer.indexOf('\n');
          // The hello answer comes first; a generation hc does not speak ends the exchange.
          const message = decodeLine(line);
          if (message?.id === 0) {
            const spoken = decodeHello(message.result);
            if (spoken._tag === 'None' || spoken.value.generation !== generation) {
              settle(
                Effect.fail(unavailable(`hc does not speak protocol generation ${generation}.`)),
              );
              return;
            }
            continue;
          }
          settle(Effect.succeed(line));
          return;
        }
      });
      socket.on('error', (error) => settle(Effect.fail(unavailable(error.message))));
      socket.on('close', () =>
        settle(Effect.fail(unavailable(`hc closed the socket without answering ${method}.`))),
      );
      return Effect.sync(() => {
        settled = true;
        socket.destroy();
      });
    }).pipe(
      Effect.timeoutOrElse({
        duration: timeout,
        orElse: () => Effect.fail(unavailable(`hc did not answer ${method} in time.`)),
      }),
    );

  /** One request; a JSON-RPC error becomes a `MultiplexerRejectedError` for `ref`, coded by kind. */
  const request = <A>(
    method: string,
    params: Record<string, unknown>,
    schema: Schema.Decoder<A>,
    ref: string,
  ): Effect.Effect<A, MultiplexerUnavailableError | MultiplexerRejectedError> =>
    Effect.gen(function* () {
      const line = yield* exchange(method, params);
      const answer = yield* decodeMessage(line).pipe(
        Effect.mapError(() => unavailable(`hc answered ${method} in an unknown shape.`)),
      );
      if (answer.error !== undefined) {
        return yield* new MultiplexerRejectedError({
          ref,
          code: answer.error.data?.kind ?? String(answer.error.code),
          message: answer.error.message,
        });
      }
      return yield* Schema.decodeUnknownEffect(schema)(answer.result).pipe(
        Effect.mapError(() => unavailable(`hc answered ${method} in an unknown shape.`)),
      );
    });

  // git's view of a folder, asked once per folder; a folder outside git has none.
  const places = new Map<string, GitPlace | undefined>();
  const placeOf = (folder: string) =>
    places.has(folder)
      ? Effect.succeed(places.get(folder))
      : Effect.callback<GitPlace | undefined>((resume) => {
          const child = execFile(
            'git',
            [
              '-C',
              folder,
              'rev-parse',
              '--path-format=absolute',
              '--show-toplevel',
              '--git-common-dir',
            ],
            { env: gitEnvironment(process.env), timeout: 5_000 },
            (error, stdout) => {
              const [checkout, key] = stdout.trim().split('\n');
              const place =
                error === null && checkout !== undefined && key !== undefined && key !== ''
                  ? { checkout, key, root: basename(key) === '.git' ? dirname(key) : key }
                  : undefined;
              places.set(folder, place);
              resume(Effect.succeed(place));
            },
          );
          return Effect.sync(() => void child.kill());
        });

  const isAgent = (terminal: TerminalRecord) =>
    terminal.labels?.[LABELS.agent] !== undefined ||
    AGENT_APPS[terminal.status?.app ?? ''] !== undefined;

  const kindOf = (terminal: TerminalRecord) =>
    AGENT_APPS[terminal.status?.app ?? ''] ??
    terminal.labels?.[LABELS.agent] ??
    orUndefined(terminal.foreground?.name);

  // A terminal's workspace: the one the app gave it, else its checkout, else its folder.
  const workspaceIdOf = (terminal: TerminalRecord) =>
    Effect.gen(function* () {
      const given = terminal.labels?.[LABELS.workspace];
      if (given !== undefined) return given;
      const folder = orUndefined(terminal.cwd) ?? '/';
      return (yield* placeOf(folder))?.checkout ?? folder;
    });

  const toAgent = (terminal: TerminalRecord, workspaceId: string): Agent => ({
    paneId: terminal.address,
    name: orUndefined(terminal.name),
    kind: kindOf(terminal),
    status: statusOf(orUndefined(terminal.status?.state)),
    title: withoutGlyph(terminal.title ?? ''),
    workspaceId,
    cwd: orUndefined(terminal.foreground?.cwd) ?? orUndefined(terminal.cwd),
    session: terminal.labels?.[LABELS.session],
    completion: terminal.turn ?? 0,
  });

  const toWorkspace = (id: string, label: string | undefined) =>
    Effect.gen(function* () {
      const place = yield* placeOf(id);
      const shown = label ?? basename(id);
      if (place === undefined) return { id, label: shown, group: OTHER_GROUP } satisfies Workspace;
      const project = basename(place.root);
      return {
        id,
        label: shown,
        group: { key: place.key, name: project },
        root: place.root,
        project,
        ...(place.checkout === place.root ? {} : { worktree: shown }),
        checkout: place.checkout,
      } satisfies Workspace;
    });

  const terminals = request('terminal.list', {}, TerminalList, '').pipe(
    Effect.catchTag('MultiplexerRejectedError', (error) =>
      Effect.fail(unavailable(`hc refused terminal.list: ${error.message}`)),
    ),
    Effect.map((list) =>
      [...list.terminals]
        .filter((terminal) => (terminal.state ?? 'live') === 'live')
        .sort((a, b) => (a.created_ms ?? 0) - (b.created_ms ?? 0)),
    ),
  );

  const snapshot: Effect.Effect<MultiplexerSnapshot, MultiplexerUnavailableError> = Effect.gen(
    function* () {
      const live = yield* terminals;
      const placed = yield* Effect.forEach(live, (terminal) =>
        Effect.map(workspaceIdOf(terminal), (workspaceId) => ({ terminal, workspaceId })),
      );
      const labels = new Map<string, string | undefined>();
      for (const { terminal, workspaceId } of placed) {
        const label = terminal.labels?.[LABELS.label];
        if (
          !labels.has(workspaceId) ||
          (labels.get(workspaceId) === undefined && label !== undefined)
        ) {
          labels.set(workspaceId, label);
        }
      }
      const workspaces = yield* Effect.forEach([...labels], ([id, label]) =>
        toWorkspace(id, label),
      );
      return {
        agents: placed
          .filter(({ terminal }) => isAgent(terminal))
          .map(({ terminal, workspaceId }) => toAgent(terminal, workspaceId)),
        workspaces,
      };
    },
  ).pipe(Effect.withSpan('Hc.snapshot'));

  const readAgent = (target: string) =>
    request('terminal.get', { terminal: target }, TerminalRecord, target).pipe(
      Effect.map((terminal): StartedAgent => {
        const status: AgentStatus = statusOf(orUndefined(terminal.status?.state));
        return { status, ready: status !== 'unknown' && status !== 'blocked' };
      }),
      Effect.withSpan('Hc.readAgent'),
    );

  // The notifications of one subscription, until hc closes it or answers with an error.
  const subscription = Stream.callback<void, MultiplexerUnavailableError>((queue) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const socket = createConnection(path);
        let buffer = '';
        let started = false;
        socket.setEncoding('utf8');
        socket.on('connect', () => {
          socket.write(
            `${JSON.stringify({ jsonrpc: '2.0', id: ++nextId, method: 'events.subscribe', params: {} })}\n`,
          );
        });
        socket.on('data', (chunk: string) => {
          buffer += chunk;
          let end = buffer.indexOf('\n');
          while (end >= 0) {
            const line = buffer.slice(0, end);
            buffer = buffer.slice(end + 1);
            end = buffer.indexOf('\n');
            if (!started) {
              started = true;
              if (line.includes('"error"')) {
                Queue.failCauseUnsafe(
                  queue,
                  Cause.fail(unavailable(`hc refused the subscription: ${line}`)),
                );
                return;
              }
              continue;
            }
            Queue.offerUnsafe(queue, undefined);
          }
        });
        socket.on('error', (error) =>
          Queue.failCauseUnsafe(queue, Cause.fail(unavailable(error.message))),
        );
        socket.on('close', () => Queue.endUnsafe(queue));
        return socket;
      }),
      (socket) => Effect.sync(() => socket.destroy()),
    ),
  );

  // When hc ends or refuses a subscription, or cannot be reached, the next try waits an interval.
  const pause = Stream.fromEffect(Effect.sleep(relistInterval)).pipe(Stream.drain);
  const events: Stream.Stream<void> = Stream.concat(subscription, pause).pipe(
    Stream.catchTag('MultiplexerUnavailableError', (error) =>
      Stream.concat(
        Stream.fromEffect(Effect.logDebug('hc events unavailable', { reason: error.reason })).pipe(
          Stream.drain,
        ),
        pause,
      ),
    ),
    Stream.forever,
  );

  const changes: Stream.Stream<void> = Stream.merge(Stream.tick(relistInterval), events);

  // The live terminals of a workspace, oldest first.
  const terminalsOf = (workspaceId: string) =>
    terminals.pipe(
      Effect.flatMap((live) =>
        Effect.filter(live, (terminal) =>
          Effect.map(workspaceIdOf(terminal), (id) => id === workspaceId),
        ),
      ),
    );

  // A login shell in `folder`, in no parent's care, labelled with its workspace.
  const runShell = (folder: string, label: string | undefined) =>
    request(
      'terminal.run',
      {
        argv: [],
        cwd: folder,
        labels: {
          [LABELS.workspace]: folder,
          ...(label === undefined ? {} : { [LABELS.label]: label }),
        },
        no_parent: true,
        no_notify: true,
      },
      TerminalRecord,
      folder,
    );

  const openWorktree = ({
    path: folder,
    label,
  }: {
    readonly path: string;
    readonly label?: string;
  }) =>
    Effect.gen(function* () {
      const [open] = yield* terminalsOf(folder);
      if (open !== undefined) {
        return { workspaceId: folder, paneId: open.address, alreadyOpen: true };
      }
      const shell = yield* runShell(folder, label);
      return { workspaceId: folder, paneId: shell.address, alreadyOpen: false };
    }).pipe(Effect.withSpan('Hc.openWorktree'));

  const openShell = (workspaceId: string) =>
    Effect.gen(function* () {
      const open = yield* terminalsOf(workspaceId);
      const label = open
        .map((terminal) => terminal.labels?.[LABELS.label])
        .find((each) => each !== undefined);
      const shell = yield* runShell(workspaceId, label);
      return { workspaceId, paneId: shell.address };
    }).pipe(Effect.withSpan('Hc.openShell'));

  // Ends a terminal and removes it from hc's list.
  const end = (address: string) =>
    Effect.andThen(
      request('terminal.kill', { terminal: address }, Schema.Unknown, address),
      request('terminal.rm', { terminal: address }, Schema.Unknown, address),
    );

  // The agent program runs itself, from an argument array, never typed into a shell. With `keep`
  // its terminal becomes a shell when the agent ends, as a Herdr pane does; the shell it replaces
  // ends.
  const startAgent = ({
    paneId,
    name,
    kind,
  }: {
    readonly paneId: string;
    readonly name: string;
    readonly kind: string;
  }) =>
    Effect.gen(function* () {
      const shell = yield* request('terminal.get', { terminal: paneId }, TerminalRecord, paneId);
      const workspace = shell.labels?.[LABELS.workspace];
      const label = shell.labels?.[LABELS.label];
      const agent = yield* request(
        'terminal.run',
        {
          argv: [kind, ...agentArgs],
          cwd: workspace ?? orUndefined(shell.cwd),
          name,
          labels: {
            ...(workspace === undefined ? {} : { [LABELS.workspace]: workspace }),
            ...(label === undefined ? {} : { [LABELS.label]: label }),
            [LABELS.agent]: kind,
          },
          keep: true,
          no_parent: true,
          no_notify: true,
        },
        TerminalRecord,
        name,
      );
      yield* end(paneId);
      const status: AgentStatus = statusOf(orUndefined(agent.status?.state));
      return {
        status,
        ready: status !== 'unknown' && status !== 'blocked',
        paneId: agent.address,
      };
    }).pipe(Effect.withSpan('Hc.startAgent'));

  // hc pastes the text and presses Enter once the program is quiet; it refuses a waiting
  // (`blocked`) program unless forced, and the app never forces.
  const prompt = (target: string, text: string) =>
    request('terminal.send', { terminal: target, text }, Schema.Unknown, target).pipe(
      Effect.asVoid,
      Effect.withSpan('Hc.prompt'),
    );

  const closeWorkspace = (workspaceId: string) =>
    terminalsOf(workspaceId).pipe(
      Effect.flatMap((open) =>
        Effect.forEach(open, (terminal) => end(terminal.address), { discard: true }),
      ),
      Effect.withSpan('Hc.closeWorkspace'),
    );

  // Raw input comes with task T06 of spec 033.
  const notYet = (ref: string) =>
    Effect.fail(
      new MultiplexerRejectedError({ ref, code: 'not_implemented', message: 'Not yet in hc.' }),
    );

  return Layer.succeed(
    MultiplexerOutbound,
    MultiplexerOutbound.of({
      multiplexer: 'hc',
      snapshot,
      readScreen: (target) =>
        request('terminal.read', { terminal: target }, ScreenRead, target).pipe(
          Effect.map((result) => result.text),
          Effect.withSpan('Hc.readScreen'),
        ),
      readAgent,
      prompt,
      typeText: (paneId) => notYet(paneId),
      sendKeys: (paneId) => notYet(paneId),
      openWorktree,
      openShell,
      closeWorkspace,
      startAgent,
      changes,
    }),
  );
};

import {
  HerdrOutbound,
  HerdrRejectedError,
  HerdrUnavailableError,
  type HerdrSnapshot,
} from '@pocket-comms/comms-application';
import { AgentStatus, ownGroup, type Agent, type Workspace } from '@pocket-comms/comms-domain';
import * as Cause from 'effect/Cause';
import type * as Duration from 'effect/Duration';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Queue from 'effect/Queue';
import * as Schema from 'effect/Schema';
import * as Stream from 'effect/Stream';
import { createConnection } from 'node:net';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Herdr's socket API (protocol 17): one newline-delimited JSON request per connection, answered
// by one line with `result` or `error`. `events.subscribe` keeps its connection open and streams
// one event per line.

export interface SocketOptions {
  readonly path: string;
  /** How long a request may wait for its answer. Default 3 seconds. */
  readonly timeout?: Duration.Input;
  /**
   * How often `changes` re-reads the agent list, as a fallback for missed events and to notice a
   * new pane set. Default 2 seconds.
   */
  readonly relistInterval?: Duration.Input;
}

/** `$HERDR_SOCKET_PATH`, or `~/.config/herdr/herdr.sock`. */
export const defaultSocketPath = (env: Record<string, string | undefined>): string => {
  const configured = env['HERDR_SOCKET_PATH'];
  return configured !== undefined && configured !== ''
    ? configured
    : join(homedir(), '.config', 'herdr', 'herdr.sock');
};

const optionalString = Schema.optional(Schema.NullOr(Schema.String));

const AgentRecord = Schema.Struct({
  pane_id: Schema.String,
  workspace_id: Schema.String,
  name: optionalString,
  agent: optionalString,
  agent_status: optionalString,
  terminal_title: optionalString,
  terminal_title_stripped: optionalString,
  cwd: optionalString,
  agent_session: Schema.optional(Schema.NullOr(Schema.Struct({ value: optionalString }))),
  completion_seq: Schema.optional(Schema.NullOr(Schema.Number)),
});

const WorkspaceRecord = Schema.Struct({
  workspace_id: Schema.String,
  label: optionalString,
  worktree: Schema.optional(
    Schema.NullOr(Schema.Struct({ repo_key: optionalString, repo_name: optionalString })),
  ),
});

const AgentList = Schema.Struct({ agents: Schema.Array(AgentRecord) });
const WorkspaceList = Schema.Struct({ workspaces: Schema.Array(WorkspaceRecord) });
const PaneRead = Schema.Struct({ read: Schema.Struct({ text: Schema.String }) });

const isStatus = Schema.is(AgentStatus);
const orUndefined = <A>(value: A | null | undefined): A | undefined => value ?? undefined;

const toAgent = (record: typeof AgentRecord.Type): Agent => ({
  paneId: record.pane_id,
  name: orUndefined(record.name),
  kind: orUndefined(record.agent),
  status: isStatus(record.agent_status) ? record.agent_status : 'unknown',
  title: record.terminal_title_stripped ?? record.terminal_title ?? '',
  workspaceId: record.workspace_id,
  cwd: orUndefined(record.cwd),
  session: orUndefined(record.agent_session?.value),
  completion: orUndefined(record.completion_seq),
});

const toWorkspace = (record: typeof WorkspaceRecord.Type): Workspace => {
  const label = record.label ?? record.workspace_id;
  const key = record.worktree?.repo_key;
  return {
    id: record.workspace_id,
    label,
    group:
      key === undefined || key === null
        ? ownGroup(record.workspace_id, label)
        : { key, name: record.worktree?.repo_name ?? label },
  };
};

// The event kinds after which the agent list or the workspace groups may differ. Status changes
// are subscribed per pane, because Herdr requires a `pane_id` for them.
const STRUCTURE_EVENTS = [
  'pane.created',
  'pane.closed',
  'pane.exited',
  'pane.moved',
  'pane.agent_detected',
  'workspace.created',
  'workspace.closed',
  'workspace.renamed',
  'workspace.reordered',
];

const Answer = Schema.Union([
  Schema.Struct({ result: Schema.Unknown }),
  Schema.Struct({ error: Schema.Struct({ code: Schema.String, message: Schema.String }) }),
]);
const decodeAnswer = Schema.decodeUnknownEffect(Schema.fromJsonString(Answer));

export const layerSocket = ({
  path,
  timeout = '3 seconds',
  relistInterval = '2 seconds',
}: SocketOptions) => {
  const unavailable = (reason: string) => new HerdrUnavailableError({ reason });
  let nextId = 0;

  // Sends one request and reads its one answer line.
  const exchange = (method: string, params: Record<string, unknown>) =>
    Effect.callback<string, HerdrUnavailableError>((resume) => {
      const socket = createConnection(path);
      let buffer = '';
      let settled = false;
      const settle = (effect: Effect.Effect<string, HerdrUnavailableError>) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resume(effect);
      };
      socket.setEncoding('utf8');
      socket.on('connect', () => {
        socket.write(`${JSON.stringify({ id: `comms-${++nextId}`, method, params })}\n`);
      });
      socket.on('data', (chunk: string) => {
        buffer += chunk;
        const end = buffer.indexOf('\n');
        if (end >= 0) settle(Effect.succeed(buffer.slice(0, end)));
      });
      socket.on('error', (error) => settle(Effect.fail(unavailable(error.message))));
      socket.on('close', () =>
        settle(Effect.fail(unavailable(`Herdr closed the socket without answering ${method}.`))),
      );
      return Effect.sync(() => {
        settled = true;
        socket.destroy();
      });
    }).pipe(
      Effect.timeoutOrElse({
        duration: timeout,
        orElse: () => Effect.fail(unavailable(`Herdr did not answer ${method} in time.`)),
      }),
    );

  /** One request; an `error` answer becomes a `HerdrRejectedError` for `ref`. */
  const request = <A>(
    method: string,
    params: Record<string, unknown>,
    schema: Schema.Decoder<A>,
    ref: string,
  ): Effect.Effect<A, HerdrUnavailableError | HerdrRejectedError> =>
    Effect.gen(function* () {
      const line = yield* exchange(method, params);
      const answer = yield* decodeAnswer(line).pipe(
        Effect.mapError(() => unavailable(`Herdr answered ${method} in an unknown shape.`)),
      );
      if ('error' in answer) {
        return yield* new HerdrRejectedError({ ref, ...answer.error });
      }
      return yield* Schema.decodeUnknownEffect(schema)(answer.result).pipe(
        Effect.mapError(() => unavailable(`Herdr answered ${method} in an unknown shape.`)),
      );
    });

  // A list request names no agent; Herdr refusing it means it cannot serve the app.
  const list = <A>(
    method: string,
    schema: Schema.Decoder<A>,
  ): Effect.Effect<A, HerdrUnavailableError> =>
    request(method, {}, schema, '').pipe(
      Effect.catchTag('HerdrRejectedError', (error) =>
        Effect.fail(unavailable(`Herdr refused ${method}: ${error.message}`)),
      ),
    );

  const snapshot: Effect.Effect<HerdrSnapshot, HerdrUnavailableError> = Effect.all([
    list('agent.list', AgentList),
    list('workspace.list', WorkspaceList),
  ]).pipe(
    Effect.map(([agents, workspaces]) => ({
      agents: agents.agents.map(toAgent),
      workspaces: workspaces.workspaces.map(toWorkspace),
    })),
    Effect.withSpan('Herdr.snapshot'),
  );

  const paneIds = list('agent.list', AgentList).pipe(
    Effect.map((result) =>
      result.agents
        .map((agent) => agent.pane_id)
        .sort()
        .join(' '),
    ),
  );

  // The events of one subscription, until Herdr closes it or answers with an error.
  const subscription = (panes: string) =>
    Stream.callback<void, HerdrUnavailableError>((queue) =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const socket = createConnection(path);
          const subscriptions = [
            ...STRUCTURE_EVENTS.map((type) => ({ type })),
            ...panes
              .split(' ')
              .filter((pane) => pane !== '')
              .map((pane) => ({ type: 'pane.agent_status_changed', pane_id: pane })),
          ];
          let buffer = '';
          let started = false;
          socket.setEncoding('utf8');
          socket.on('connect', () => {
            socket.write(
              `${JSON.stringify({ id: `comms-sub-${++nextId}`, method: 'events.subscribe', params: { subscriptions } })}\n`,
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
                    Cause.fail(unavailable(`Herdr refused the subscription: ${line}`)),
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

  // Waits until the pane set differs from `panes`, then ends; while Herdr is away it keeps waiting.
  const paneSetChanged = (panes: string) =>
    Effect.gen(function* () {
      while (true) {
        yield* Effect.sleep(relistInterval);
        const now = yield* paneIds.pipe(Effect.orElseSucceed(() => panes));
        if (now !== panes) return;
      }
    });

  // Subscribes with the current pane set, ends the subscription when the set changes, and starts
  // over; while Herdr is unreachable it waits one interval between attempts.
  // Subscribes with the current pane set and starts over when the set changes. When Herdr ends
  // or refuses a subscription, or cannot be reached, it waits one interval before the next try.
  const pause = Stream.fromEffect(Effect.sleep(relistInterval)).pipe(Stream.drain);
  const events: Stream.Stream<void> = Stream.unwrap(
    paneIds.pipe(
      Effect.map((panes) =>
        Stream.merge(
          Stream.concat(subscription(panes), pause),
          Stream.fromEffect(paneSetChanged(panes)).pipe(Stream.drain),
          { haltStrategy: 'either' },
        ),
      ),
    ),
  ).pipe(
    Stream.catchTag('HerdrUnavailableError', (error) =>
      Stream.concat(
        Stream.fromEffect(
          Effect.logDebug('Herdr events unavailable', { reason: error.reason }),
        ).pipe(Stream.drain),
        pause,
      ),
    ),
    Stream.forever,
  );

  const changes: Stream.Stream<void> = Stream.merge(Stream.tick(relistInterval), events);

  return Layer.succeed(
    HerdrOutbound,
    HerdrOutbound.of({
      snapshot,
      readScreen: (target) =>
        request(
          'agent.read',
          { target, source: 'visible', format: 'ansi', strip_ansi: false },
          PaneRead,
          target,
        ).pipe(
          Effect.map((result) => result.read.text),
          Effect.withSpan('Herdr.readScreen'),
        ),
      prompt: (target, text) =>
        request('agent.prompt', { target, text }, Schema.Unknown, target).pipe(
          Effect.asVoid,
          Effect.withSpan('Herdr.prompt'),
        ),
      sendKeys: (target, keys) =>
        request('agent.send_keys', { target, keys }, Schema.Unknown, target).pipe(
          Effect.asVoid,
          Effect.withSpan('Herdr.sendKeys'),
        ),
      changes,
    }),
  );
};

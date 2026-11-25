import {
  MultiplexerOutbound,
  MultiplexerRejectedError,
  MultiplexerUnavailableError,
  type MultiplexerSnapshot,
} from '@pocket-comms/comms-application';
import {
  AgentStatus,
  OTHER_GROUP,
  type Agent,
  pagedAwayAfter,
  whilePagedAway,
  type DialogKey,
  type Workspace,
} from '@pocket-comms/comms-domain';
import * as Cause from 'effect/Cause';
import * as Duration from 'effect/Duration';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Queue from 'effect/Queue';
import * as Schedule from 'effect/Schedule';
import * as Schema from 'effect/Schema';
import * as Stream from 'effect/Stream';
import { createConnection } from 'node:net';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Herdr's socket API (protocol 22): one newline-delimited JSON request per connection, answered
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
  /**
   * Extra arguments for every agent the app starts (`COMMS_AGENT_ARGS`). Default none: the agent
   * runs in its CLI's default permission mode.
   */
  readonly agentArgs?: ReadonlyArray<string>;
  /**
   * How long `startAgent` waits for a new pane's shell to reach its prompt. Default 10 seconds.
   */
  readonly shellWait?: Duration.Input;
  /**
   * The pause between two keys of one `sendKeys`. Claude's dialog reads keys that arrive together
   * as one input and ignores it, so each key goes alone. Default 50 ms.
   */
  readonly keyGap?: Duration.Input;
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
    Schema.NullOr(
      Schema.Struct({
        checkout_path: optionalString,
        is_linked_worktree: Schema.optional(Schema.NullOr(Schema.Boolean)),
        repo_key: optionalString,
        repo_name: optionalString,
        repo_root: optionalString,
      }),
    ),
  ),
});

// Herdr has no names for Page Up and Page Down, so they go to the pane as the terminal's own
// sequences; the other keys keep Herdr's names.
const PAGE_SEQUENCES: Partial<Record<DialogKey, string>> = {
  pageup: '\u001b[5~',
  pagedown: '\u001b[6~',
};

// One key as Herdr takes it: a page sequence as text, any other key by its name.
const keyRequest = (paneId: string, key: DialogKey) => {
  const sequence = PAGE_SEQUENCES[key];
  return sequence === undefined
    ? { method: 'agent.send_keys', params: { target: paneId, keys: [key] } }
    : { method: 'pane.send_text', params: { pane_id: paneId, text: sequence } };
};

const AgentList = Schema.Struct({ agents: Schema.Array(AgentRecord) });
const WorkspaceList = Schema.Struct({ workspaces: Schema.Array(WorkspaceRecord) });
const PaneRead = Schema.Struct({ read: Schema.Struct({ text: Schema.String }) });
const WorktreeOpened = Schema.Struct({
  workspace: Schema.Struct({ workspace_id: Schema.String }),
  root_pane: Schema.Struct({ pane_id: Schema.String }),
  already_open: Schema.optional(Schema.NullOr(Schema.Boolean)),
});
const TabCreated = Schema.Struct({ root_pane: Schema.Struct({ pane_id: Schema.String }) });
// `agent.start` and `agent.get` both answer with the agent's status and whether it takes input.
const AgentStarted = Schema.Struct({
  agent: Schema.Struct({
    agent_status: optionalString,
    interactive_ready: Schema.optional(Schema.NullOr(Schema.Boolean)),
  }),
});

const isStatus = Schema.is(AgentStatus);

const toStartedAgent = ({ agent }: typeof AgentStarted.Type) => ({
  status: isStatus(agent.agent_status) ? agent.agent_status : 'unknown',
  ready: agent.interactive_ready === true,
});

// Herdr refuses `agent.start` until the pane's shell sits at its prompt. A pane that
// `worktree.open` just spawned gets there only after the shell has read its startup files,
// which takes longer on a busy machine, so the start is tried again until then.
const SHELL_PAUSE = Duration.millis(250);
const isShellStarting = (error: MultiplexerUnavailableError | MultiplexerRejectedError): boolean =>
  error._tag === 'MultiplexerRejectedError' && error.message.includes('is not an available shell');
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

// A workspace's project is its repository; a workspace without one belongs to the Other group.
const toWorkspace = (record: typeof WorkspaceRecord.Type): Workspace => {
  const label = record.label ?? record.workspace_id;
  const key = record.worktree?.repo_key;
  const root = record.worktree?.repo_root;
  const checkout = record.worktree?.checkout_path;
  const base = {
    id: record.workspace_id,
    label,
    ...(root === undefined || root === null ? {} : { root }),
  };
  if (key === undefined || key === null) return { ...base, group: OTHER_GROUP };
  const project = record.worktree?.repo_name ?? label;
  return {
    ...base,
    group: { key, name: project },
    project,
    ...(record.worktree?.is_linked_worktree === true ? { worktree: label } : {}),
    ...(checkout === undefined || checkout === null ? {} : { checkout }),
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
  agentArgs = [],
  shellWait = '10 seconds',
  keyGap = '50 millis',
}: SocketOptions) => {
  const unavailable = (reason: string) => new MultiplexerUnavailableError({ reason });
  let nextId = 0;

  // Sends one request and reads its one answer line.
  const exchange = (
    method: string,
    params: Record<string, unknown>,
    wait: Duration.Input = timeout,
  ) =>
    Effect.callback<string, MultiplexerUnavailableError>((resume) => {
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
        duration: wait,
        orElse: () => Effect.fail(unavailable(`Herdr did not answer ${method} in time.`)),
      }),
    );

  /** One request; an `error` answer becomes a `MultiplexerRejectedError` for `ref`. */
  const request = <A>(
    method: string,
    params: Record<string, unknown>,
    schema: Schema.Decoder<A>,
    ref: string,
    wait?: Duration.Input,
  ): Effect.Effect<A, MultiplexerUnavailableError | MultiplexerRejectedError> =>
    Effect.gen(function* () {
      const line = yield* exchange(method, params, wait);
      const answer = yield* decodeAnswer(line).pipe(
        Effect.mapError(() => unavailable(`Herdr answered ${method} in an unknown shape.`)),
      );
      if ('error' in answer) {
        return yield* new MultiplexerRejectedError({ ref, ...answer.error });
      }
      return yield* Schema.decodeUnknownEffect(schema)(answer.result).pipe(
        Effect.mapError(() => unavailable(`Herdr answered ${method} in an unknown shape.`)),
      );
    });

  // A list request names no agent; Herdr refusing it means it cannot serve the app.
  const list = <A>(
    method: string,
    schema: Schema.Decoder<A>,
  ): Effect.Effect<A, MultiplexerUnavailableError> =>
    request(method, {}, schema, '').pipe(
      Effect.catchTag('MultiplexerRejectedError', (error) =>
        Effect.fail(unavailable(`Herdr refused ${method}: ${error.message}`)),
      ),
    );

  // The agents as last reported, and the waiting ones the owner paged away from their question,
  // as they were then, by pane id.
  let reported = new Map<string, Agent>();
  const pagedAway = new Map<string, Agent>();

  const reportAgents = (agents: ReadonlyArray<Agent>): ReadonlyArray<Agent> => {
    const shown = agents.map((agent) => {
      const waiting = pagedAway.get(agent.paneId);
      if (waiting === undefined) return agent;
      const paged = whilePagedAway(agent, waiting);
      if (!paged.pagedAway) pagedAway.delete(agent.paneId);
      return paged.agent;
    });
    reported = new Map(shown.map((agent) => [agent.paneId, agent]));
    for (const paneId of pagedAway.keys()) if (!reported.has(paneId)) pagedAway.delete(paneId);
    return shown;
  };

  const snapshot: Effect.Effect<MultiplexerSnapshot, MultiplexerUnavailableError> = Effect.all([
    list('agent.list', AgentList),
    list('workspace.list', WorkspaceList),
  ]).pipe(
    Effect.map(([agents, workspaces]) => ({
      agents: reportAgents(agents.agents.map(toAgent)),
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
    Stream.callback<void, MultiplexerUnavailableError>((queue) =>
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
    Stream.catchTag('MultiplexerUnavailableError', (error) =>
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
    MultiplexerOutbound,
    MultiplexerOutbound.of({
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
      // `agent.start` may answer before the agent takes input, and Herdr finishes the start only
      // on `agent.get`; `agent.list` never does (Herdr 0.9.5).
      readAgent: (target) =>
        request('agent.get', { target }, AgentStarted, target).pipe(
          Effect.map(toStartedAgent),
          Effect.withSpan('Herdr.readAgent'),
        ),
      // Text, like any key but paging, ends the paging away from a question. Herdr refuses a
      // prompt to an agent whose start it has not finished ("is not an active named agent"), so
      // the agent is read first; when that read fails, the prompt says why.
      prompt: (target, text) =>
        Effect.sync(() => pagedAway.delete(target)).pipe(
          Effect.andThen(
            request('agent.get', { target }, Schema.Unknown, target).pipe(Effect.ignore),
          ),
          Effect.andThen(request('agent.prompt', { target, text }, Schema.Unknown, target)),
          Effect.asVoid,
          Effect.withSpan('Herdr.prompt'),
        ),
      // `agent.prompt` refuses a blocked agent and always submits; `pane.send_text` types only.
      typeText: (paneId, text) =>
        Effect.sync(() => pagedAway.delete(paneId)).pipe(
          Effect.andThen(
            request('pane.send_text', { pane_id: paneId, text }, Schema.Unknown, paneId),
          ),
          Effect.asVoid,
          Effect.withSpan('Herdr.typeText'),
        ),
      sendKeys: (paneId, keys) =>
        Effect.sync(() => {
          const agent = reported.get(paneId);
          if (!pagedAwayAfter(keys, agent, pagedAway.has(paneId))) pagedAway.delete(paneId);
          else if (agent !== undefined && !pagedAway.has(paneId)) pagedAway.set(paneId, agent);
        }).pipe(
          Effect.andThen(
            Effect.forEach(
              keys,
              (key, index) => {
                const { method, params } = keyRequest(paneId, key);
                return (index === 0 ? Effect.void : Effect.sleep(keyGap)).pipe(
                  Effect.andThen(request(method, params, Schema.Unknown, paneId)),
                );
              },
              { discard: true },
            ),
          ),
          Effect.withSpan('Herdr.sendKeys'),
        ),
      // Opens a worktree git already has. `focus: false` is sent although it is Herdr's default,
      // so a changed default can never move the owner's focus (spec 005, requirement 11).
      // `trust_repository` is never sent.
      openWorktree: ({ cwd, path: checkout, label }) =>
        request(
          'worktree.open',
          { cwd, path: checkout, ...(label === undefined ? {} : { label }), focus: false },
          WorktreeOpened,
          checkout,
          '60 seconds',
        ).pipe(
          Effect.map((result) => ({
            workspaceId: result.workspace.workspace_id,
            paneId: result.root_pane.pane_id,
            alreadyOpen: result.already_open === true,
          })),
          Effect.withSpan('Herdr.openWorktree'),
        ),
      // A new tab's shell starts in the workspace's checkout.
      openShell: (workspaceId) =>
        request(
          'tab.create',
          { workspace_id: workspaceId, focus: false },
          TabCreated,
          workspaceId,
        ).pipe(
          Effect.map((result) => ({ workspaceId, paneId: result.root_pane.pane_id })),
          Effect.withSpan('Herdr.openShell'),
        ),
      // Closes the workspace and its panes; git removes the checkout (ADR 0015).
      closeWorkspace: (workspaceId) =>
        request('workspace.close', { workspace_id: workspaceId }, Schema.Unknown, workspaceId).pipe(
          Effect.asVoid,
          Effect.withSpan('Herdr.closeWorkspace'),
        ),
      // Herdr waits up to `timeout_ms` for the agent to take input; the request waits longer.
      startAgent: ({ paneId, name, kind }) =>
        request(
          'agent.start',
          { name, kind, pane_id: paneId, args: [...agentArgs], timeout_ms: 30_000 },
          AgentStarted,
          name,
          '40 seconds',
        ).pipe(
          Effect.retry({
            while: isShellStarting,
            schedule: Schedule.spaced(SHELL_PAUSE),
            times: Math.ceil(Duration.toMillis(shellWait) / Duration.toMillis(SHELL_PAUSE)),
          }),
          Effect.map(toStartedAgent),
          Effect.withSpan('Herdr.startAgent'),
        ),
      changes,
    }),
  );
};

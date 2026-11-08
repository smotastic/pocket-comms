import {
  HerdrOutbound,
  HerdrRejectedError,
  HerdrUnavailableError,
  type HerdrSnapshot,
} from '@pocket-comms/comms-application';
import {
  AgentStatus,
  OTHER_GROUP,
  type Agent,
  pagedAwayAfter,
  whilePagedAway,
  type AgentKey,
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
const PAGE_SEQUENCES: Partial<Record<AgentKey, string>> = {
  pageup: '\u001b[5~',
  pagedown: '\u001b[6~',
};

type KeyRun = { readonly text: string } | { readonly keys: ReadonlyArray<AgentKey> };

/** Splits `keys` into runs of named keys and runs of page sequences, in their order. */
const keyRuns = (keys: ReadonlyArray<AgentKey>): ReadonlyArray<KeyRun> =>
  keys.reduce<Array<KeyRun>>((runs, key) => {
    const sequence = PAGE_SEQUENCES[key];
    const last = runs.at(-1);
    if (sequence === undefined) {
      if (last !== undefined && 'keys' in last)
        runs[runs.length - 1] = { keys: [...last.keys, key] };
      else runs.push({ keys: [key] });
    } else if (last !== undefined && 'text' in last) {
      runs[runs.length - 1] = { text: last.text + sequence };
    } else runs.push({ text: sequence });
    return runs;
  }, []);

const AgentList = Schema.Struct({ agents: Schema.Array(AgentRecord) });
const WorkspaceList = Schema.Struct({ workspaces: Schema.Array(WorkspaceRecord) });
const PaneRead = Schema.Struct({ read: Schema.Struct({ text: Schema.String }) });
const WorktreeCreated = Schema.Struct({
  workspace: Schema.Struct({ workspace_id: Schema.String }),
  root_pane: Schema.Struct({ pane_id: Schema.String }),
  worktree: Schema.Struct({ path: Schema.String, branch: optionalString }),
});
const AgentStarted = Schema.Struct({
  agent: Schema.Struct({
    agent_status: optionalString,
    interactive_ready: Schema.optional(Schema.NullOr(Schema.Boolean)),
  }),
});

const isStatus = Schema.is(AgentStatus);

// Herdr refuses `agent.start` until the pane's shell sits at its prompt. A pane that
// `worktree.create` just spawned gets there only after the shell has read its startup files,
// which takes longer on a busy machine, so the start is tried again until then.
const SHELL_PAUSE = Duration.millis(250);
const isShellStarting = (error: HerdrUnavailableError | HerdrRejectedError): boolean =>
  error._tag === 'HerdrRejectedError' && error.message.includes('is not an available shell');
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
}: SocketOptions) => {
  const unavailable = (reason: string) => new HerdrUnavailableError({ reason });
  let nextId = 0;

  // Sends one request and reads its one answer line.
  const exchange = (
    method: string,
    params: Record<string, unknown>,
    wait: Duration.Input = timeout,
  ) =>
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
        duration: wait,
        orElse: () => Effect.fail(unavailable(`Herdr did not answer ${method} in time.`)),
      }),
    );

  /** One request; an `error` answer becomes a `HerdrRejectedError` for `ref`. */
  const request = <A>(
    method: string,
    params: Record<string, unknown>,
    schema: Schema.Decoder<A>,
    ref: string,
    wait?: Duration.Input,
  ): Effect.Effect<A, HerdrUnavailableError | HerdrRejectedError> =>
    Effect.gen(function* () {
      const line = yield* exchange(method, params, wait);
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

  const snapshot: Effect.Effect<HerdrSnapshot, HerdrUnavailableError> = Effect.all([
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
      // Text, like any key but paging, ends the paging away from a question.
      prompt: (target, text) =>
        Effect.sync(() => pagedAway.delete(target)).pipe(
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
              keyRuns(keys),
              (run) =>
                'text' in run
                  ? request(
                      'pane.send_text',
                      { pane_id: paneId, text: run.text },
                      Schema.Unknown,
                      paneId,
                    )
                  : request(
                      'agent.send_keys',
                      { target: paneId, keys: run.keys },
                      Schema.Unknown,
                      paneId,
                    ),
              { discard: true },
            ),
          ),
          Effect.withSpan('Herdr.sendKeys'),
        ),
      // `focus: false` is sent although it is Herdr's default, so a changed default can never
      // move the owner's focus (spec 005, requirement 11). `trust_repository` is never sent.
      createWorktree: ({ cwd, branch, base, label }) =>
        request(
          'worktree.create',
          { cwd, branch, base, label, focus: false },
          WorktreeCreated,
          branch,
          '60 seconds',
        ).pipe(
          Effect.map((result) => ({
            workspaceId: result.workspace.workspace_id,
            paneId: result.root_pane.pane_id,
            path: result.worktree.path,
            branch: result.worktree.branch ?? branch,
          })),
          Effect.withSpan('Herdr.createWorktree'),
        ),
      // Herdr removes the checkout folder and closes the workspace; the branch stays.
      // `trust_repository` is never sent: the owner decides
      // whether a repository is trusted, never the app.
      removeWorktree: ({ workspaceId, force }) =>
        request(
          'worktree.remove',
          { workspace_id: workspaceId, force },
          Schema.Unknown,
          workspaceId,
          '60 seconds',
        ).pipe(Effect.asVoid, Effect.withSpan('Herdr.removeWorktree')),
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
          Effect.map(({ agent }) => ({
            status: isStatus(agent.agent_status) ? agent.agent_status : 'unknown',
            ready: agent.interactive_ready === true,
          })),
          Effect.withSpan('Herdr.startAgent'),
        ),
      changes,
    }),
  );
};

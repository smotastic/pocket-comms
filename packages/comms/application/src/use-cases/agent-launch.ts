import {
  agentNameFor,
  deliveryOf,
  type AgentToStart,
  type PromptOutcome,
  type TaskStart,
} from '@pocket-comms/comms-domain';
import * as Clock from 'effect/Clock';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import * as Result from 'effect/Result';
import type { TaskAgentDto } from '../dto/task.dto.js';
import type { HerdrRejectedError, HerdrUnavailableError } from '../errors.js';
import { HerdrOutbound, type StartedAgent } from '../ports/herdr.outbound.port.js';
import { TaskStartsOutbound } from '../ports/task-starts.outbound.port.js';

// Starts an agent in a shell pane and sends it its first prompt (spec 005), keeping the task
// start at each step until the agent has the prompt (spec 032). New tasks and agents started in
// an existing worktree share it, so both follow the same rules.

const messageOf = (error: HerdrUnavailableError | HerdrRejectedError): string =>
  error._tag === 'HerdrRejectedError' ? error.message : error.reason;

// Herdr may report a just-started agent before it has detected its status. The launch asks
// again this often, this many times, before it gives up on sending the prompt.
const SETTLE_PAUSE = '500 millis';
const SETTLE_TRIES = 20;

const NOTES = {
  blocked:
    'The agent waits for an answer, so the task was not sent. Answer it, then send the task.',
  unsettled:
    'The agent did not report itself ready in time, so the task was not sent. Send it from the conversation.',
} as const;

/** The task start a launch keeps, without what the launch decides. */
export type StartBase = Pick<TaskStart, 'folder' | 'project' | 'branch' | 'issue'>;

/** A refused prompt did not arrive; one Herdr did not answer may have. */
export const promptOutcome = (
  result: Result.Result<void, HerdrUnavailableError | HerdrRejectedError>,
): PromptOutcome => {
  if (Result.isSuccess(result)) return { _tag: 'Accepted' };
  const reason = `The task was not sent: ${messageOf(result.failure)}`;
  return result.failure._tag === 'HerdrRejectedError'
    ? { _tag: 'Refused', reason }
    : { _tag: 'Unanswered', reason: `The task may not have arrived: ${result.failure.reason}` };
};

export const makeAgentLaunch = Effect.gen(function* () {
  const herdrOutbound = yield* HerdrOutbound;
  const starts = yield* TaskStartsOutbound;

  // The start is kept for the owner; a file that cannot be written never fails the launch.
  const keep = Effect.fnUntraced(function* (start: Omit<TaskStart, 'at'>) {
    const at = yield* Clock.currentTimeMillis;
    const change =
      start.delivery === 'delivered' ? starts.forget(start.folder) : starts.put({ ...start, at });
    yield* change.pipe(
      Effect.catch((error) =>
        Effect.logWarning('Task start not kept').pipe(
          Effect.annotateLogs({ folder: start.folder, reason: error.reason }),
        ),
      ),
    );
  });

  // The status that decides whether the prompt is sent: `idle` once the agent is idle and takes
  // input, `blocked`, or `unsettled` when Herdr reports neither within the settle time. Herdr
  // may report a just-started agent idle before it takes input, and finishes its start only
  // when the agent is read (`readAgent`); a prompt before then is refused.
  const settledStatus = Effect.fnUntraced(function* (paneId: string, started: StartedAgent) {
    if (started.status === 'blocked') return 'blocked' as const;
    if (started.status === 'idle' && started.ready) return 'idle' as const;
    for (let attempt = 0; attempt < SETTLE_TRIES; attempt += 1) {
      yield* Effect.sleep(SETTLE_PAUSE);
      const agent = yield* herdrOutbound.readAgent(paneId).pipe(Effect.option);
      if (Option.isNone(agent)) continue;
      if (agent.value.status === 'blocked') return 'blocked' as const;
      if (agent.value.status === 'idle' && agent.value.ready) return 'idle' as const;
    }
    return 'unsettled' as const;
  });

  /** Sends `prompt` to the agent in `paneId` and keeps where it is. */
  const deliver = Effect.fnUntraced(function* (start: Omit<TaskStart, 'at'>, paneId: string) {
    const result = yield* herdrOutbound.prompt(paneId, start.prompt).pipe(Effect.result);
    const outcome = promptOutcome(result);
    yield* keep({ ...start, ...deliveryOf(outcome) });
    return outcome;
  });

  /**
   * Starts an agent of `kind` in the shell of `paneId`, and sends `prompt` only to an agent that
   * is idle and ready: any other agent may show a dialog, and the app never answers one for the
   * owner.
   */
  const launch = Effect.fnUntraced(function* (
    base: StartBase,
    paneId: string,
    kind: AgentToStart,
    prompt: string,
  ) {
    yield* keep({
      ...base,
      kind,
      prompt,
      agent: undefined,
      delivery: 'pending',
      reason: undefined,
    });
    const snapshot = yield* herdrOutbound.snapshot.pipe(Effect.option);
    const taken = new Set(
      Option.isSome(snapshot)
        ? snapshot.value.agents.flatMap((agent) => (agent.name === undefined ? [] : [agent.name]))
        : [],
    );
    const ref = agentNameFor(base.branch, taken);
    const start = { ...base, kind, prompt, agent: ref, reason: undefined };
    const started = yield* herdrOutbound
      .startAgent({ paneId, name: ref, kind })
      .pipe(Effect.result);
    if (Result.isFailure(started)) {
      const note = `The agent did not start: ${messageOf(started.failure)}`;
      yield* keep({ ...start, agent: undefined, delivery: 'not-started', reason: note });
      return { ref, started: false, prompted: false, note } satisfies TaskAgentDto;
    }
    yield* Effect.logInfo('Agent started').pipe(
      Effect.annotateLogs({
        agent: ref,
        status: started.success.status,
        ready: started.success.ready,
      }),
    );
    yield* keep({ ...start, delivery: 'pending' });
    const status = yield* settledStatus(paneId, started.success);
    if (status !== 'idle') {
      yield* keep({ ...start, delivery: 'not-sent', reason: NOTES[status] });
      return { ref, started: true, prompted: false, note: NOTES[status] } satisfies TaskAgentDto;
    }
    const outcome = yield* deliver({ ...start, delivery: 'pending' }, paneId);
    return {
      ref,
      started: true,
      prompted: outcome._tag === 'Accepted',
      note: outcome._tag === 'Accepted' ? undefined : outcome.reason,
    } satisfies TaskAgentDto;
  });

  return { launch, deliver, keep };
});

import { activityOf, type TranscriptEntry } from '@pocket-comms/comms-domain';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import * as Stream from 'effect/Stream';
import type { AgentDto, AgentEventDto, TranscriptDto } from '../dto/agent.dto.js';
import { TranscriptUnavailableError } from '../errors.js';
import { HerdrOutbound } from '../ports/herdr.outbound.port.js';
import { TranscriptOutbound, type TranscriptSource } from '../ports/transcript.outbound.port.js';
import { makeLoadAgents, sourceOf, type AgentView } from './agents.js';

interface Lookup {
  readonly gone: boolean;
  readonly view?: AgentView;
}

const sameJson = <A>(a: A, b: A): boolean => JSON.stringify(a) === JSON.stringify(b);

export const makeTranscript = Effect.gen(function* () {
  const herdrOutbound = yield* HerdrOutbound;
  const transcriptOutbound = yield* TranscriptOutbound;
  const { find } = yield* makeLoadAgents;

  const sourceOrFail = (view: AgentView) =>
    Option.match(sourceOf(view.agent), {
      onNone: () =>
        Effect.fail(
          new TranscriptUnavailableError({
            ref: view.dto.ref,
            reason:
              view.dto.format === undefined
                ? `The app shows ${view.dto.kind ?? 'this'} agents only as a screen.`
                : 'Herdr reports no session for this agent yet.',
          }),
        ),
      onSome: Effect.succeed,
    });

  const transcript = Effect.fn('Transcript.transcript')(function* (ref: string) {
    const source = yield* sourceOrFail(yield* find(ref));
    const { entries } = yield* transcriptOutbound.read(source);
    return { entries, activity: activityOf(entries) } satisfies TranscriptDto;
  });

  /**
   * The updates of one conversation: the agent at once and after each change, and its session's
   * entries. Each session starts with a `reset` event that holds its latest entries, so nothing
   * written before the stream started is missed; later events hold the entries that are new or
   * changed. When the agent moves to another session, the stream follows the new one. The stream
   * ends when the agent is gone.
   */
  const agentEvents = Effect.fn('Transcript.agentEvents')(function* (ref: string) {
    yield* find(ref);

    // The agent at once and after every change Herdr reports. A lookup while Herdr is unreachable
    // is skipped; a lookup that finds no agent ends the stream.
    const views = Stream.concat(Stream.succeed(undefined), herdrOutbound.changes).pipe(
      Stream.mapEffect(() =>
        find(ref).pipe(
          Effect.map((view): Lookup => ({ gone: false, view })),
          Effect.catchTag('AgentNotFoundError', () => Effect.succeed<Lookup>({ gone: true })),
          Effect.catchTag('HerdrUnavailableError', () => Effect.succeed<Lookup>({ gone: false })),
        ),
      ),
      Stream.takeWhile((lookup) => !lookup.gone),
      Stream.flatMap(
        (lookup): Stream.Stream<AgentView> =>
          lookup.view === undefined ? Stream.empty : Stream.succeed(lookup.view),
      ),
    );

    const agentUpdates = views.pipe(
      Stream.map((view) => view.dto),
      Stream.changesWith(sameJson),
      Stream.map((agent): AgentEventDto => ({ type: 'agent', agent })),
    );

    const entriesOf = (source: TranscriptSource): Stream.Stream<AgentEventDto> => {
      // The activity names the latest step of the whole session, so the stream keeps the last
      // entry it saw.
      let latest: TranscriptEntry | undefined;
      let first = true;
      return transcriptOutbound.follow(source).pipe(
        Stream.map((entries): AgentEventDto => {
          latest = entries.at(-1) ?? latest;
          const reset = first;
          first = false;
          return {
            type: 'entries',
            reset,
            entries,
            activity: activityOf(latest === undefined ? [] : [latest]),
          };
        }),
        Stream.catchTag('TranscriptUnavailableError', (error) =>
          Stream.fromEffect(
            Effect.logWarning('The session file cannot be followed', { reason: error.reason }),
          ).pipe(Stream.drain),
        ),
      );
    };

    const entryUpdates = views.pipe(
      Stream.map((view) => sourceOf(view.agent)),
      Stream.changesWith(sameJson),
      Stream.switchMap((source) =>
        Option.match(source, { onNone: () => Stream.empty, onSome: entriesOf }),
      ),
    );

    return Stream.merge(agentUpdates, entryUpdates, { haltStrategy: 'left' });
  });

  return { transcript, agentEvents };
});

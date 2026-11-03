import { activityOf, imagesInPrompt, type TranscriptEntry } from '@pocket-comms/comms-domain';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import * as Stream from 'effect/Stream';
import type {
  AgentEventDto,
  SubagentDto,
  SubagentEventDto,
  SubagentInfoDto,
  TranscriptDto,
} from '../dto/agent.dto.js';
import { SubagentNotFoundError, TranscriptUnavailableError } from '../errors.js';
import { HerdrOutbound } from '../ports/herdr.outbound.port.js';
import { ImagesOutbound } from '../ports/images.outbound.port.js';
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
  const { folder } = yield* ImagesOutbound;
  const { find } = yield* makeLoadAgents;

  // A prompt's attached images show as images, not as paths (spec 014, requirement 12).
  const shown = (entries: ReadonlyArray<TranscriptEntry>): ReadonlyArray<TranscriptEntry> =>
    entries.map((entry) => {
      if (entry.type !== 'user') return entry;
      const { text, images } = imagesInPrompt(entry.text, folder);
      return images.length === 0 ? entry : { ...entry, text, images };
    });

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
    const entries = shown((yield* transcriptOutbound.read(source)).entries);
    return { entries, activity: activityOf(entries) } satisfies TranscriptDto;
  });

  // The agent at once and after every change Herdr reports. A lookup while Herdr is unreachable
  // is skipped; a lookup that finds no agent ends the stream.
  const viewsOf = (ref: string): Stream.Stream<AgentView> =>
    Stream.concat(Stream.succeed(undefined), herdrOutbound.changes).pipe(
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

  const entriesOf = (
    source: TranscriptSource,
  ): Stream.Stream<Extract<AgentEventDto, { type: 'entries' }>> => {
    // The activity names the latest step of the whole session, so the stream keeps the last
    // entry it saw.
    let latest: TranscriptEntry | undefined;
    let first = true;
    return transcriptOutbound.follow(source).pipe(
      Stream.map(shown),
      Stream.map((entries): Extract<AgentEventDto, { type: 'entries' }> => {
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

  /**
   * The updates of one conversation: the agent at once and after each change, and its session's
   * entries. Each session starts with a `reset` event that holds its latest entries, so nothing
   * written before the stream started is missed; later events hold the entries that are new or
   * changed. When the agent moves to another session, the stream follows the new one. The stream
   * ends when the agent is gone.
   */
  const agentEvents = Effect.fn('Transcript.agentEvents')(function* (ref: string) {
    yield* find(ref);
    const views = viewsOf(ref);

    const agentUpdates = views.pipe(
      Stream.map((view) => view.dto),
      Stream.changesWith(sameJson),
      Stream.map((agent): AgentEventDto => ({ type: 'agent', agent })),
    );

    const entryUpdates = views.pipe(
      Stream.map((view) => sourceOf(view.agent)),
      Stream.changesWith(sameJson),
      Stream.switchMap((source) =>
        Option.match(source, { onNone: () => Stream.empty, onSome: entriesOf }),
      ),
    );

    return Stream.merge(agentUpdates, entryUpdates, { haltStrategy: 'left' });
  });

  // A subagent exists while Claude records it: in the agent's background work, in its meta file
  // or as a conversation of its own. Only Claude sessions have subagents.
  const subagentOf = Effect.fnUntraced(function* (view: AgentView, id: string) {
    const notFound = new SubagentNotFoundError({ ref: view.dto.ref, subagent: id });
    const session = sourceOf(view.agent).pipe(Option.filter((found) => found.format === 'claude'));
    if (Option.isNone(session)) return yield* notFound;
    const source: TranscriptSource = { ...session.value, subagent: id };
    const meta = Option.getOrUndefined(yield* transcriptOutbound.subagentMeta(source));
    const item = view.dto.background.find((running) => running.subagent === id);
    if (meta === undefined && item === undefined) {
      if (Option.isNone(yield* transcriptOutbound.modifiedAt(source))) return yield* notFound;
    }
    const info: SubagentInfoDto = {
      id,
      description: meta?.description ?? item?.description ?? 'Subagent',
      agentType: meta?.agentType,
      running: item !== undefined,
      inBackground: item?.inBackground ?? meta?.inBackground ?? true,
    };
    return { source, info };
  });

  const subagent = Effect.fn('Transcript.subagent')(function* (ref: string, id: string) {
    const { source, info } = yield* subagentOf(yield* find(ref), id);
    const read = yield* transcriptOutbound
      .read(source)
      .pipe(
        Effect.catchTag('TranscriptUnavailableError', () =>
          Effect.fail(new SubagentNotFoundError({ ref, subagent: id })),
        ),
      );
    const entries = shown(read.entries);
    return { ...info, entries, activity: activityOf(entries) } satisfies SubagentDto;
  });

  /**
   * The updates of a subagent's conversation: what it is at once and after each change, such as
   * its end, and its entries as for an agent. The stream ends when the parent agent is gone or
   * moves to another session, which the subagent does not belong to.
   */
  const subagentEvents = Effect.fn('Transcript.subagentEvents')(function* (
    ref: string,
    id: string,
  ) {
    const { source } = yield* subagentOf(yield* find(ref), id);

    const infoUpdates = viewsOf(ref).pipe(
      Stream.takeWhile((view) => view.agent.session === source.session),
      Stream.mapEffect((view) => Effect.option(subagentOf(view, id))),
      Stream.flatMap((found) =>
        Option.match(found, {
          onNone: () => Stream.empty,
          onSome: ({ info }) => Stream.succeed(info),
        }),
      ),
      Stream.changesWith(sameJson),
      Stream.map((info): SubagentEventDto => ({ type: 'subagent', subagent: info })),
    );

    return Stream.merge(infoUpdates, entriesOf(source), { haltStrategy: 'left' });
  });

  return { transcript, agentEvents, subagent, subagentEvents };
});

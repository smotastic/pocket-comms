import { buildOverview } from '@pocket-comms/comms-domain';
import * as Effect from 'effect/Effect';
import * as Stream from 'effect/Stream';
import type { OverviewDto, OverviewStateDto } from '../dto/agent.dto.js';
import { HerdrOutbound } from '../ports/herdr.outbound.port.js';
import { SeenOutbound } from '../ports/memory.outbound.port.js';
import { makeLoadAgents, type AgentView } from './agents.js';

export const makeOverview = Effect.gen(function* () {
  const herdrOutbound = yield* HerdrOutbound;
  const seenOutbound = yield* SeenOutbound;
  const { load } = yield* makeLoadAgents;

  const overview = Effect.fn('Overview.overview')(function* () {
    const { views, workspaces, seen } = yield* load();
    const sorted = buildOverview(
      views.map((view) => ({ ...view.agent, dto: view.dto })),
      workspaces,
      seen,
      (agent) => agent.dto.background.length,
    );
    const toDto = (agent: { readonly dto: AgentView['dto'] }) => agent.dto;
    return {
      needsYou: sorted.needsYou.map(toDto),
      groups: sorted.groups.map((group) => ({
        key: group.key,
        name: group.name,
        agents: group.agents.map(toDto),
      })),
    } satisfies OverviewDto;
  });

  const state = overview().pipe(
    Effect.map((value): OverviewStateDto => ({ _tag: 'Available', overview: value })),
    Effect.catchTag('HerdrUnavailableError', (error) =>
      Effect.succeed<OverviewStateDto>({ _tag: 'Unavailable', reason: error.reason }),
    ),
  );

  // A new state after every change Herdr or the seen set reports; an unchanged one is not
  // repeated. JSON text is a deep comparison of plain data.
  const overviewChanges: Stream.Stream<OverviewStateDto> = Stream.concat(
    Stream.succeed(undefined),
    Stream.merge(herdrOutbound.changes, seenOutbound.changes),
  ).pipe(
    Stream.mapEffect(() => state),
    Stream.changesWith((a, b) => JSON.stringify(a) === JSON.stringify(b)),
  );

  return { overview: overview(), overviewChanges };
});

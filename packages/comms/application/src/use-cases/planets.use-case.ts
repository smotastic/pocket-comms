import { orderPlanets } from '@pocket-comms/comms-domain';
import * as Effect from 'effect/Effect';
import type { PlanetDto } from '../dto/task.dto.js';
import { MultiplexerOutbound } from '../ports/multiplexer.outbound.port.js';
import { RepositoriesOutbound } from '../ports/repositories.outbound.port.js';

/** The planets in the order the app offers them: open in Herdr first. */
export const makePlanets = Effect.gen(function* () {
  const planetsOutbound = yield* RepositoriesOutbound;
  const herdrOutbound = yield* MultiplexerOutbound;

  const planets = Effect.fn('Tasks.planets')(function* () {
    const listed = yield* planetsOutbound.list;
    const { workspaces } = yield* herdrOutbound.snapshot;
    return orderPlanets(listed, workspaces).map(({ name, open }): PlanetDto => ({ name, open }));
  });

  return { planets: planets() };
});

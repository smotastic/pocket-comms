import { describe, expect, it } from '@effect/vitest';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import {
  PlanetExistsError,
  PlanetNotFoundError,
  PlanetsStoreError,
  RepositoryNotFoundError,
} from '../errors.js';
import { PlanetsInbound } from '../ports/planets.inbound.port.js';
import { fakeLayer, FakeState } from '../testing/fakes.js';
import { makePlanetRegistry } from './planet-registry.js';

const layer = () => PlanetsInbound.layer.pipe(Layer.provideMerge(fakeLayer()));

const repositories = [
  { name: 'zeta', path: '/work/zeta' },
  { name: 'beta', path: '/work/beta' },
  { name: 'app', path: '/work/app' },
];

describe('PlanetsInbound.list', () => {
  it.effect('offers the planets open in Herdr first, then the other repositories by name', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.planets = repositories;
      state.registry = {
        planets: [
          { name: 'app', autonomy: 'manual' },
          { name: 'zeta', autonomy: 'manual' },
        ],
      };

      const listed = yield* PlanetsInbound.use((inbound) => inbound.list);

      expect(listed).toEqual({
        planets: [
          { name: 'app', open: true },
          { name: 'zeta', open: false },
        ],
        others: ['beta'],
      });
    }).pipe(Effect.provide(layer())),
  );

  it.effect('leaves out a registered planet whose folder is gone', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.registry = { planets: [{ name: 'gone', autonomy: 'manual' }] };

      const listed = yield* PlanetsInbound.use((inbound) => inbound.list);

      expect(listed).toEqual({ planets: [], others: ['app'] });
    }).pipe(Effect.provide(layer())),
  );
});

describe('PlanetsInbound.register', () => {
  it.effect('registers a repository below the root at manual', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.planets = repositories;
      state.registry = { planets: [{ name: 'app', autonomy: 'manual' }] };

      yield* PlanetsInbound.use((inbound) => inbound.register('beta'));

      expect(state.registry).toEqual({
        planets: [
          { name: 'app', autonomy: 'manual' },
          { name: 'beta', autonomy: 'manual' },
        ],
      });
    }).pipe(Effect.provide(layer())),
  );

  it.effect('refuses a planet already registered and a name no repository has', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.registry = { planets: [{ name: 'app', autonomy: 'manual' }] };

      const again = yield* PlanetsInbound.use((inbound) => inbound.register('app')).pipe(
        Effect.flip,
      );
      const unknown = yield* PlanetsInbound.use((inbound) => inbound.register('../etc')).pipe(
        Effect.flip,
      );

      expect(again).toEqual(new PlanetExistsError({ planet: 'app' }));
      expect(unknown).toEqual(new RepositoryNotFoundError({ name: '../etc' }));
    }).pipe(Effect.provide(layer())),
  );

  it.effect('reports a registry that cannot be saved', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.registry = { planets: [] };
      state.registryFailure = 'disk full';

      const error = yield* PlanetsInbound.use((inbound) => inbound.register('app')).pipe(
        Effect.flip,
      );

      expect(error).toEqual(new PlanetsStoreError({ reason: 'disk full' }));
    }).pipe(Effect.provide(layer())),
  );
});

describe('PlanetsInbound.unregister', () => {
  it.effect('removes the planet with its settings, and refuses one that is not a planet', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;

      yield* PlanetsInbound.use((inbound) => inbound.unregister('app'));
      const error = yield* PlanetsInbound.use((inbound) => inbound.unregister('app')).pipe(
        Effect.flip,
      );

      expect(state.registry).toEqual({ planets: [] });
      expect(error).toEqual(new PlanetNotFoundError({ planet: 'app' }));
    }).pipe(Effect.provide(layer())),
  );
});

describe('the seed', () => {
  const seed = Effect.flatMap(makePlanetRegistry, (registry) => registry.seed);

  it.effect('registers the repositories on Gitea once, without pocket-cloud', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.registry = 'none';
      state.planets = [
        { name: 'app', path: '/work/app' },
        { name: 'pocket-cloud', path: '/work/pocket-cloud' },
        { name: 'setup', path: '/work/setup' },
      ];
      state.origins.set('pocket-cloud', 'gitea:owner/pocket-cloud.git');
      state.origins.set('setup', 'git@github.com:owner/setup.git');

      yield* seed;

      expect(state.registry).toEqual({ planets: [{ name: 'app', autonomy: 'manual' }] });
    }).pipe(Effect.provide(layer())),
  );

  it.effect('leaves a registry alone, even with a new repository below the root', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.registry = { planets: [] };

      yield* seed;

      expect(state.registry).toEqual({ planets: [] });
    }).pipe(Effect.provide(layer())),
  );
});

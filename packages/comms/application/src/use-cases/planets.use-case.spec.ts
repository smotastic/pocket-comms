import { describe, expect, it } from '@effect/vitest';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { TestClock } from 'effect/testing';
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

describe('PlanetsInbound.preflight', () => {
  const ready = (state: FakeState['Service']) => {
    state.giteaRepositories.set('owner/app', {
      defaultBranch: 'master',
      files: new Map([
        ['AGENTS.md', '# app'],
        ['.github/workflows/ci.yml', 'on: push'],
        ['package.json', '{"scripts":{"verify":"pocket-ci verify"}}'],
      ]),
      runs: [{ status: 'completed', conclusion: 'success' }],
    });
  };

  it.effect('is go for a ready planet, at the chosen level', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      ready(state);

      const preflight = yield* PlanetsInbound.use((inbound) => inbound.preflight('app'));

      expect(preflight.result).toBe('go');
      expect(preflight.checks.map((check) => check.passed)).toEqual([
        true,
        true,
        true,
        true,
        true,
        true,
      ]);
      expect(preflight.autonomy).toEqual({ chosen: 'manual', effective: 'manual' });
    }).pipe(Effect.provide(layer())),
  );

  it.effect('is no-go, with the reason, without a verify script or green CI', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.giteaRepositories.set('owner/app', {
        defaultBranch: 'main',
        files: new Map([
          ['AGENTS.md', '# app'],
          ['.gitea/workflows/ci.yaml', 'on: push'],
          ['package.json', '{"scripts":{}}'],
        ]),
        runs: [{ status: 'running' }, { status: 'completed', conclusion: 'failure' }],
      });

      const preflight = yield* PlanetsInbound.use((inbound) => inbound.preflight('app'));

      expect(preflight.result).toBe('no-go');
      expect(preflight.checks.filter((check) => !check.passed)).toEqual([
        {
          check: 'ci-green',
          passed: false,
          reason: 'The newest finished run on main ended as failure; a newer run is still going.',
        },
        {
          check: 'verify-script',
          passed: false,
          reason: 'package.json on main has no verify script.',
        },
      ]);
    }).pipe(Effect.provide(layer())),
  );

  it.effect('is no-go, not an error, when Gitea cannot be reached or has no token', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.giteaFailure = 'Gitea cannot be reached.';

      const down = yield* PlanetsInbound.use((inbound) => inbound.preflight('app'));
      state.giteaFailure = undefined;
      state.giteaConfigured = false;
      yield* TestClock.adjust('61 seconds');
      const noToken = yield* PlanetsInbound.use((inbound) => inbound.preflight('app'));

      expect(down.result).toBe('no-go');
      expect(down.checks[0]?.reason).toBe('Gitea cannot be reached.');
      expect(noToken.checks[0]?.reason).toBe('The app has no Gitea token.');
    }).pipe(Effect.provide(layer())),
  );

  it.effect(
    'fails every check for a planet whose origin is not on Gitea, or a missing repository',
    () =>
      Effect.gen(function* () {
        const state = yield* FakeState;
        state.origins.set('app', 'git@github.com:owner/app.git');

        const elsewhere = yield* PlanetsInbound.use((inbound) => inbound.preflight('app'));
        state.origins.set('app', 'gitea:owner/app.git');
        yield* TestClock.adjust('61 seconds');
        const missing = yield* PlanetsInbound.use((inbound) => inbound.preflight('app'));

        expect(elsewhere.checks[0]?.reason).toBe("Its origin is not on the app's Gitea.");
        expect(missing.checks[0]?.reason).toBe(
          'Gitea has no repository owner/app, or the token cannot read it.',
        );
        expect(missing.result).toBe('no-go');
      }).pipe(Effect.provide(layer())),
  );

  it.effect('reuses a preflight for 60 seconds, then reads Gitea again', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      ready(state);

      yield* PlanetsInbound.use((inbound) => inbound.preflight('app'));
      const calls = state.giteaCalls.length;
      yield* TestClock.adjust('30 seconds');
      yield* PlanetsInbound.use((inbound) => inbound.preflight('app'));
      expect(state.giteaCalls.length).toBe(calls);

      yield* TestClock.adjust('31 seconds');
      yield* PlanetsInbound.use((inbound) => inbound.preflight('app'));
      expect(state.giteaCalls.length).toBeGreaterThan(calls);
    }).pipe(Effect.provide(layer())),
  );

  it.effect('reads again at once when asked for a fresh one (spec 035)', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      ready(state);

      yield* PlanetsInbound.use((inbound) => inbound.preflight('app'));
      const calls = state.giteaCalls.length;
      yield* PlanetsInbound.use((inbound) => inbound.preflight('app', true));
      expect(state.giteaCalls.length).toBeGreaterThan(calls);
    }).pipe(Effect.provide(layer())),
  );

  it.effect('is no-go without the mission bot, and caps missions to manual', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      ready(state);
      state.bot.configured = false;
      state.registry = { planets: [{ name: 'app', autonomy: 'missions' }] };

      const preflight = yield* PlanetsInbound.use((inbound) => inbound.preflight('app'));

      expect(preflight.result).toBe('no-go');
      expect(preflight.checks.at(-1)).toEqual({
        check: 'mission-bot',
        passed: false,
        reason: 'Missions have no bot token (COMMS_MISSION_GITEA_TOKEN).',
      });
      expect(preflight.autonomy).toEqual({ chosen: 'missions', effective: 'manual' });
    }).pipe(Effect.provide(layer())),
  );

  it.effect('refuses a repository that is not a planet', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.registry = { planets: [] };

      const error = yield* PlanetsInbound.use((inbound) => inbound.preflight('app')).pipe(
        Effect.flip,
      );

      expect(error).toEqual(new PlanetNotFoundError({ planet: 'app' }));
    }).pipe(Effect.provide(layer())),
  );
});

describe('PlanetsInbound.choose', () => {
  it.effect('sets missions, and refuses autopilot and a repository that is not a planet', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.registry = { planets: [{ name: 'app', autonomy: 'manual' }] };

      yield* PlanetsInbound.use((inbound) => inbound.choose('app', 'missions'));
      const autopilot = yield* PlanetsInbound.use((inbound) =>
        inbound.choose('app', 'autopilot'),
      ).pipe(Effect.flip);
      const unknown = yield* PlanetsInbound.use((inbound) => inbound.choose('beta', 'manual')).pipe(
        Effect.flip,
      );

      expect(state.registry).toEqual({ planets: [{ name: 'app', autonomy: 'missions' }] });
      expect(autopilot._tag).toBe('InvalidInputError');
      expect(unknown).toEqual(new PlanetNotFoundError({ planet: 'beta' }));
    }).pipe(Effect.provide(layer())),
  );
});

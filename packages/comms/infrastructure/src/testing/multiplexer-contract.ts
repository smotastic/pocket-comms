import { describe, expect, it } from '@effect/vitest';
import { MultiplexerOutbound } from '@pocket-comms/comms-application';
import type * as Effect_ from 'effect/Effect';
import * as Effect from 'effect/Effect';
import type * as Layer from 'effect/Layer';
import type * as Scope from 'effect/Scope';
import * as Stream from 'effect/Stream';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * One multiplexer as a fake serves it: one idle Claude agent named `kirk` in its own workspace, at
 * the worktree folder `/worktrees/app/feat-x` of the planet `/work/app`.
 */
export interface MultiplexerWorld {
  readonly layer: Layer.Layer<MultiplexerOutbound>;
}

/**
 * What the application relies on from every `MultiplexerOutbound` adapter (ADR 0015), run against
 * each adapter's own fake. Adapter-specific requests stay in each adapter's tests.
 */
export const describeMultiplexer = (
  name: string,
  world: Effect_.Effect<MultiplexerWorld, never, Scope.Scope>,
  away: (path: string) => Layer.Layer<MultiplexerOutbound>,
) =>
  describe(`${name} as a MultiplexerOutbound`, () => {
    const using = <A, E>(use: (outbound: MultiplexerOutbound['Service']) => Effect_.Effect<A, E>) =>
      Effect.gen(function* () {
        const { layer } = yield* world;
        return yield* MultiplexerOutbound.use(use).pipe(Effect.provide(layer));
      }).pipe(Effect.scoped);

    it.live('lists the agent in a workspace it also lists', () =>
      Effect.gen(function* () {
        const { agents, workspaces } = yield* using((outbound) => outbound.snapshot);

        const kirk = agents.find((agent) => agent.name === 'kirk');
        expect(kirk).toMatchObject({ kind: 'claude', status: 'idle' });
        expect(workspaces.map((workspace) => workspace.id)).toContain(kirk?.workspaceId);
      }),
    );

    it.live('reads the screen, and the agent with whether it takes input', () =>
      Effect.gen(function* () {
        const [screen, agent] = yield* using((outbound) =>
          Effect.all([outbound.readScreen('kirk'), outbound.readAgent('kirk')]),
        );

        expect(typeof screen).toBe('string');
        expect(agent).toEqual({ status: 'idle', ready: true });
      }),
    );

    it.live('takes a prompt, typed text and keys for the agent', () =>
      Effect.gen(function* () {
        const { agents } = yield* using((outbound) => outbound.snapshot);
        const pane = agents.find((agent) => agent.name === 'kirk')?.paneId ?? '';

        yield* using((outbound) =>
          Effect.all([
            outbound.prompt('kirk', 'Go on'),
            outbound.typeText(pane, 'an answer'),
            outbound.sendKeys(pane, ['down', 'enter']),
          ]),
        );
      }),
    );

    it.live('opens a worktree and a shell in it, starts an agent there and closes it', () =>
      Effect.gen(function* () {
        const [opened, shell, started] = yield* using((outbound) =>
          Effect.gen(function* () {
            const opened = yield* outbound.openWorktree({
              cwd: '/work/app',
              path: '/worktrees/app/feat-y',
              label: 'Add y',
            });
            const shell = yield* outbound.openShell(opened.workspaceId);
            const started = yield* outbound.startAgent({
              paneId: opened.paneId,
              name: 'feat-y',
              kind: 'claude',
            });
            yield* outbound.closeWorkspace(opened.workspaceId);
            return [opened, shell, started] as const;
          }),
        );

        expect(opened.alreadyOpen).toBe(false);
        expect(shell.workspaceId).toBe(opened.workspaceId);
        expect(typeof started.paneId).toBe('string');
      }),
    );

    it.live('refuses an agent it does not have', () =>
      Effect.gen(function* () {
        const error = yield* using((outbound) => outbound.readAgent('nobody')).pipe(Effect.flip);

        expect(error._tag).toBe('MultiplexerRejectedError');
      }),
    );

    it.live('is unavailable without its socket, and its changes go on', () =>
      Effect.gen(function* () {
        const layer = away(join(mkdtempSync(join(tmpdir(), 'away-')), 'none.sock'));
        const [error, changes] = yield* MultiplexerOutbound.use((outbound) =>
          Effect.all([
            Effect.flip(outbound.snapshot),
            outbound.changes.pipe(Stream.take(2), Stream.runCollect),
          ]),
        ).pipe(Effect.provide(layer));

        expect(error._tag).toBe('MultiplexerUnavailableError');
        expect(changes).toHaveLength(2);
      }),
    );
  });

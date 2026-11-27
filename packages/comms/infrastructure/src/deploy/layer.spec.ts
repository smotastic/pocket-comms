import { DeployOutbound } from '@pocket-comms/comms-application';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { layer } from './layer.js';

let folder = '';

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'comms-deploy-'));
});
afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

// A fake deploy script: `check` answers per app; a deploy writes its arguments and a result.
const fakeScript = async () => {
  const path = join(folder, 'deploy.sh');
  await writeFile(
    path,
    `#!/bin/sh
if [ "$1" = check ]; then
  case "$2" in
    ready) echo '{"app":"ready","ready":true,"reason":"ready can deploy."}' ;;
    unready) echo '{"app":"unready","ready":false,"reason":"No health URL for unready."}'; exit 1 ;;
    *) echo 'garbage'; exit 2 ;;
  esac
  exit 0
fi
app="$1"; version="$2"; shift 2
backup=no; result=""
while [ $# -gt 0 ]; do
  case "$1" in --backup) backup=yes ;; --result) shift; result="$1" ;; esac
  shift
done
echo "deploying $app $version backup=$backup"
printf '{"result":"deployed","output":"%s %s %s"}\\n' "$app" "$version" "$backup" > "$result"
`,
  );
  await chmod(path, 0o755);
  return path;
};

const run = <A, E>(script: Option.Option<string>, use: Effect.Effect<A, E, DeployOutbound>) =>
  Effect.runPromise(use.pipe(Effect.provide(layer({ script, stateDir: join(folder, 'state') }))));

const waitFor = async <A>(read: () => Promise<A | undefined>): Promise<A> => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const value = await read();
    if (value !== undefined) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('timed out');
};

describe('the deploy script adapter', () => {
  it('asks the script about an app, and calls a broken answer not ready', async () => {
    const script = Option.some(await fakeScript());
    const checks = await run(
      script,
      Effect.gen(function* () {
        const deploy = yield* DeployOutbound;
        return yield* Effect.all([
          deploy.check('ready'),
          deploy.check('unready'),
          deploy.check('broken'),
        ]);
      }),
    );
    expect(checks[0]).toEqual({ app: 'ready', ready: true, reason: 'ready can deploy.' });
    expect(checks[1]).toEqual({
      app: 'unready',
      ready: false,
      reason: 'No health URL for unready.',
    });
    expect(checks[2]?.ready).toBe(false);
    expect(checks[2]?.reason).toContain('did not answer about broken');
  });

  it('is not configured without a script, and refuses to start', async () => {
    const outcome = await run(
      Option.none(),
      Effect.gen(function* () {
        const deploy = yield* DeployOutbound;
        const check = yield* deploy.check('ready');
        const started = yield* deploy
          .start({ id: 'm-1', app: 'ready', version: '1.0.0', backup: false })
          .pipe(Effect.flip);
        return { configured: deploy.configured, check, started };
      }),
    );
    expect(outcome.configured).toBe(false);
    expect(outcome.check.ready).toBe(false);
    expect(outcome.started.reason).toContain('COMMS_DEPLOY_SCRIPT');
  });

  it('runs a deploy detached and reads its result file, with the backup when asked', async () => {
    const script = Option.some(await fakeScript());
    await run(
      script,
      Effect.gen(function* () {
        const deploy = yield* DeployOutbound;
        expect(Option.isNone(yield* deploy.result('m-1'))).toBe(true);
        yield* deploy.start({ id: 'm-1', app: 'ready', version: '1.2.3', backup: true });
      }),
    );
    const result = await waitFor(() =>
      run(
        script,
        Effect.gen(function* () {
          const deploy = yield* DeployOutbound;
          return Option.getOrUndefined(yield* deploy.result('m-1'));
        }),
      ),
    );
    expect(result).toEqual({ result: 'deployed', output: 'ready 1.2.3 yes' });
    const log = await readFile(join(folder, 'state', 'deploys', 'm-1.log'), 'utf8');
    expect(log).toContain('deploying ready 1.2.3 backup=yes');
  });

  it('refuses an id that is not a plain name', async () => {
    const script = Option.some(await fakeScript());
    const error = await run(
      script,
      Effect.gen(function* () {
        const deploy = yield* DeployOutbound;
        return yield* deploy
          .start({ id: '../x', app: 'ready', version: '1.0.0', backup: false })
          .pipe(Effect.flip);
      }),
    );
    expect(error.reason).toContain('Bad deploy id');
  });

  it('fails at once when the script cannot start (spec 037)', async () => {
    const path = join(folder, 'not-executable.sh');
    await writeFile(path, '#!/bin/sh\nexit 0\n');
    for (const script of [path, join(folder, 'missing.sh')]) {
      const error = await run(
        Option.some(script),
        Effect.gen(function* () {
          const deploy = yield* DeployOutbound;
          return yield* deploy
            .start({ id: 'm-2', app: 'ready', version: '1.0.0', backup: false })
            .pipe(Effect.flip);
        }),
      );
      expect(error.reason).toContain('The deploy script did not start');
    }
  });

  it('returns the process id, and tells a running deploy from one that ended', async () => {
    const path = join(folder, 'slow.sh');
    await writeFile(path, '#!/bin/sh\nsleep 2\n');
    await chmod(path, 0o755);
    const { pid, running, ended } = await run(
      Option.some(path),
      Effect.gen(function* () {
        const deploy = yield* DeployOutbound;
        const started = yield* deploy.start({
          id: 'm-3',
          app: 'ready',
          version: '1.0.0',
          backup: false,
        });
        return {
          pid: started.pid,
          running: yield* deploy.running(started.pid),
          ended: yield* deploy.running(2 ** 22 + 12_345),
        };
      }),
    );
    expect(pid).toBeGreaterThan(0);
    expect(running).toBe(true);
    expect(ended).toBe(false);
    process.kill(-pid, 'SIGTERM');
  });

  it('reads a result of down', async () => {
    const result = await run(
      Option.some(await fakeScript()),
      Effect.gen(function* () {
        const deploy = yield* DeployOutbound;
        const { mkdir } = yield* Effect.promise(() => import('node:fs/promises'));
        yield* Effect.promise(() => mkdir(join(folder, 'state', 'deploys'), { recursive: true }));
        yield* Effect.promise(() =>
          writeFile(
            join(folder, 'state', 'deploys', 'm-4.json'),
            '{"result":"down","output":"rollback unhealthy"}',
          ),
        );
        return yield* deploy.result('m-4');
      }),
    );
    expect(Option.getOrUndefined(result)).toEqual({ result: 'down', output: 'rollback unhealthy' });
  });
});

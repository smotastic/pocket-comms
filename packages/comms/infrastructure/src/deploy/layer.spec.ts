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
    expect(checks[1]).toEqual({ app: 'unready', ready: false, reason: 'No health URL for unready.' });
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
});

import { DeployError, DeployOutbound, type DeployResult } from '@pocket-comms/comms-application';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import { execFile, spawn } from 'node:child_process';
import { closeSync, mkdirSync, openSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gitEnvironment } from '../repositories/git.js';

// pocket-cloud's deploy script (spec 036, ADR 0020). `check` asks it about one app and changes
// nothing; a deploy runs detached in its own session, so the restart of the server that deploying
// comms itself causes does not stop it, and it writes its result into the state folder's
// `deploys` folder, where the restarted server finds it.

export interface DeployOptions {
  /** The deploy script; none means the server cannot deploy. */
  readonly script: Option.Option<string>;
  /** The server's state folder; results and logs go in its `deploys` folder. */
  readonly stateDir: string;
  /** How long `check` may take, in milliseconds. Default 20 seconds. */
  readonly checkTimeout?: number;
}

const ID = /^[A-Za-z0-9._-]+$/u;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The script's environment: the server's, without git's repository variables. */
const environment = () => gitEnvironment(process.env);

export const layer = ({ script, stateDir, checkTimeout = 20_000 }: DeployOptions) => {
  const folder = join(stateDir, 'deploys');

  const check = (app: string) =>
    Option.match(script, {
      onNone: () =>
        Effect.succeed({
          app,
          ready: false,
          reason: 'The server has no deploy script (COMMS_DEPLOY_SCRIPT).',
        }),
      onSome: (path) =>
        Effect.callback<{ app: string; ready: boolean; reason: string }>((resume) => {
          const child = execFile(
            path,
            ['check', app],
            { timeout: checkTimeout, env: environment() },
            (error, stdout) => {
              const line = stdout.trim().split('\n').at(-1) ?? '';
              let parsed: unknown;
              try {
                parsed = JSON.parse(line);
              } catch {
                parsed = undefined;
              }
              if (isRecord(parsed) && typeof parsed['reason'] === 'string') {
                resume(
                  Effect.succeed({
                    app,
                    ready: parsed['ready'] === true && error === null,
                    reason: parsed['reason'],
                  }),
                );
                return;
              }
              resume(
                Effect.succeed({
                  app,
                  ready: false,
                  reason: `The deploy script did not answer about ${app}${error === null ? '' : `: ${error.message}`}.`,
                }),
              );
            },
          );
          return Effect.sync(() => void child.kill());
        }),
    });

  const start = (job: { id: string; app: string; version: string; backup: boolean }) =>
    Effect.gen(function* () {
      if (Option.isNone(script)) {
        return yield* new DeployError({
          reason: 'The server has no deploy script (COMMS_DEPLOY_SCRIPT).',
        });
      }
      if (!ID.test(job.id)) return yield* new DeployError({ reason: `Bad deploy id ${job.id}.` });
      const path = script.value;
      yield* Effect.try({
        try: () => {
          mkdirSync(folder, { recursive: true, mode: 0o700 });
          const log = openSync(join(folder, `${job.id}.log`), 'a', 0o600);
          try {
            const child = spawn(
              path,
              [
                job.app,
                job.version,
                ...(job.backup ? ['--backup'] : []),
                '--result',
                join(folder, `${job.id}.json`),
              ],
              { detached: true, stdio: ['ignore', log, log], env: environment() },
            );
            child.on('error', () => undefined);
            child.unref();
          } finally {
            closeSync(log);
          }
        },
        catch: (error) =>
          new DeployError({
            reason: `The deploy script did not start: ${error instanceof Error ? error.message : String(error)}`,
          }),
      });
    });

  const result = (id: string) =>
    Effect.promise(() =>
      ID.test(id)
        ? readFile(join(folder, `${id}.json`), 'utf8').catch(() => undefined)
        : Promise.resolve(undefined),
    ).pipe(
      Effect.map((text): Option.Option<DeployResult> => {
        if (text === undefined) return Option.none();
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          return Option.none();
        }
        if (!isRecord(parsed)) return Option.none();
        const state = parsed['result'];
        const output = typeof parsed['output'] === 'string' ? parsed['output'] : '';
        return state === 'deployed' || state === 'rolled-back' || state === 'failed'
          ? Option.some({ result: state, output })
          : Option.none();
      }),
    );

  return Layer.succeed(
    DeployOutbound,
    DeployOutbound.of({ configured: Option.isSome(script), check, start, result }),
  );
};

import { describe, expect, it } from '@effect/vitest';
import { MissionBotOutbound } from '@pocket-comms/comms-application';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import * as Redacted from 'effect/Redacted';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gitEnvironment } from '../repositories/git.js';
import { layer } from './layer.js';

const TOKEN = 'bot-token-0123456789';
const repository = { owner: 'owner', name: 'app' };

interface Seen {
  readonly method: string | undefined;
  readonly path: string;
  readonly authorization: string | undefined;
  readonly body?: unknown;
}

type Route = (path: string, method: string | undefined) => { status: number; body: unknown };

const fakeGitea = (route: Route) =>
  Effect.acquireRelease(
    Effect.callback<{ readonly url: string; readonly seen: Array<Seen>; close: () => void }>(
      (resume) => {
        const seen: Array<Seen> = [];
        const server = createServer((request: IncomingMessage, response: ServerResponse) => {
          const chunks: Array<Buffer> = [];
          request.on('data', (chunk: Buffer) => chunks.push(chunk));
          request.on('end', () => {
            const sent = Buffer.concat(chunks).toString('utf8');
            const path = (request.url ?? '/').replace('/api/v1', '');
            seen.push({
              method: request.method,
              path,
              authorization: request.headers.authorization,
              ...(sent === '' ? {} : { body: JSON.parse(sent) as unknown }),
            });
            const { status, body } = route(path, request.method);
            response.writeHead(status, { 'content-type': 'application/json' });
            response.end(JSON.stringify(body));
          });
        });
        server.listen(0, '127.0.0.1', () => {
          const { port } = server.address() as AddressInfo;
          resume(
            Effect.succeed({ url: `http://127.0.0.1:${port}`, seen, close: () => server.close() }),
          );
        });
      },
    ),
    (gitea) => Effect.sync(() => gitea.close()),
  );

const bot = (
  url: string,
  token: string | null = TOKEN,
  stateDir = mkdtempSync(join(tmpdir(), 'bot-')),
) =>
  MissionBotOutbound.pipe(
    Effect.provide(
      layer({
        url,
        stateDir,
        settingsPath: '/release/mission/claude-settings.json',
        token: token === null ? Option.none() : Option.some(Redacted.make(token)),
      }),
    ),
  );

const labelsRoute =
  (labels: ReadonlyArray<{ id: number; name: string }>): Route =>
  (path, method) => {
    if (method === 'GET' && path.startsWith('/repos/owner/app/labels')) {
      return { status: 200, body: labels };
    }
    if (method === 'POST' && path === '/repos/owner/app/labels') {
      return { status: 201, body: { id: 99, name: 'created' } };
    }
    return { status: method === 'DELETE' ? 204 : 200, body: [] };
  };

describe('the mission bot', () => {
  it.effect('refuses every write without a token, and says so in the facts', () =>
    Effect.gen(function* () {
      const gitea = yield* fakeGitea(() => ({ status: 200, body: {} }));
      const missions = yield* bot(gitea.url, null);

      expect(missions.configured).toBe(false);
      expect(yield* missions.facts(repository)).toEqual({ _tag: 'NoToken' });
      const refused = yield* missions.comment(repository, 7, 'Hi').pipe(Effect.flip);
      expect(refused.reason).toBe('Missions have no bot token (COMMS_MISSION_GITEA_TOKEN).');
      expect(gitea.seen).toEqual([]);
    }).pipe(Effect.scoped),
  );

  it.effect('reads whether it may push and write issues, with its own token', () =>
    Effect.gen(function* () {
      const gitea = yield* fakeGitea((path, method) => {
        if (method === 'GET' && path === '/repos/owner/app') {
          return { status: 200, body: { permissions: { push: true } } };
        }
        if (method === 'POST' && path === '/repos/owner/app/labels') {
          return { status: 422, body: { message: '[Name]: Required' } };
        }
        return { status: 404, body: {} };
      });
      const missions = yield* bot(gitea.url);

      expect(yield* missions.facts(repository)).toEqual({
        _tag: 'Read',
        canPush: true,
        canWriteIssues: true,
      });
      expect(yield* missions.facts({ owner: 'owner', name: 'other' })).toEqual({
        _tag: 'Read',
        canPush: false,
        canWriteIssues: false,
      });
      expect(gitea.seen[0]?.authorization).toBe(`token ${TOKEN}`);
      // The probe has an empty body, which Gitea refuses after the scope check and before a write.
      expect(gitea.seen[1]).toEqual(
        expect.objectContaining({ method: 'POST', path: '/repos/owner/app/labels', body: {} }),
      );
    }).pipe(Effect.scoped),
  );

  it.effect('reads that a token without write:issue may not write issues', () =>
    Effect.gen(function* () {
      const gitea = yield* fakeGitea((_path, method) =>
        method === 'GET'
          ? { status: 200, body: { permissions: { push: true } } }
          : {
              status: 403,
              body: {
                message:
                  'token does not have at least one of required scope(s), required=[write:issue]',
              },
            },
      );

      expect(yield* (yield* bot(gitea.url)).facts(repository)).toEqual({
        _tag: 'Read',
        canPush: true,
        canWriteIssues: false,
      });
    }).pipe(Effect.scoped),
  );

  it.effect('does not probe issues without push, and names an unknown answer to the probe', () =>
    Effect.gen(function* () {
      const readOnly = yield* fakeGitea(() => ({ status: 200, body: { permissions: {} } }));
      expect(yield* (yield* bot(readOnly.url)).facts(repository)).toEqual({
        _tag: 'Read',
        canPush: false,
        canWriteIssues: false,
      });
      expect(readOnly.seen.map((each) => each.method)).toEqual(['GET']);

      const broken = yield* fakeGitea((_path, method) =>
        method === 'GET'
          ? { status: 200, body: { permissions: { push: true } } }
          : { status: 502, body: {} },
      );
      expect(yield* (yield* bot(broken.url)).facts(repository)).toEqual({
        _tag: 'Unreadable',
        reason: 'Gitea answered 502.',
      });
    }).pipe(Effect.scoped),
  );

  it.effect('sets the lane label, creating it, and removes the other lane', () =>
    Effect.gen(function* () {
      const gitea = yield* fakeGitea(labelsRoute([{ id: 3, name: 'mission:full-flight' }]));
      yield* (yield* bot(gitea.url)).setLane(repository, 7, 'hop');

      expect(gitea.seen.filter((each) => each.method !== 'GET')).toEqual([
        expect.objectContaining({ method: 'DELETE', path: '/repos/owner/app/issues/7/labels/3' }),
        expect.objectContaining({
          method: 'POST',
          path: '/repos/owner/app/labels',
          body: expect.objectContaining({ name: 'mission:hop' }),
        }),
        expect.objectContaining({
          method: 'POST',
          path: '/repos/owner/app/issues/7/labels',
          body: { labels: [99] },
        }),
      ]);
    }).pipe(Effect.scoped),
  );

  it.effect('marks and unmarks the issue in progress, and comments', () =>
    Effect.gen(function* () {
      const gitea = yield* fakeGitea(labelsRoute([{ id: 5, name: 'status/in-progress' }]));
      const missions = yield* bot(gitea.url);
      yield* missions.markInProgress(repository, 7);
      yield* missions.unmarkInProgress(repository, 7);
      yield* missions.comment(repository, 7, 'Mission started.');

      expect(gitea.seen.filter((each) => each.method !== 'GET')).toEqual([
        expect.objectContaining({ method: 'POST', body: { labels: [5] } }),
        expect.objectContaining({ method: 'DELETE', path: '/repos/owner/app/issues/7/labels/5' }),
        expect.objectContaining({
          method: 'POST',
          path: '/repos/owner/app/issues/7/comments',
          body: { body: 'Mission started.' },
        }),
      ]);
    }).pipe(Effect.scoped),
  );

  it.effect("sets the bot's git identity in the worktree only", () =>
    Effect.gen(function* () {
      const gitea = yield* fakeGitea((path) =>
        path === '/user'
          ? { status: 200, body: { login: 'mission-control', email: 'bot@example.test' } }
          : { status: 404, body: {} },
      );
      const root = mkdtempSync(join(tmpdir(), 'bot-repo-'));
      const main = join(root, 'main');
      const worktree = join(root, 'mission');
      // Without the variables that pick a repository: a git hook sets GIT_DIR, and git would
      // otherwise write into the repository the hook runs for.
      const env = gitEnvironment(process.env);
      const git = (cwd: string, ...args: ReadonlyArray<string>) =>
        execFileSync('git', [...args], { cwd, env, encoding: 'utf8' }).trim();
      execFileSync('git', ['init', '-q', main], { env });
      git(main, 'config', 'user.name', 'Owner');
      git(main, 'config', 'user.email', 'owner@example.test');
      git(main, 'config', 'commit.gpgsign', 'false');
      git(main, 'commit', '-q', '--allow-empty', '-m', 'start');
      git(main, 'worktree', 'add', '-q', '-b', 'fix/7-x', worktree);
      const stateDir = mkdtempSync(join(tmpdir(), 'bot-state-'));

      yield* (yield* bot(gitea.url, TOKEN, stateDir)).prepareWorktree(worktree, repository);

      expect(git(worktree, 'config', 'user.name')).toBe('mission-control');
      expect(git(worktree, 'config', 'user.email')).toBe('bot@example.test');
      expect(git(worktree, 'config', 'remote.origin.pushurl')).toBe(`${gitea.url}/owner/app.git`);
      const helpers = execFileSync(
        'git',
        ['config', '--worktree', '--get-all', 'credential.helper'],
        { cwd: worktree, env, encoding: 'utf8' },
      );
      expect(helpers.split('\n').slice(0, -1)).toEqual([
        '',
        `store --file ${join(stateDir, 'mission', 'git-credentials')}`,
      ]);
      expect(git(main, 'config', 'user.name')).toBe('Owner');
      const credentials = join(stateDir, 'mission', 'git-credentials');
      expect(readFileSync(credentials, 'utf8')).toBe(
        `http://mission-control:${TOKEN}@${new URL(gitea.url).host}\n`,
      );
      expect(statSync(credentials).mode & 0o777).toBe(0o600);
    }).pipe(Effect.scoped),
  );

  it.effect('pushes a tag, accepts the same tag on the same commit, refuses another commit', () =>
    Effect.gen(function* () {
      const gitea = yield* fakeGitea((path, method) => {
        if (method === 'POST' && path === '/repos/owner/app/tags') {
          return { status: 201, body: { name: 'app-v1.0.0' } };
        }
        return { status: 404, body: {} };
      });
      const missions = yield* bot(gitea.url);
      yield* missions.pushTag(repository, 'app-v1.0.0', 'abc');
      expect(gitea.seen[0]).toMatchObject({
        method: 'POST',
        path: '/repos/owner/app/tags',
        body: { tag_name: 'app-v1.0.0', target: 'abc' },
      });

      const exists = yield* fakeGitea((path, method) => {
        if (method === 'POST') return { status: 409, body: { message: 'exists' } };
        if (path === '/repos/owner/app/tags/app-v1.0.0') {
          return { status: 200, body: { name: 'app-v1.0.0', commit: { sha: 'abc' } } };
        }
        return { status: 404, body: {} };
      });
      const again = yield* bot(exists.url);
      yield* again.pushTag(repository, 'app-v1.0.0', 'abc');
      const other = yield* again.pushTag(repository, 'app-v1.0.0', 'def').pipe(Effect.flip);
      expect(other.reason).toBe('The tag app-v1.0.0 exists already on another commit.');
    }).pipe(Effect.scoped),
  );

  it.effect('opens an issue and answers its number', () =>
    Effect.gen(function* () {
      const gitea = yield* fakeGitea((path, method) =>
        method === 'POST' && path === '/repos/owner/app/issues'
          ? { status: 201, body: { number: 41 } }
          : { status: 404, body: {} },
      );
      const missions = yield* bot(gitea.url);
      expect(yield* missions.openIssue(repository, { title: 'Fix it', body: 'Output.' })).toBe(41);
      expect(gitea.seen[0]?.body).toEqual({ title: 'Fix it', body: 'Output.' });
    }).pipe(Effect.scoped),
  );
});

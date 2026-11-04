import { describe, expect, it } from '@effect/vitest';
import {
  GiteaNotConfiguredError,
  GiteaOutbound,
  GiteaUnavailableError,
  IssueNotFoundError,
} from '@pocket-comms/comms-application';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import * as Redacted from 'effect/Redacted';
import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { layerHttp } from './http.js';

// The fixtures have the shape of the local Gitea's API document (version 28.2.0), anonymised:
// two issues and a pull request, and a closed issue.
const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(join(import.meta.dirname, '..', 'testing', 'fixtures', name), 'utf8'));
const listed = fixture('gitea-issues.json') as ReadonlyArray<Record<string, unknown>>;
const closed = fixture('gitea-issue-closed.json');

const TOKEN = 'secret-token-0123456789';

interface Seen {
  readonly method: string | undefined;
  readonly url: string | undefined;
  readonly authorization: string | undefined;
  /** Only for a request with a body. */
  readonly contentType?: string | undefined;
  readonly body?: string;
}

type Route = (
  url: URL,
  method: string | undefined,
) => {
  readonly status: number;
  readonly body: unknown;
  readonly location?: string;
};

// A fake Gitea on a free local port; it answers through `route` and records every request.
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
            seen.push({
              method: request.method,
              url: request.url,
              authorization: request.headers.authorization,
              ...(sent === '' ? {} : { contentType: request.headers['content-type'], body: sent }),
            });
            const { status, body, location } = route(
              new URL(request.url ?? '/', 'http://gitea.test'),
              request.method,
            );
            response.writeHead(status, {
              'content-type': 'application/json',
              ...(location === undefined ? {} : { location }),
            });
            response.end(typeof body === 'string' ? body : JSON.stringify(body));
          });
        });
        server.listen(0, '127.0.0.1', () => {
          const { port } = server.address() as AddressInfo;
          resume(
            Effect.succeed({
              url: `http://127.0.0.1:${port}`,
              seen,
              close: () => void server.close(),
            }),
          );
        });
      },
    ),
    (gitea) => Effect.sync(() => gitea.close()),
  );

const repository = { owner: 'owner', name: 'app' };

const withGitea = <A, E>(
  url: string,
  use: (gitea: GiteaOutbound['Service']) => Effect.Effect<A, E>,
  token: string | null = TOKEN,
) =>
  GiteaOutbound.use(use).pipe(
    Effect.provide(
      layerHttp({
        url,
        token: token === null ? Option.none() : Option.some(Redacted.make(token)),
        hosts: ['gitea'],
      }),
    ),
  );

const issueRoute =
  (pages: ReadonlyArray<unknown>): Route =>
  (url) => {
    if (url.pathname === '/api/v1/repos/owner/app/issues') {
      return { status: 200, body: pages[Number(url.searchParams.get('page')) - 1] ?? [] };
    }
    if (url.pathname === '/api/v1/repos/owner/app/issues/6') return { status: 200, body: closed };
    if (url.pathname === '/api/v1/repos/owner/app/issues/5') {
      return { status: 200, body: listed[0] };
    }
    return { status: 404, body: { message: 'The target couldn’t be found.' } };
  };

describe('Gitea.layerHttp', () => {
  it.effect('names the repository of a remote on this Gitea, by its host or a named host', () =>
    withGitea('http://localhost:3000/', (gitea) =>
      Effect.sync(() => {
        expect(gitea.repositoryOf('gitea:smotastic/pocket-comms.git')).toEqual(
          Option.some({
            owner: 'smotastic',
            name: 'pocket-comms',
            url: 'http://localhost:3000/smotastic/pocket-comms',
          }),
        );
        expect(gitea.repositoryOf('ssh://git@LOCALHOST:2222/a/b.git')).toEqual(
          Option.some({ owner: 'a', name: 'b', url: 'http://localhost:3000/a/b' }),
        );
        expect(gitea.repositoryOf('http://localhost:3000/a/b')).toEqual(
          Option.some({ owner: 'a', name: 'b', url: 'http://localhost:3000/a/b' }),
        );
        expect(gitea.repositoryOf('git@github.com:a/b.git')).toEqual(Option.none());
        expect(gitea.repositoryOf('/srv/a/b')).toEqual(Option.none());
      }),
    ),
  );

  it.live('reads the open issues with GET and the token, and decodes them', () =>
    Effect.gen(function* () {
      const gitea = yield* fakeGitea(issueRoute([listed]));

      const issues = yield* withGitea(gitea.url, (outbound) => outbound.openIssues(repository));

      expect(issues).toEqual([
        {
          number: 5,
          title: 'feat: dark mode',
          body: '## Idea\r\n\r\nA dark theme for the settings.',
          labels: [],
          updatedAt: Date.parse('2026-10-31T18:00:00+01:00'),
          url: 'http://localhost:3000/owner/app/issues/5',
          state: 'open',
          pull: false,
        },
        expect.objectContaining({ number: 4, pull: true }),
        expect.objectContaining({ number: 3, labels: ['bug', 'ui'], body: '' }),
      ]);
      expect(gitea.seen).toEqual([
        {
          method: 'GET',
          url: '/api/v1/repos/owner/app/issues?state=open&type=issues&limit=50&page=1',
          authorization: `token ${TOKEN}`,
        },
      ]);
    }).pipe(Effect.scoped),
  );

  it.live('reads every page until a short one, and stops at 500 issues', () =>
    Effect.gen(function* () {
      const page = (from: number, count: number) =>
        Array.from({ length: count }, (_, index) => ({ ...listed[0], number: from + index }));
      const pages = Array.from({ length: 12 }, (_, index) => page(index * 50 + 1, 50));
      const two = yield* fakeGitea(issueRoute([page(1, 50), page(51, 3)]));
      const many = yield* fakeGitea(issueRoute(pages));

      const short = yield* withGitea(two.url, (outbound) => outbound.openIssues(repository));
      const capped = yield* withGitea(many.url, (outbound) => outbound.openIssues(repository));

      expect(short).toHaveLength(53);
      expect(two.seen).toHaveLength(2);
      expect(capped).toHaveLength(500);
      expect(many.seen).toHaveLength(10);
      expect(many.seen.every((request) => request.method === 'GET')).toBe(true);
    }).pipe(Effect.scoped),
  );

  it.live('reads one issue, and names a missing one', () =>
    Effect.gen(function* () {
      const gitea = yield* fakeGitea(issueRoute([]));

      const found = yield* withGitea(gitea.url, (outbound) => outbound.issue(repository, 6));
      const missing = yield* withGitea(gitea.url, (outbound) =>
        outbound.issue(repository, 9).pipe(Effect.flip),
      );

      expect(found).toEqual(expect.objectContaining({ number: 6, state: 'closed', pull: false }));
      expect(missing).toEqual(new IssueNotFoundError({ number: 9 }));
      expect(gitea.seen.map((request) => request.url)).toEqual([
        '/api/v1/repos/owner/app/issues/6',
        '/api/v1/repos/owner/app/issues/9',
      ]);
    }).pipe(Effect.scoped),
  );

  it.live('closes an issue with one PATCH that sets only its state', () =>
    Effect.gen(function* () {
      const gitea = yield* fakeGitea((url, method) =>
        url.pathname === '/api/v1/repos/owner/app/issues/5' && method === 'PATCH'
          ? { status: 201, body: { ...listed[0], state: 'closed' } }
          : { status: 404, body: { message: 'not found' } },
      );

      yield* withGitea(gitea.url, (outbound) => outbound.closeIssue(repository, 5));

      expect(gitea.seen).toEqual([
        {
          method: 'PATCH',
          url: '/api/v1/repos/owner/app/issues/5',
          authorization: `token ${TOKEN}`,
          contentType: 'application/json',
          body: '{"state":"closed"}',
        },
      ]);
    }).pipe(Effect.scoped),
  );

  it.live('names a missing issue when closing, and passes on a refused token', () =>
    Effect.gen(function* () {
      const missing = yield* fakeGitea(() => ({ status: 404, body: { message: 'not found' } }));
      const readOnly = yield* fakeGitea(() => ({ status: 403, body: { message: 'forbidden' } }));

      const notFound = yield* withGitea(missing.url, (outbound) =>
        outbound.closeIssue(repository, 9).pipe(Effect.flip),
      );
      const refused = yield* withGitea(readOnly.url, (outbound) =>
        outbound.closeIssue(repository, 5).pipe(Effect.flip),
      );

      expect(notFound).toEqual(new IssueNotFoundError({ number: 9 }));
      expect(refused).toEqual(
        new GiteaUnavailableError({ reason: 'Gitea refused the token (403).' }),
      );
      expect(JSON.stringify(refused)).not.toContain(TOKEN);
    }).pipe(Effect.scoped),
  );

  it.live('updates an issue with one PATCH that carries only its title and body', () =>
    Effect.gen(function* () {
      const gitea = yield* fakeGitea((url, method) =>
        url.pathname === '/api/v1/repos/owner/app/issues/5' && method === 'PATCH'
          ? { status: 201, body: { ...listed[0], title: 'Dark mode toggle' } }
          : { status: 404, body: { message: 'not found' } },
      );

      yield* withGitea(gitea.url, (outbound) =>
        outbound.updateIssue(repository, 5, { title: 'Dark mode toggle', body: 'A toggle.' }),
      );

      expect(gitea.seen).toEqual([
        {
          method: 'PATCH',
          url: '/api/v1/repos/owner/app/issues/5',
          authorization: `token ${TOKEN}`,
          contentType: 'application/json',
          body: '{"title":"Dark mode toggle","body":"A toggle."}',
        },
      ]);
    }).pipe(Effect.scoped),
  );

  it.live('names a missing issue when updating, and passes on a refused token', () =>
    Effect.gen(function* () {
      const missing = yield* fakeGitea(() => ({ status: 404, body: { message: 'not found' } }));
      const readOnly = yield* fakeGitea(() => ({ status: 403, body: { message: 'forbidden' } }));
      const text = { title: 'X', body: '' };

      const notFound = yield* withGitea(missing.url, (outbound) =>
        outbound.updateIssue(repository, 9, text).pipe(Effect.flip),
      );
      const refused = yield* withGitea(readOnly.url, (outbound) =>
        outbound.updateIssue(repository, 5, text).pipe(Effect.flip),
      );

      expect(notFound).toEqual(new IssueNotFoundError({ number: 9 }));
      expect(refused).toEqual(
        new GiteaUnavailableError({ reason: 'Gitea refused the token (403).' }),
      );
    }).pipe(Effect.scoped),
  );

  it.live('attaches a picture to an issue with one multipart POST and answers its link', () =>
    Effect.gen(function* () {
      const gitea = yield* fakeGitea((url, method) =>
        url.pathname === '/api/v1/repos/owner/app/issues/5/assets' && method === 'POST'
          ? {
              status: 201,
              body: {
                id: 3,
                name: 'picture-2.png',
                uuid: 'u-1',
                browser_download_url: 'http://gitea.test/attachments/u-1',
              },
            }
          : { status: 404, body: { message: 'not found' } },
      );

      const url = yield* withGitea(gitea.url, (outbound) =>
        outbound.attachImage(repository, 5, {
          name: 'picture-2.png',
          kind: 'png',
          bytes: new TextEncoder().encode('PNGBYTES'),
        }),
      );

      expect(url).toBe('http://gitea.test/attachments/u-1');
      expect(gitea.seen).toHaveLength(1);
      const [seen] = gitea.seen;
      expect(seen?.method).toBe('POST');
      expect(seen?.url).toBe('/api/v1/repos/owner/app/issues/5/assets');
      expect(seen?.authorization).toBe(`token ${TOKEN}`);
      expect(seen?.contentType).toMatch(/^multipart\/form-data; boundary=/u);
      expect(seen?.body).toContain('name="attachment"; filename="picture-2.png"');
      expect(seen?.body).toContain('Content-Type: image/png');
      expect(seen?.body).toContain('PNGBYTES');
    }).pipe(Effect.scoped),
  );

  it.live("names a missing issue when attaching, and gives Gitea's reason for a refusal", () =>
    Effect.gen(function* () {
      const missing = yield* fakeGitea(() => ({ status: 404, body: { message: 'not found' } }));
      const refusing = yield* fakeGitea(() => ({
        status: 422,
        body: { message: 'image/png is not allowed' },
      }));
      const silent = yield* fakeGitea(() => ({ status: 413, body: '' }));
      const picture = { name: 'picture-1.jpg', kind: 'jpeg' as const, bytes: new Uint8Array(3) };

      const notFound = yield* withGitea(missing.url, (outbound) =>
        outbound.attachImage(repository, 9, picture).pipe(Effect.flip),
      );
      const refused = yield* withGitea(refusing.url, (outbound) =>
        outbound.attachImage(repository, 5, picture).pipe(Effect.flip),
      );
      const tooLarge = yield* withGitea(silent.url, (outbound) =>
        outbound.attachImage(repository, 5, picture).pipe(Effect.flip),
      );

      expect(notFound).toEqual(new IssueNotFoundError({ number: 9 }));
      expect(refused).toEqual(
        new GiteaUnavailableError({
          reason: 'Gitea refused picture-1.jpg (422): image/png is not allowed',
        }),
      );
      expect(tooLarge).toEqual(
        new GiteaUnavailableError({ reason: 'Gitea refused picture-1.jpg (413).' }),
      );
    }).pipe(Effect.scoped),
  );

  it.live('creates an issue with one POST that carries only its title and body', () =>
    Effect.gen(function* () {
      const gitea = yield* fakeGitea((url, method) =>
        url.pathname === '/api/v1/repos/owner/app/issues' && method === 'POST'
          ? {
              status: 201,
              body: { ...listed[0], number: 12, html_url: 'http://gitea.test/owner/app/issues/12' },
            }
          : { status: 404, body: { message: 'not found' } },
      );

      const created = yield* withGitea(gitea.url, (outbound) =>
        outbound.createIssue(repository, { title: 'Dark mode', body: 'A toggle.' }),
      );

      expect(created).toEqual({ number: 12, url: 'http://gitea.test/owner/app/issues/12' });
      expect(gitea.seen).toEqual([
        {
          method: 'POST',
          url: '/api/v1/repos/owner/app/issues',
          authorization: `token ${TOKEN}`,
          contentType: 'application/json',
          body: '{"title":"Dark mode","body":"A toggle."}',
        },
      ]);
    }).pipe(Effect.scoped),
  );

  it.live('reports a refused or missing repository when creating an issue', () =>
    Effect.gen(function* () {
      const missing = yield* fakeGitea(() => ({ status: 404, body: { message: 'not found' } }));
      const invalid = yield* fakeGitea(() => ({ status: 422, body: { message: 'invalid' } }));

      const errors = yield* Effect.all([
        withGitea(missing.url, (outbound) =>
          outbound.createIssue(repository, { title: 'X', body: '' }).pipe(Effect.flip),
        ),
        withGitea(invalid.url, (outbound) =>
          outbound.createIssue(repository, { title: 'X', body: '' }).pipe(Effect.flip),
        ),
      ]);

      expect(errors).toEqual([
        new GiteaUnavailableError({
          reason: 'Gitea has no repository owner/app, or the token cannot write to it.',
        }),
        new GiteaUnavailableError({ reason: 'Gitea answered 422.' }),
      ]);
    }).pipe(Effect.scoped),
  );

  const labelRoute =
    (pages: ReadonlyArray<ReadonlyArray<{ id: number; name: string }>>, add = 200): Route =>
    (url, method) => {
      if (url.pathname === '/api/v1/repos/owner/app/labels' && method === 'GET') {
        return { status: 200, body: pages[Number(url.searchParams.get('page')) - 1] ?? [] };
      }
      if (url.pathname === '/api/v1/repos/owner/app/labels' && method === 'POST') {
        return { status: 201, body: { id: 9, name: 'status/in-progress', color: 'e3b341' } };
      }
      if (url.pathname === '/api/v1/repos/owner/app/issues/5/labels' && method === 'POST') {
        return { status: add, body: [] };
      }
      return { status: 404, body: { message: 'not found' } };
    };

  it.live('marks an issue in progress with the label the repository has, in any case', () =>
    Effect.gen(function* () {
      const gitea = yield* fakeGitea(
        labelRoute([
          [
            { id: 1, name: 'bug' },
            { id: 4, name: 'Status/In-Progress' },
          ],
        ]),
      );

      yield* withGitea(gitea.url, (outbound) => outbound.markInProgress(repository, 5));

      expect(gitea.seen).toEqual([
        {
          method: 'GET',
          url: '/api/v1/repos/owner/app/labels?limit=50&page=1',
          authorization: `token ${TOKEN}`,
        },
        {
          method: 'POST',
          url: '/api/v1/repos/owner/app/issues/5/labels',
          authorization: `token ${TOKEN}`,
          contentType: 'application/json',
          body: '{"labels":[4]}',
        },
      ]);
    }).pipe(Effect.scoped),
  );

  it.live('creates the in-progress label when the repository has none, then adds it', () =>
    Effect.gen(function* () {
      const gitea = yield* fakeGitea(labelRoute([[{ id: 1, name: 'bug' }]]));

      yield* withGitea(gitea.url, (outbound) => outbound.markInProgress(repository, 5));

      expect(gitea.seen.map(({ method, url, body }) => [method, url, body])).toEqual([
        ['GET', '/api/v1/repos/owner/app/labels?limit=50&page=1', undefined],
        [
          'POST',
          '/api/v1/repos/owner/app/labels',
          '{"name":"status/in-progress","color":"#e3b341","description":"Being worked on (set by pocket-comms)","exclusive":true}',
        ],
        ['POST', '/api/v1/repos/owner/app/issues/5/labels', '{"labels":[9]}'],
      ]);
    }).pipe(Effect.scoped),
  );

  it.live('looks for the label on every page of labels', () =>
    Effect.gen(function* () {
      const first = Array.from({ length: 50 }, (_, index) => ({
        id: index + 100,
        name: `l${index}`,
      }));
      const gitea = yield* fakeGitea(labelRoute([first, [{ id: 77, name: 'status/in-progress' }]]));

      yield* withGitea(gitea.url, (outbound) => outbound.markInProgress(repository, 5));

      expect(gitea.seen.map(({ method, url, body }) => [method, url, body])).toEqual([
        ['GET', '/api/v1/repos/owner/app/labels?limit=50&page=1', undefined],
        ['GET', '/api/v1/repos/owner/app/labels?limit=50&page=2', undefined],
        ['POST', '/api/v1/repos/owner/app/issues/5/labels', '{"labels":[77]}'],
      ]);
    }).pipe(Effect.scoped),
  );

  it.live('adds nothing when Gitea refuses to create the label', () =>
    Effect.gen(function* () {
      const gitea = yield* fakeGitea((url, method) =>
        method === 'GET' && url.pathname === '/api/v1/repos/owner/app/labels'
          ? { status: 200, body: [] }
          : { status: 403, body: { message: 'forbidden' } },
      );

      const refused = yield* withGitea(gitea.url, (outbound) =>
        outbound.markInProgress(repository, 5).pipe(Effect.flip),
      );

      expect(refused).toEqual(
        new GiteaUnavailableError({ reason: 'Gitea refused the token (403).' }),
      );
      expect(gitea.seen.map(({ method, url }) => `${method} ${url}`)).toEqual([
        'GET /api/v1/repos/owner/app/labels?limit=50&page=1',
        'POST /api/v1/repos/owner/app/labels',
      ]);
    }).pipe(Effect.scoped),
  );

  it.live('names a missing issue when marking, and passes on a refused token', () =>
    Effect.gen(function* () {
      const label = [{ id: 4, name: 'status/in-progress' }];
      const missing = yield* fakeGitea(labelRoute([label], 404));
      const readOnly = yield* fakeGitea(labelRoute([label], 403));

      const notFound = yield* withGitea(missing.url, (outbound) =>
        outbound.markInProgress(repository, 5).pipe(Effect.flip),
      );
      const refused = yield* withGitea(readOnly.url, (outbound) =>
        outbound.markInProgress(repository, 5).pipe(Effect.flip),
      );

      expect(notFound).toEqual(new IssueNotFoundError({ number: 5 }));
      expect(refused).toEqual(
        new GiteaUnavailableError({ reason: 'Gitea refused the token (403).' }),
      );
      expect(JSON.stringify(refused)).not.toContain(TOKEN);
    }).pipe(Effect.scoped),
  );

  it.live('sends nothing without a token', () =>
    Effect.gen(function* () {
      const gitea = yield* fakeGitea(issueRoute([listed]));

      const errors = yield* withGitea(
        gitea.url,
        (outbound) =>
          Effect.all([
            outbound.openIssues(repository).pipe(Effect.flip),
            outbound.issue(repository, 5).pipe(Effect.flip),
            outbound.closeIssue(repository, 5).pipe(Effect.flip),
            outbound.createIssue(repository, { title: 'X', body: '' }).pipe(Effect.flip),
            outbound.markInProgress(repository, 5).pipe(Effect.flip),
            outbound.updateIssue(repository, 5, { title: 'X', body: '' }).pipe(Effect.flip),
          ]),
        null,
      );

      expect(errors).toEqual([
        new GiteaNotConfiguredError(),
        new GiteaNotConfiguredError(),
        new GiteaNotConfiguredError(),
        new GiteaNotConfiguredError(),
        new GiteaNotConfiguredError(),
        new GiteaNotConfiguredError(),
      ]);
      expect(gitea.seen).toEqual([]);
    }).pipe(Effect.scoped),
  );

  it.live.each<readonly [number, unknown, string]>([
    [401, { message: 'token is required' }, 'Gitea refused the token (401).'],
    [403, { message: 'forbidden' }, 'Gitea refused the token (403).'],
    [
      404,
      { message: 'not found' },
      'Gitea has no repository owner/app, or the token cannot read it.',
    ],
    [500, 'oops', 'Gitea answered 500.'],
    [200, '<html>', 'Gitea answered in an unknown shape.'],
    [200, [{ number: 'x' }], 'Gitea answered in an unknown shape.'],
  ])('reports %s as unavailable with a reason', ([status, body, reason]) =>
    Effect.gen(function* () {
      const gitea = yield* fakeGitea(() => ({ status, body }));

      const error = yield* withGitea(gitea.url, (outbound) =>
        outbound.openIssues(repository).pipe(Effect.flip),
      );

      expect(error).toEqual(new GiteaUnavailableError({ reason }));
    }).pipe(Effect.scoped),
  );

  it.live('follows no redirect, so the token never goes elsewhere', () =>
    Effect.gen(function* () {
      const elsewhere = yield* fakeGitea(issueRoute([listed]));
      const redirecting = yield* fakeGitea((url) => ({
        status: 302,
        body: '',
        location: `${elsewhere.url}${url.pathname}${url.search}`,
      }));

      const errors = yield* withGitea(redirecting.url, (outbound) =>
        Effect.all([
          outbound.openIssues(repository).pipe(Effect.flip),
          outbound.closeIssue(repository, 5).pipe(Effect.flip),
        ]),
      );

      const redirected = new GiteaUnavailableError({
        reason:
          'Gitea answered with a redirect (302); set COMMS_GITEA_URL to the address it names.',
      });
      expect(errors).toEqual([redirected, redirected]);
      expect(elsewhere.seen).toEqual([]);
    }).pipe(Effect.scoped),
  );

  it.live('reports an unreachable Gitea without the token', () =>
    Effect.gen(function* () {
      const gitea = yield* fakeGitea(issueRoute([]));
      gitea.close();

      const error = yield* withGitea(gitea.url, (outbound) =>
        outbound.openIssues(repository).pipe(Effect.flip),
      );

      expect(error._tag).toBe('GiteaUnavailableError');
      expect(error._tag === 'GiteaUnavailableError' && error.reason).toContain(
        `Gitea cannot be reached at ${gitea.url}`,
      );
      expect(JSON.stringify(error)).not.toContain(TOKEN);
    }).pipe(Effect.scoped),
  );
});

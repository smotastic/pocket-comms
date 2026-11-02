import {
  GiteaNotConfiguredError,
  GiteaOutbound,
  GiteaUnavailableError,
  IssueNotFoundError,
} from '@pocket-comms/comms-application';
import { parseRemote, type GiteaRepository, type Issue } from '@pocket-comms/comms-domain';
import type * as Duration from 'effect/Duration';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import * as Redacted from 'effect/Redacted';
import * as Schema from 'effect/Schema';

// Gitea's REST API (`/api/v1`). It reads with `GET`, and its one write is the `PATCH` that closes
// an issue (spec 010). The token travels in the `Authorization` header and nowhere else; no
// reason, log line or span carries it (spec 006, requirement 2).

export interface HttpOptions {
  /** The Gitea server, such as `http://localhost:3000`. */
  readonly url: string;
  /** A token that can write issues and read repositories; none means not configured. */
  readonly token: Option.Option<Redacted.Redacted<string>>;
  /** Further host names of the server in git remotes, such as the SSH alias `gitea`. */
  readonly hosts: ReadonlyArray<string>;
  /** How long one request may take. Default 10 seconds. */
  readonly timeout?: Duration.Input;
}

const PAGE_SIZE = 50;
const MAX_ISSUES = 500;

const GiteaIssue = Schema.Struct({
  number: Schema.Int,
  title: Schema.String,
  body: Schema.optional(Schema.NullOr(Schema.String)),
  state: Schema.String,
  html_url: Schema.String,
  updated_at: Schema.String,
  labels: Schema.optional(Schema.NullOr(Schema.Array(Schema.Struct({ name: Schema.String })))),
  pull_request: Schema.optional(Schema.NullOr(Schema.Unknown)),
});
const decodeIssue = Schema.decodeUnknownEffect(GiteaIssue);
const decodeIssues = Schema.decodeUnknownEffect(Schema.Array(GiteaIssue));

const toIssue = (issue: typeof GiteaIssue.Type): Issue => ({
  number: issue.number,
  title: issue.title,
  body: issue.body ?? '',
  labels: (issue.labels ?? []).map((label) => label.name),
  updatedAt: Date.parse(issue.updated_at),
  url: issue.html_url,
  state: issue.state === 'open' ? 'open' : 'closed',
  pull: issue.pull_request !== undefined && issue.pull_request !== null,
});

export const layerHttp = ({ url, token, hosts, timeout = '10 seconds' }: HttpOptions) => {
  const base = url.replace(/\/+$/u, '');
  const ownHosts = new Set(
    [URL.canParse(base) ? new URL(base).hostname : '', ...hosts]
      .map((host) => host.trim().toLowerCase())
      .filter((host) => host !== ''),
  );
  const unavailable = (reason: string) => new GiteaUnavailableError({ reason });
  const unknownShape = () => unavailable('Gitea answered in an unknown shape.');

  // One request; a `404` is `undefined`, so the caller names what was missing.
  const send = (method: 'GET' | 'PATCH', path: string, body?: unknown) =>
    Effect.gen(function* () {
      if (Option.isNone(token)) return yield* new GiteaNotConfiguredError();
      const headers = {
        accept: 'application/json',
        authorization: `token ${Redacted.value(token.value)}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      };
      const response = yield* Effect.tryPromise({
        // A redirect is not followed, so the token is never sent to another address.
        try: (signal) =>
          fetch(`${base}/api/v1${path}`, {
            method,
            headers,
            signal,
            redirect: 'manual',
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          }),
        catch: (error) =>
          unavailable(
            `Gitea cannot be reached at ${base}: ${error instanceof Error ? error.message : 'the request failed'}.`,
          ),
      }).pipe(
        Effect.timeoutOrElse({
          duration: timeout,
          orElse: () => Effect.fail(unavailable(`Gitea did not answer in time at ${base}.`)),
        }),
      );
      if (response.status === 404) return undefined;
      if (response.status === 401 || response.status === 403) {
        return yield* unavailable(`Gitea refused the token (${response.status}).`);
      }
      if (response.status >= 300 && response.status < 400) {
        return yield* unavailable(
          `Gitea answered with a redirect (${response.status}); set COMMS_GITEA_URL to the address it names.`,
        );
      }
      if (!response.ok) return yield* unavailable(`Gitea answered ${response.status}.`);
      return response;
    });

  const get = (path: string) =>
    send('GET', path).pipe(
      Effect.flatMap((response) =>
        response === undefined
          ? Effect.succeed(undefined)
          : Effect.tryPromise({
              try: () => response.json() as Promise<unknown>,
              catch: unknownShape,
            }),
      ),
    );

  const repositoryPath = ({ owner, name }: GiteaRepository) =>
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;

  const openIssues = (repository: GiteaRepository) =>
    Effect.gen(function* () {
      const issues: Array<Issue> = [];
      for (let page = 1; issues.length < MAX_ISSUES; page += 1) {
        const query = `state=open&type=issues&limit=${PAGE_SIZE}&page=${page}`;
        const answer = yield* get(`${repositoryPath(repository)}/issues?${query}`);
        if (answer === undefined) {
          return yield* unavailable(
            `Gitea has no repository ${repository.owner}/${repository.name}, or the token cannot read it.`,
          );
        }
        const decoded = yield* decodeIssues(answer).pipe(Effect.mapError(unknownShape));
        issues.push(...decoded.map(toIssue));
        if (decoded.length < PAGE_SIZE) break;
      }
      return issues.slice(0, MAX_ISSUES);
    }).pipe(
      Effect.withSpan('Gitea.openIssues', {
        attributes: { owner: repository.owner, repository: repository.name },
      }),
    );

  const issue = (repository: GiteaRepository, number: number) =>
    Effect.gen(function* () {
      const answer = yield* get(`${repositoryPath(repository)}/issues/${number}`);
      if (answer === undefined) return yield* new IssueNotFoundError({ number });
      const decoded = yield* decodeIssue(answer).pipe(Effect.mapError(unknownShape));
      return toIssue(decoded);
    }).pipe(
      Effect.withSpan('Gitea.issue', {
        attributes: { owner: repository.owner, repository: repository.name, number },
      }),
    );

  // The body sets the state only, so no other field of the issue changes.
  const closeIssue = (repository: GiteaRepository, number: number) =>
    Effect.gen(function* () {
      const answer = yield* send('PATCH', `${repositoryPath(repository)}/issues/${number}`, {
        state: 'closed',
      });
      if (answer === undefined) return yield* new IssueNotFoundError({ number });
      // Gitea answers with the issue, which the app does not need.
      yield* Effect.promise(() => answer.body?.cancel() ?? Promise.resolve());
    }).pipe(
      Effect.withSpan('Gitea.closeIssue', {
        attributes: { owner: repository.owner, repository: repository.name, number },
      }),
    );

  const repositoryOf = (remoteUrl: string) => {
    const remote = parseRemote(remoteUrl);
    return remote === undefined || !ownHosts.has(remote.host)
      ? Option.none()
      : Option.some({
          owner: remote.owner,
          name: remote.name,
          url: `${base}/${remote.owner}/${remote.name}`,
        });
  };

  return Layer.succeed(
    GiteaOutbound,
    GiteaOutbound.of({ repositoryOf, openIssues, issue, closeIssue }),
  );
};

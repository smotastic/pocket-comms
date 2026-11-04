import {
  GiteaNotConfiguredError,
  GiteaOutbound,
  GiteaUnavailableError,
  IssueNotFoundError,
  type IssuePicture,
} from '@pocket-comms/comms-application';
import {
  IN_PROGRESS_LABEL,
  IN_PROGRESS_LABEL_STYLE,
  isInProgressLabel,
  parseRemote,
  type GiteaRepository,
  type ImageKind,
  type Issue,
  type IssueText,
} from '@pocket-comms/comms-domain';
import type * as Duration from 'effect/Duration';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import * as Redacted from 'effect/Redacted';
import * as Schema from 'effect/Schema';

// Gitea's REST API (`/api/v1`). It reads with `GET`, and writes only the `PATCH` that closes an
// issue (spec 010), the `POST` that creates one (spec 013), the `POST`s that create the
// in-progress label and add it to an issue (spec 015), the `PATCH` of an issue's title and body
// (spec 022) and the multipart `POST` that attaches a picture to an issue (spec 023). It never
// replaces or removes labels or attachments. The
// token travels in the `Authorization` header and nowhere else; no reason, log line or span
// carries it (spec 006, requirement 2).

export interface HttpOptions {
  /** The Gitea server, such as `http://localhost:3000`. */
  readonly url: string;
  /** A token that can write issues and read repositories; none means not configured. */
  readonly token: Option.Option<Redacted.Redacted<string>>;
  /** Further host names of the server in git remotes, such as the SSH alias `gitea`. */
  readonly hosts: ReadonlyArray<string>;
  /** How long one request may take. Default 10 seconds. */
  readonly timeout?: Duration.Input;
  /** How long one picture upload may take. Default 60 seconds. */
  readonly uploadTimeout?: Duration.Input;
}

const PAGE_SIZE = 50;
const MAX_ISSUES = 500;
const MAX_LABEL_PAGES = 10;

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
const GiteaLabel = Schema.Struct({ id: Schema.Int, name: Schema.String });
const decodeLabel = Schema.decodeUnknownEffect(GiteaLabel);
const decodeLabels = Schema.decodeUnknownEffect(Schema.Array(GiteaLabel));
const decodeIssue = Schema.decodeUnknownEffect(GiteaIssue);
const decodeIssues = Schema.decodeUnknownEffect(Schema.Array(GiteaIssue));
const decodeAttachment = Schema.decodeUnknownEffect(
  Schema.Struct({ browser_download_url: Schema.String }),
);
const decodeMessage = Schema.decodeUnknownOption(Schema.Struct({ message: Schema.String }));

const MEDIA_TYPES: Record<ImageKind, string> = { jpeg: 'image/jpeg', png: 'image/png' };

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

export const layerHttp = ({
  url,
  token,
  hosts,
  timeout = '10 seconds',
  uploadTimeout = '60 seconds',
}: HttpOptions) => {
  const base = url.replace(/\/+$/u, '');
  const ownHosts = new Set(
    [URL.canParse(base) ? new URL(base).hostname : '', ...hosts]
      .map((host) => host.trim().toLowerCase())
      .filter((host) => host !== ''),
  );
  const unavailable = (reason: string) => new GiteaUnavailableError({ reason });
  const unknownShape = () => unavailable('Gitea answered in an unknown shape.');

  /**
   * One request; a `404` is `undefined`, so the caller names what was missing. A form is sent as
   * multipart, anything else as JSON. `refused` words another failed answer.
   */
  const send = (
    method: 'GET' | 'PATCH' | 'POST',
    path: string,
    body?: unknown,
    refused: (response: Response) => Effect.Effect<string> = (response) =>
      Effect.succeed(`Gitea answered ${response.status}.`),
    deadline: Duration.Input = timeout,
  ) =>
    Effect.gen(function* () {
      if (Option.isNone(token)) return yield* new GiteaNotConfiguredError();
      const form = body instanceof FormData;
      // The browser sets a form's content type itself, with its boundary.
      const headers = {
        accept: 'application/json',
        authorization: `token ${Redacted.value(token.value)}`,
        ...(body === undefined || form ? {} : { 'content-type': 'application/json' }),
      };
      const response = yield* Effect.tryPromise({
        // A redirect is not followed, so the token is never sent to another address.
        try: (signal) =>
          fetch(`${base}/api/v1${path}`, {
            method,
            headers,
            signal,
            redirect: 'manual',
            ...(body === undefined ? {} : { body: form ? body : JSON.stringify(body) }),
          }),
        catch: (error) =>
          unavailable(
            `Gitea cannot be reached at ${base}: ${error instanceof Error ? error.message : 'the request failed'}.`,
          ),
      }).pipe(
        Effect.timeoutOrElse({
          duration: deadline,
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
      if (!response.ok) return yield* Effect.flatMap(refused(response), unavailable);
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

  // The body holds the title and the body only, so the issue's state, labels, assignees and
  // milestone stay as they are.
  const updateIssue = (repository: GiteaRepository, number: number, { title, body }: IssueText) =>
    Effect.gen(function* () {
      const answer = yield* send('PATCH', `${repositoryPath(repository)}/issues/${number}`, {
        title,
        body,
      });
      if (answer === undefined) return yield* new IssueNotFoundError({ number });
      // Gitea answers with the issue, which the app does not need.
      yield* Effect.promise(() => answer.body?.cancel() ?? Promise.resolve());
    }).pipe(
      Effect.withSpan('Gitea.updateIssue', {
        attributes: { owner: repository.owner, repository: repository.name, number },
      }),
    );

  // The body holds the title and the body only, so no label, assignee or milestone is set.
  const createIssue = (
    repository: GiteaRepository,
    { title, body }: { readonly title: string; readonly body: string },
  ) =>
    Effect.gen(function* () {
      const answer = yield* send('POST', `${repositoryPath(repository)}/issues`, { title, body });
      if (answer === undefined) {
        return yield* unavailable(
          `Gitea has no repository ${repository.owner}/${repository.name}, or the token cannot write to it.`,
        );
      }
      const json = yield* Effect.tryPromise({
        try: () => answer.json() as Promise<unknown>,
        catch: unknownShape,
      });
      const created = yield* decodeIssue(json).pipe(Effect.mapError(unknownShape));
      return { number: created.number, url: created.html_url };
    }).pipe(
      Effect.withSpan('Gitea.createIssue', {
        attributes: { owner: repository.owner, repository: repository.name },
      }),
    );

  const json = (response: Response) =>
    Effect.tryPromise({ try: () => response.json() as Promise<unknown>, catch: unknownShape });

  // The id of the repository's in-progress label, found by name in any case or else created.
  const inProgressLabel = (repository: GiteaRepository) =>
    Effect.gen(function* () {
      for (let page = 1; page <= MAX_LABEL_PAGES; page += 1) {
        const answer = yield* get(
          `${repositoryPath(repository)}/labels?limit=${PAGE_SIZE}&page=${page}`,
        );
        if (answer === undefined) {
          return yield* unavailable(
            `Gitea has no repository ${repository.owner}/${repository.name}, or the token cannot read it.`,
          );
        }
        const labels = yield* decodeLabels(answer).pipe(Effect.mapError(unknownShape));
        const found = labels.find((label) => isInProgressLabel(label.name));
        if (found !== undefined) return found.id;
        if (labels.length < PAGE_SIZE) break;
      }
      const created = yield* send('POST', `${repositoryPath(repository)}/labels`, {
        name: IN_PROGRESS_LABEL,
        ...IN_PROGRESS_LABEL_STYLE,
      });
      if (created === undefined) {
        return yield* unavailable(
          `Gitea has no repository ${repository.owner}/${repository.name}, or the token cannot write to it.`,
        );
      }
      const label = yield* json(created).pipe(
        Effect.flatMap((body) => decodeLabel(body).pipe(Effect.mapError(unknownShape))),
      );
      return label.id;
    });

  // Adding with `POST` keeps the issue's other labels; a `PUT` would replace them.
  const markInProgress = (repository: GiteaRepository, number: number) =>
    Effect.gen(function* () {
      const id = yield* inProgressLabel(repository);
      const answer = yield* send('POST', `${repositoryPath(repository)}/issues/${number}/labels`, {
        labels: [id],
      });
      if (answer === undefined) return yield* new IssueNotFoundError({ number });
      // Gitea answers with the issue's labels, which the app does not need.
      yield* Effect.promise(() => answer.body?.cancel() ?? Promise.resolve());
    }).pipe(
      Effect.withSpan('Gitea.markInProgress', {
        attributes: { owner: repository.owner, repository: repository.name, number },
      }),
    );

  // Gitea's reason, such as a type it does not allow, is shown to the owner (spec 023).
  const pictureRefused = (name: string) => (response: Response) =>
    Effect.promise(() => response.json().catch(() => undefined)).pipe(
      Effect.map((answer) =>
        Option.match(decodeMessage(answer), {
          onNone: () => `Gitea refused ${name} (${response.status}).`,
          onSome: ({ message }) => `Gitea refused ${name} (${response.status}): ${message}`,
        }),
      ),
    );

  // An attachment only adds a file to the issue; its title, body and labels stay as they are.
  const attachImage = (repository: GiteaRepository, number: number, picture: IssuePicture) =>
    Effect.gen(function* () {
      const form = new FormData();
      form.append(
        'attachment',
        new Blob([picture.bytes.slice()], { type: MEDIA_TYPES[picture.kind] }),
        picture.name,
      );
      const answer = yield* send(
        'POST',
        `${repositoryPath(repository)}/issues/${number}/assets`,
        form,
        pictureRefused(picture.name),
        uploadTimeout,
      );
      if (answer === undefined) return yield* new IssueNotFoundError({ number });
      const attachment = yield* json(answer).pipe(
        Effect.flatMap((body) => decodeAttachment(body).pipe(Effect.mapError(unknownShape))),
      );
      return attachment.browser_download_url;
    }).pipe(
      Effect.withSpan('Gitea.attachImage', {
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
    GiteaOutbound.of({
      repositoryOf,
      openIssues,
      issue,
      closeIssue,
      markInProgress,
      createIssue,
      updateIssue,
      attachImage,
    }),
  );
};

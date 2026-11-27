import {
  GiteaNotConfiguredError,
  GiteaOutbound,
  GiteaUnavailableError,
  IssueNotFoundError,
  PullRequestNotFoundError,
  type IssueImage,
  type PullRequestAddress,
} from '@pocket-comms/comms-application';
import {
  IN_PROGRESS_LABEL,
  IN_PROGRESS_LABEL_STYLE,
  isInProgressLabel,
  parsePullRequestPath,
  parseRemote,
  pullRequestState,
  type ChangedFile,
  type ChangedFileKind,
  type GiteaRepository,
  type ImageKind,
  type Issue,
  type IssueText,
  type PullRequestRef,
  type CiRun,
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
// (spec 022) and the multipart `POST` that attaches a image to an issue (spec 023). It reads pull
// requests, their diff and their changed files for the agents' attached pull requests (spec 031). It never
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
  /** How long one image upload may take. Default 60 seconds. */
  readonly uploadTimeout?: Duration.Input;
  /** How long reading a pull request's diff may take, once Gitea answered. Default 30 seconds. */
  readonly diffTimeout?: Duration.Input;
}

const PAGE_SIZE = 50;
const MAX_ISSUES = 500;
const MAX_LABEL_PAGES = 10;
/** Gitea lists at most this many changed files of a pull request. */
const MAX_FILES = 3000;

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
const GiteaPullRequest = Schema.Struct({
  title: Schema.String,
  state: Schema.String,
  merged: Schema.optional(Schema.NullOr(Schema.Boolean)),
  html_url: Schema.String,
});
const GiteaChangedFile = Schema.Struct({
  filename: Schema.String,
  previous_filename: Schema.optional(Schema.NullOr(Schema.String)),
  status: Schema.String,
  additions: Schema.Int,
  deletions: Schema.Int,
});
const decodePullRequest = Schema.decodeUnknownEffect(GiteaPullRequest);
const decodeChangedFiles = Schema.decodeUnknownEffect(Schema.Array(GiteaChangedFile));

// Gitea says `changed` for a modified file.
const FILE_KINDS: Readonly<Record<string, ChangedFileKind>> = {
  added: 'added',
  deleted: 'deleted',
  renamed: 'renamed',
};

const toChangedFile = (file: typeof GiteaChangedFile.Type): ChangedFile => {
  const kind = FILE_KINDS[file.status] ?? 'modified';
  const previous = file.previous_filename ?? undefined;
  return {
    path: file.filename,
    ...(kind === 'renamed' && previous !== undefined && previous !== ''
      ? { previousPath: previous }
      : {}),
    kind,
    additions: file.additions,
    deletions: file.deletions,
    // The file list carries no lines; it stands in for a diff too large to read.
    shown: { kind: 'too-large' },
  };
};

/** The body as text, or none once it is longer than `maxBytes`; the rest is not read. */
const textUpTo = async (
  response: Response,
  maxBytes: number,
  signal: AbortSignal,
): Promise<string | undefined> => {
  const reader = response.body?.getReader();
  if (reader === undefined) return '';
  // An interrupted read, such as one past its deadline, stops the download too.
  signal.addEventListener('abort', () => void reader.cancel().catch(() => undefined), {
    once: true,
  });
  const chunks: Array<Uint8Array> = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return undefined;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
};

const GiteaLabel = Schema.Struct({ id: Schema.Int, name: Schema.String });
const decodeLabel = Schema.decodeUnknownEffect(GiteaLabel);
const decodeRepository = Schema.decodeUnknownEffect(
  Schema.Struct({ default_branch: Schema.String }),
);
const GiteaEntry = Schema.Struct({ name: Schema.String });
const decodeEntries = Schema.decodeUnknownEffect(
  Schema.Union([Schema.Array(GiteaEntry), GiteaEntry]),
);
const decodeRuns = Schema.decodeUnknownEffect(
  Schema.Struct({
    workflow_runs: Schema.NullOr(
      Schema.Array(
        Schema.Struct({ status: Schema.String, conclusion: Schema.optional(Schema.String) }),
      ),
    ),
  }),
);

const decodeTagRuns = Schema.decodeUnknownEffect(
  Schema.Struct({
    workflow_runs: Schema.NullOr(
      Schema.Array(
        Schema.Struct({
          path: Schema.optional(Schema.String),
          status: Schema.String,
          conclusion: Schema.optional(Schema.String),
        }),
      ),
    ),
  }),
);

/** The most of a file preflight reads, such as a `package.json`. */
const MAX_FILE_BYTES = 256 * 1024;
/** The push runs preflight looks back on. */
const RUNS_PAGE = 20;
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
  diffTimeout = '30 seconds',
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

  // A path's segments are encoded one by one, so its slashes stay.
  const filePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');

  const defaultBranch = (repository: GiteaRepository) =>
    Effect.gen(function* () {
      const answer = yield* get(repositoryPath(repository));
      if (answer === undefined) return Option.none<string>();
      const decoded = yield* decodeRepository(answer).pipe(Effect.mapError(unknownShape));
      return Option.some(decoded.default_branch);
    }).pipe(Effect.withSpan('Gitea.defaultBranch'));

  const fileText = (repository: GiteaRepository, ref: string, path: string) =>
    Effect.gen(function* () {
      const answer = yield* send(
        'GET',
        `${repositoryPath(repository)}/raw/${filePath(path)}?ref=${encodeURIComponent(ref)}`,
      );
      if (answer === undefined) return Option.none<string>();
      const text = yield* Effect.tryPromise({
        try: (signal) => textUpTo(answer, MAX_FILE_BYTES, signal),
        catch: unknownShape,
      });
      if (text === undefined) {
        return yield* unavailable(`${path} on ${ref} is longer than Gitea reads for preflight.`);
      }
      return Option.some(text);
    }).pipe(Effect.withSpan('Gitea.fileText'));

  const entryNames = (repository: GiteaRepository, ref: string, path: string) =>
    Effect.gen(function* () {
      const answer = yield* get(
        `${repositoryPath(repository)}/contents/${filePath(path)}?ref=${encodeURIComponent(ref)}`,
      );
      if (answer === undefined) return [];
      const decoded = yield* decodeEntries(answer).pipe(Effect.mapError(unknownShape));
      const entries: ReadonlyArray<{ readonly name: string }> =
        'name' in decoded ? [decoded] : decoded;
      return entries.map((entry) => entry.name);
    }).pipe(Effect.withSpan('Gitea.entryNames'));

  const pushRuns = (repository: GiteaRepository, branch: string) =>
    Effect.gen(function* () {
      const query = `branch=${encodeURIComponent(branch)}&event=push&limit=${RUNS_PAGE}`;
      const answer = yield* get(`${repositoryPath(repository)}/actions/runs?${query}`);
      if (answer === undefined) return Option.none<ReadonlyArray<CiRun>>();
      const decoded = yield* decodeRuns(answer).pipe(Effect.mapError(unknownShape));
      return Option.some<ReadonlyArray<CiRun>>(
        (decoded.workflow_runs ?? []).map(({ status, conclusion }) => ({
          status,
          ...(conclusion === undefined ? {} : { conclusion }),
        })),
      );
    }).pipe(Effect.withSpan('Gitea.pushRuns'));

  // Gitea names a tag's run by its path, `<workflow>@refs/tags/<tag>`; the newest runs come first.
  const tagRun = (repository: GiteaRepository, workflow: string, tag: string) =>
    Effect.gen(function* () {
      const answer = yield* get(`${repositoryPath(repository)}/actions/runs?event=push&limit=50`);
      if (answer === undefined) return Option.none<CiRun>();
      const decoded = yield* decodeTagRuns(answer).pipe(Effect.mapError(unknownShape));
      const run = (decoded.workflow_runs ?? []).find(
        (each) => each.path === `${workflow}@refs/tags/${tag}`,
      );
      return run === undefined
        ? Option.none<CiRun>()
        : Option.some<CiRun>({
            status: run.status,
            ...(run.conclusion === undefined ? {} : { conclusion: run.conclusion }),
          });
    }).pipe(Effect.withSpan('Gitea.tagRun'));

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
  const imageRefused = (name: string) => (response: Response) =>
    Effect.promise(() => response.json().catch(() => undefined)).pipe(
      Effect.map((answer) =>
        Option.match(decodeMessage(answer), {
          onNone: () => `Gitea refused ${name} (${response.status}).`,
          onSome: ({ message }) => `Gitea refused ${name} (${response.status}): ${message}`,
        }),
      ),
    );

  // An attachment only adds a file to the issue; its title, body and labels stay as they are.
  const attachImage = (repository: GiteaRepository, number: number, image: IssueImage) =>
    Effect.gen(function* () {
      const form = new FormData();
      form.append(
        'attachment',
        new Blob([image.bytes.slice()], { type: MEDIA_TYPES[image.kind] }),
        image.name,
      );
      const answer = yield* send(
        'POST',
        `${repositoryPath(repository)}/issues/${number}/assets`,
        form,
        imageRefused(image.name),
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

  const pullRequestPath = ({ owner, name, number }: PullRequestRef) =>
    `${repositoryPath({ owner, name })}/pulls/${number}`;
  const pullRequestSpan = (span: string, ref: PullRequestRef) =>
    Effect.withSpan(`Gitea.${span}`, {
      attributes: { owner: ref.owner, repository: ref.name, number: ref.number },
    });
  const notFound = (ref: PullRequestRef) =>
    new PullRequestNotFoundError({ owner: ref.owner, name: ref.name, number: ref.number });

  const basePath = URL.canParse(base) ? new URL(base).pathname.replace(/\/+$/u, '') : '';

  const pullRequestOf = (address: string): PullRequestAddress => {
    if (!URL.canParse(address)) return { _tag: 'NotAPullRequest' };
    const url = new URL(address);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return { _tag: 'NotAPullRequest' };
    if (!ownHosts.has(url.hostname.toLowerCase())) return { _tag: 'OtherHost' };
    return Option.match(parsePullRequestPath(url.pathname, basePath), {
      onNone: (): PullRequestAddress => ({ _tag: 'NotAPullRequest' }),
      onSome: (ref): PullRequestAddress => ({ _tag: 'PullRequest', ref }),
    });
  };

  const pullRequest = (ref: PullRequestRef) =>
    Effect.gen(function* () {
      const answer = yield* get(pullRequestPath(ref));
      if (answer === undefined) return yield* notFound(ref);
      const decoded = yield* decodePullRequest(answer).pipe(Effect.mapError(unknownShape));
      return {
        title: decoded.title,
        state: pullRequestState(decoded.state, decoded.merged === true),
        url: decoded.html_url,
      };
    }).pipe(pullRequestSpan('pullRequest', ref));

  const pullRequestDiff = (ref: PullRequestRef, maxBytes: number) =>
    Effect.gen(function* () {
      const answer = yield* send('GET', `${pullRequestPath(ref)}.diff`);
      if (answer === undefined) return yield* notFound(ref);
      const text = yield* Effect.tryPromise({
        try: (signal) => textUpTo(answer, maxBytes, signal),
        catch: () => unavailable('Gitea stopped sending the diff.'),
      }).pipe(
        Effect.timeoutOrElse({
          duration: diffTimeout,
          orElse: () => Effect.fail(unavailable('Gitea did not send the whole diff in time.')),
        }),
      );
      return Option.fromNullishOr(text);
    }).pipe(pullRequestSpan('pullRequestDiff', ref));

  const pullRequestFiles = (ref: PullRequestRef) =>
    Effect.gen(function* () {
      const files: Array<ChangedFile> = [];
      for (let page = 1; files.length < MAX_FILES; page += 1) {
        const answer = yield* get(`${pullRequestPath(ref)}/files?limit=${PAGE_SIZE}&page=${page}`);
        if (answer === undefined) return yield* notFound(ref);
        const decoded = yield* decodeChangedFiles(answer).pipe(Effect.mapError(unknownShape));
        files.push(...decoded.map(toChangedFile));
        if (decoded.length < PAGE_SIZE) break;
      }
      return files.slice(0, MAX_FILES);
    }).pipe(pullRequestSpan('pullRequestFiles', ref));

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
      defaultBranch,
      fileText,
      entryNames,
      pushRuns,
      tagRun,
      openIssues,
      issue,
      closeIssue,
      markInProgress,
      createIssue,
      updateIssue,
      attachImage,
      pullRequestOf,
      pullRequest,
      pullRequestDiff,
      pullRequestFiles,
    }),
  );
};

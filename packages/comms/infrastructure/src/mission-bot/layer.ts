import { MissionBotError, MissionBotOutbound } from '@pocket-comms/comms-application';
import {
  IN_PROGRESS_LABEL,
  IN_PROGRESS_LABEL_STYLE,
  isInProgressLabel,
  LANE_LABEL_STYLE,
  laneLabel,
  LANES,
  type BotFacts,
  type GiteaRepository,
  type Lane,
} from '@pocket-comms/comms-domain';
import type * as Duration from 'effect/Duration';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import * as Redacted from 'effect/Redacted';
import * as Schema from 'effect/Schema';
import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gitEnvironment } from '../repositories/git.js';

// The mission bot (spec 035, ADR 0019): Gitea's REST API with the bot's own token, and git's
// config of a mission's worktree. On Gitea it writes only labels and comments on issues. In git it
// writes the repository's `extensions.worktreeConfig` once, and everything else with
// `config --worktree`, so the owner's checkout and other worktrees keep their identity. The token
// travels in the `Authorization` header and in the credential file (mode 600) the worktree's git
// reads, and nowhere else.

export interface MissionBotOptions {
  /** The Gitea server, such as `http://localhost:3000`. */
  readonly url: string;
  /** The bot's token; none means missions are not set up. */
  readonly token: Option.Option<Redacted.Redacted<string>>;
  /** The server's state folder; the credential file goes in its `mission` folder. */
  readonly stateDir: string;
  /** The Claude settings file of a mission's agent. */
  readonly settingsPath: string;
  /** How long one request may take. Default 10 seconds. */
  readonly timeout?: Duration.Input;
}

const PAGE_SIZE = 50;
const MAX_LABEL_PAGES = 10;
const NO_TOKEN = 'Missions have no bot token (COMMS_MISSION_GITEA_TOKEN).';

const Label = Schema.Struct({ id: Schema.Number, name: Schema.String });
const decodeLabels = Schema.decodeUnknownEffect(Schema.Array(Label));
const decodeLabel = Schema.decodeUnknownEffect(Label);
const decodeTag = Schema.decodeUnknownEffect(
  Schema.Struct({ commit: Schema.Struct({ sha: Schema.String }) }),
);
const decodeNumber = Schema.decodeUnknownEffect(Schema.Struct({ number: Schema.Number }));
const decodeUser = Schema.decodeUnknownEffect(
  Schema.Struct({ login: Schema.String, email: Schema.optional(Schema.String) }),
);
const decodeRepository = Schema.decodeUnknownEffect(
  Schema.Struct({
    permissions: Schema.optional(Schema.Struct({ push: Schema.optional(Schema.Boolean) })),
  }),
);

const runGit = (cwd: string, args: ReadonlyArray<string>) =>
  Effect.callback<void, MissionBotError>((resume) => {
    const child = execFile(
      'git',
      [...args],
      { cwd, timeout: 10_000, env: gitEnvironment(process.env) },
      (error, _stdout, stderr) => {
        resume(
          error === null
            ? Effect.void
            : Effect.fail(
                new MissionBotError({
                  reason: `git ${args.slice(0, 2).join(' ')} failed: ${(stderr || error.message).trim()}`,
                }),
              ),
        );
      },
    );
    return Effect.sync(() => void child.kill());
  });

export const layer = ({
  url,
  token,
  stateDir,
  settingsPath,
  timeout = '10 seconds',
}: MissionBotOptions) => {
  const base = url.replace(/\/+$/u, '');
  const fail = (reason: string) => new MissionBotError({ reason });
  const repositoryPath = ({ owner, name }: GiteaRepository) =>
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;

  /** One request as the bot, whatever Gitea answers. */
  const request = (method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown) =>
    Effect.gen(function* () {
      if (Option.isNone(token)) return yield* fail(NO_TOKEN);
      return yield* Effect.tryPromise({
        // A redirect is not followed, so the token is never sent to another address.
        try: (signal) =>
          fetch(`${base}/api/v1${path}`, {
            method,
            signal,
            redirect: 'manual',
            headers: {
              accept: 'application/json',
              authorization: `token ${Redacted.value(token.value)}`,
              ...(body === undefined ? {} : { 'content-type': 'application/json' }),
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          }),
        catch: () => fail(`Gitea cannot be reached at ${base}.`),
      }).pipe(
        Effect.timeoutOrElse({
          duration: timeout,
          orElse: () => Effect.fail(fail(`Gitea did not answer in time at ${base}.`)),
        }),
      );
    });

  const refused = (status: number) => fail(`Gitea refused the mission bot's token (${status}).`);

  /** One request as the bot; a `404` is `undefined`, so the caller names what was missing. */
  const send = (method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown) =>
    Effect.gen(function* () {
      const response = yield* request(method, path, body);
      if (response.status === 404) return undefined;
      if (response.status === 401 || response.status === 403) {
        return yield* refused(response.status);
      }
      if (!response.ok) return yield* fail(`Gitea answered ${response.status}.`);
      return response;
    });

  const json = (response: Response) =>
    Effect.tryPromise({
      try: () => response.json() as Promise<unknown>,
      catch: () => fail('Gitea answered in an unknown shape.'),
    });
  const shape = () => fail('Gitea answered in an unknown shape.');
  const drop = (response: Response | undefined) =>
    Effect.promise(() => response?.body?.cancel() ?? Promise.resolve());

  const missingRepository = (repository: GiteaRepository) =>
    fail(`Gitea has no repository ${repository.owner}/${repository.name} for the mission bot.`);

  /** Every label of the repository, up to the page limit. */
  const labels = (repository: GiteaRepository) =>
    Effect.gen(function* () {
      const all: Array<typeof Label.Type> = [];
      for (let page = 1; page <= MAX_LABEL_PAGES; page += 1) {
        const answer = yield* send(
          'GET',
          `${repositoryPath(repository)}/labels?limit=${PAGE_SIZE}&page=${page}`,
        );
        if (answer === undefined) return yield* missingRepository(repository);
        const list = yield* json(answer).pipe(
          Effect.flatMap((body) => decodeLabels(body).pipe(Effect.mapError(shape))),
        );
        all.push(...list);
        if (list.length < PAGE_SIZE) break;
      }
      return all;
    });

  /** The id of the label named `name`, created with `style` when the repository has none. */
  const labelId = (
    repository: GiteaRepository,
    name: string,
    style: { readonly color: string; readonly description: string },
    matches: (label: string) => boolean = (label) => label === name,
  ) =>
    Effect.gen(function* () {
      const found = (yield* labels(repository)).find((label) => matches(label.name));
      if (found !== undefined) return found.id;
      const created = yield* send('POST', `${repositoryPath(repository)}/labels`, {
        name,
        ...style,
      });
      if (created === undefined) return yield* missingRepository(repository);
      const label = yield* json(created).pipe(
        Effect.flatMap((body) => decodeLabel(body).pipe(Effect.mapError(shape))),
      );
      return label.id;
    });

  const addLabel = (repository: GiteaRepository, number: number, id: number) =>
    send('POST', `${repositoryPath(repository)}/issues/${number}/labels`, { labels: [id] }).pipe(
      Effect.flatMap((answer) =>
        answer === undefined ? Effect.fail(fail(`Gitea has no issue #${number}.`)) : drop(answer),
      ),
    );

  const removeLabel = (repository: GiteaRepository, number: number, id: number) =>
    send('DELETE', `${repositoryPath(repository)}/issues/${number}/labels/${id}`).pipe(
      Effect.flatMap(drop),
    );

  /**
   * Whether the token may write the repository's issues. Gitea checks a token's scope and the
   * user's permission before it reads the body, so a new label with an empty body is refused with
   * 403 without `write:issue` (Gitea names the scope in it), and otherwise as invalid (422).
   * Nothing is written either way.
   */
  const canWriteIssues = (repository: GiteaRepository) =>
    request('POST', `${repositoryPath(repository)}/labels`, {}).pipe(
      Effect.tap(drop),
      Effect.flatMap((answer) => {
        if (answer.status === 400 || answer.status === 422) return Effect.succeed(true);
        if (answer.status === 403 || answer.status === 404) return Effect.succeed(false);
        return Effect.fail(
          answer.status === 401 ? refused(401) : fail(`Gitea answered ${answer.status}.`),
        );
      }),
    );

  const facts = (repository: GiteaRepository): Effect.Effect<BotFacts> =>
    Option.isNone(token)
      ? Effect.succeed({ _tag: 'NoToken' })
      : send('GET', repositoryPath(repository)).pipe(
          Effect.flatMap((answer) =>
            answer === undefined
              ? Effect.succeed<BotFacts>({ _tag: 'Read', canPush: false, canWriteIssues: false })
              : json(answer).pipe(
                  Effect.flatMap((body) => decodeRepository(body).pipe(Effect.mapError(shape))),
                  Effect.flatMap((read) =>
                    // Without push the check fails anyway, and the probe is not needed.
                    read.permissions?.push === true
                      ? canWriteIssues(repository).pipe(
                          Effect.map(
                            (issues): BotFacts => ({
                              _tag: 'Read',
                              canPush: true,
                              canWriteIssues: issues,
                            }),
                          ),
                        )
                      : Effect.succeed<BotFacts>({
                          _tag: 'Read',
                          canPush: false,
                          canWriteIssues: false,
                        }),
                  ),
                ),
          ),
          Effect.catch((error) =>
            Effect.succeed<BotFacts>({ _tag: 'Unreadable', reason: error.reason }),
          ),
          Effect.withSpan('MissionBot.facts'),
        );

  const setLane = (repository: GiteaRepository, number: number, lane: Lane) =>
    Effect.gen(function* () {
      const all = yield* labels(repository);
      for (const other of LANES.filter((each) => each !== lane)) {
        const found = all.find((label) => label.name === laneLabel(other));
        if (found !== undefined) yield* removeLabel(repository, number, found.id);
      }
      const id = yield* labelId(repository, laneLabel(lane), LANE_LABEL_STYLE);
      yield* addLabel(repository, number, id);
    }).pipe(Effect.withSpan('MissionBot.setLane'));

  const markInProgress = (repository: GiteaRepository, number: number) =>
    labelId(repository, IN_PROGRESS_LABEL, IN_PROGRESS_LABEL_STYLE, isInProgressLabel).pipe(
      Effect.flatMap((id) => addLabel(repository, number, id)),
      Effect.withSpan('MissionBot.markInProgress'),
    );

  const unmarkInProgress = (repository: GiteaRepository, number: number) =>
    labels(repository).pipe(
      Effect.flatMap((all) =>
        Effect.forEach(
          all.filter((label) => isInProgressLabel(label.name)),
          (label) => removeLabel(repository, number, label.id),
          { discard: true },
        ),
      ),
      Effect.withSpan('MissionBot.unmarkInProgress'),
    );

  const comment = (repository: GiteaRepository, number: number, body: string) =>
    send('POST', `${repositoryPath(repository)}/issues/${number}/comments`, { body }).pipe(
      Effect.flatMap((answer) =>
        answer === undefined ? Effect.fail(fail(`Gitea has no issue #${number}.`)) : drop(answer),
      ),
      Effect.withSpan('MissionBot.comment'),
    );

  // A tag that exists already is fine when it names the same commit, so a retry pushes nothing.
  const pushTag = (repository: GiteaRepository, tag: string, target: string) =>
    Effect.gen(function* () {
      if (Option.isNone(token)) return yield* fail(NO_TOKEN);
      const created = yield* request('POST', `${repositoryPath(repository)}/tags`, {
        tag_name: tag,
        target,
        message: `Released by Mission Control (spec 036).`,
      });
      yield* drop(created);
      if (created.ok) return;
      if (created.status === 401 || created.status === 403) {
        return yield* fail(`Gitea refused the mission bot's token (${created.status}).`);
      }
      const existing = yield* send(
        'GET',
        `${repositoryPath(repository)}/tags/${encodeURIComponent(tag)}`,
      );
      if (existing === undefined)
        return yield* fail(`Gitea answered ${created.status} to the tag ${tag}.`);
      const found = yield* json(existing).pipe(
        Effect.flatMap((body) => decodeTag(body).pipe(Effect.mapError(shape))),
      );
      if (found.commit.sha !== target) {
        return yield* fail(`The tag ${tag} exists already on another commit.`);
      }
    }).pipe(Effect.withSpan('MissionBot.pushTag'));

  const openIssue = (
    repository: GiteaRepository,
    issue: { readonly title: string; readonly body: string },
  ) =>
    Effect.gen(function* () {
      const answer = yield* send('POST', `${repositoryPath(repository)}/issues`, issue);
      if (answer === undefined) return yield* missingRepository(repository);
      const created = yield* json(answer).pipe(
        Effect.flatMap((body) => decodeNumber(body).pipe(Effect.mapError(shape))),
      );
      return created.number;
    }).pipe(Effect.withSpan('MissionBot.openIssue'));

  const prepareWorktree = (path: string, repository: GiteaRepository) =>
    Effect.gen(function* () {
      if (Option.isNone(token)) return yield* fail(NO_TOKEN);
      const answer = yield* send('GET', '/user');
      if (answer === undefined) return yield* fail('Gitea does not know the mission bot.');
      const user = yield* json(answer).pipe(
        Effect.flatMap((body) => decodeUser(body).pipe(Effect.mapError(shape))),
      );
      const server = new URL(base);
      const folder = join(stateDir, 'mission');
      const credentials = join(folder, 'git-credentials');
      yield* Effect.tryPromise({
        try: async () => {
          await mkdir(folder, { recursive: true, mode: 0o700 });
          const login = encodeURIComponent(user.login);
          const secret = encodeURIComponent(Redacted.value(token.value));
          await writeFile(credentials, `${server.protocol}//${login}:${secret}@${server.host}\n`, {
            encoding: 'utf-8',
            mode: 0o600,
          });
        },
        catch: () => fail('The mission credential file cannot be written.'),
      });
      const config = (...args: ReadonlyArray<string>) =>
        runGit(path, ['config', '--worktree', ...args]);
      yield* runGit(path, ['config', 'extensions.worktreeConfig', 'true']);
      yield* config('user.name', user.login);
      yield* config('user.email', user.email ?? `${user.login}@noreply.${server.hostname}`);
      yield* config('commit.gpgsign', 'false');
      yield* config(
        'remote.origin.pushurl',
        `${base}/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}.git`,
      );
      // An empty helper first drops the owner's helpers, such as the keychain, for this worktree.
      yield* config('--replace-all', 'credential.helper', '');
      yield* config('--add', 'credential.helper', `store --file ${credentials}`);
    }).pipe(Effect.withSpan('MissionBot.prepareWorktree'));

  return Layer.succeed(
    MissionBotOutbound,
    MissionBotOutbound.of({
      configured: Option.isSome(token),
      settingsPath,
      facts,
      setLane,
      markInProgress,
      unmarkInProgress,
      comment,
      prepareWorktree,
      pushTag,
      openIssue,
    }),
  );
};

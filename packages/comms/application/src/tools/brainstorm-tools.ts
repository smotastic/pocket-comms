import {
  cutDoc,
  cutIssueBody,
  orderIssues,
  parseProposedIssue,
  parseIssueEdit,
  isRepositoryDoc,
  PLANET_DOCS,
  type InvalidInputError,
  type ProposedIssue,
  type IssueRead,
  type IssueText,
} from '@pocket-comms/comms-domain';
import { defineTool, ToolRefusal, type AgentTool } from '@smotastic/pocket-agent';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import * as Result from 'effect/Result';
import * as Schema from 'effect/Schema';
import { GiteaOutbound } from '../ports/gitea.outbound.port.js';
import { RepositoriesOutbound } from '../ports/repositories.outbound.port.js';
import { makeIssuePlanet } from '../use-cases/issue-planet.js';
import { makePlanetRegistry } from '../use-cases/planet-registry.js';

// The tools of the brainstorm. Four read; none takes a path, and a planet is only ever a
// name the repositories port lists. Two propose, a new issue or an edit of one, with the brainstorm
// images that go along, and end the turn: only the owner's decision writes.

const PlanetName = Schema.String.annotate({
  description: 'The name of a planet, as list_planets names it.',
});

const IssueNumber = Schema.Int.check(Schema.isGreaterThan(0)).annotate({
  description: "The issue's number in the planet's Gitea repository.",
});

const Images = Schema.optional(
  Schema.Array(Schema.Int).annotate({
    description:
      'The numbers of the brainstorm images that belong to the issue, at most five. The owner may change the choice.',
  }),
);

const refuse = (message: string) => Effect.fail(new ToolRefusal({ message }));

const refusal = (error: InvalidInputError) =>
  refuse(error.issues.map((issue) => issue.message).join(' '));

/** An edit Pi proposes, with the issue as Pi last read it. */
export interface ProposedEdit extends IssueText {
  readonly read: IssueRead;
  /** The brainstorm images that go along, by image id. */
  readonly images: ReadonlyArray<string>;
}

/** What the tools of one turn do in the brainstorm they run for. */
export interface BrainstormHooks {
  /** Shows a new issue proposal, with these brainstorm images by id, and answers its id. */
  readonly propose: (issue: ProposedIssue, images: ReadonlyArray<string>) => Effect.Effect<string>;
  /** Shows an edit proposal to the owner and answers its id. */
  readonly proposeEdit: (edit: ProposedEdit) => Effect.Effect<string>;
  /** Keeps this read as the last read of its issue. */
  readonly remember: (read: IssueRead) => Effect.Effect<void>;
  /** The last read of a planet's issue in this brainstorm, if Pi read it. */
  readonly readOf: (planet: string, number: number) => Effect.Effect<IssueRead | undefined>;
  /** The ids of the brainstorm images with these numbers; a number of no image is refused. */
  readonly images: (
    numbers: ReadonlyArray<number>,
  ) => Effect.Effect<Result.Result<ReadonlyArray<string>, InvalidInputError>>;
}

/** A target shows at most this many characters; Pi chooses the planet names it passes. */
const MAX_TARGET = 80;

/** The parts of a call's input a row may show; anything else in it is ignored. */
const decodeShown = Schema.decodeUnknownOption(
  Schema.Struct({
    planet: Schema.optional(Schema.String),
    number: Schema.optional(Schema.Number),
    file: Schema.optional(Schema.String),
  }),
);

/**
 * What a tool's row in the brainstorm shows of its call (spec 026): the planet, the issue or the file
 * it works on, never the rest of its input, such as a proposed body.
 */
export const describeBrainstormCall = (
  _tool: string,
  input: Schema.Json,
): { readonly target?: string } => {
  const shown = decodeShown(input);
  if (Option.isNone(shown)) return {};
  const { planet, number, file } = shown.value;
  if (planet === undefined || planet === '') return {};
  const target =
    number !== undefined
      ? `${planet} #${number}`
      : file !== undefined && isRepositoryDoc(file)
        ? `${planet}/${file}`
        : planet;
  return { target: target.length <= MAX_TARGET ? target : `${target.slice(0, MAX_TARGET - 1)}…` };
};

export const makeBrainstormTools = Effect.gen(function* () {
  const planetsOutbound = yield* RepositoriesOutbound;
  const giteaOutbound = yield* GiteaOutbound;
  const issuePlanet = yield* makeIssuePlanet;
  const registry = yield* makePlanetRegistry;

  const findPlanet = (name: string) =>
    issuePlanet(name).pipe(
      Effect.catchTag('PlanetNotFoundError', () =>
        refuse(`There is no planet ${name}. Call list_planets for their names.`),
      ),
    );

  const repositoryOf = (planet: string) =>
    Effect.gen(function* () {
      const { repository } = yield* findPlanet(planet);
      if (Option.isNone(repository)) {
        return yield* refuse(`${planet} has no repository on Gitea.`);
      }
      return repository.value;
    });

  const giteaRefusals = {
    GiteaNotConfiguredError: () => refuse('The app has no Gitea token.'),
    GiteaUnavailableError: (error: { readonly reason: string }) =>
      refuse(`Gitea cannot be reached: ${error.reason}`),
  };

  /** The tools of one turn, which act on the brainstorm through `hooks`. */
  return (hooks: BrainstormHooks): ReadonlyArray<AgentTool> => [
    defineTool({
      name: 'list_planets',
      description:
        "The owner's planets: the git repositories they registered, by name, and whether each has a repository on the owner's Gitea, where issues can be filed.",
      parameters: Schema.Struct({}),
      run: () =>
        Effect.gen(function* () {
          const planets = yield* registry.planets;
          const listed = yield* Effect.forEach(planets, (planet) =>
            planetsOutbound.originUrl(planet).pipe(
              Effect.map((origin) => ({
                name: planet.name,
                onGitea: Option.isSome(Option.flatMap(origin, giteaOutbound.repositoryOf)),
              })),
            ),
          );
          return { output: listed };
        }),
    }),
    defineTool({
      name: 'list_open_issues',
      description:
        "A planet's open Gitea issues, by number and title. Read them before proposing an issue, so no idea is filed twice.",
      parameters: Schema.Struct({ planet: PlanetName }),
      run: ({ planet }) =>
        Effect.gen(function* () {
          const repository = yield* repositoryOf(planet);
          const issues = yield* giteaOutbound
            .openIssues(repository)
            .pipe(Effect.catchTags(giteaRefusals));
          return {
            output: orderIssues(issues).map((issue) => ({
              number: issue.number,
              title: issue.title,
            })),
          };
        }),
    }),
    defineTool({
      name: 'read_planet_doc',
      description: `A planet's ${PLANET_DOCS.join(' or ')} at its top level, to learn what the planet is. No other file can be read.`,
      parameters: Schema.Struct({
        planet: PlanetName,
        file: Schema.Literals(PLANET_DOCS).annotate({ description: 'The file to read.' }),
      }),
      run: ({ planet, file }) =>
        Effect.gen(function* () {
          const found = yield* findPlanet(planet);
          const text = yield* planetsOutbound.readDoc(found.planet, file);
          if (Option.isNone(text)) return yield* refuse(`${planet} has no ${file}.`);
          return { output: cutDoc(text.value) };
        }),
    }),
    defineTool({
      name: 'read_issue',
      description:
        'One issue of a planet, open or closed, by its number: its title, its whole body, its state and its page. Read an issue before proposing an edit to it.',
      parameters: Schema.Struct({ planet: PlanetName, number: IssueNumber }),
      run: ({ planet, number }) =>
        Effect.gen(function* () {
          const repository = yield* repositoryOf(planet);
          const issue = yield* giteaOutbound.issue(repository, number).pipe(
            Effect.catchTags({
              ...giteaRefusals,
              IssueNotFoundError: () => refuse(`${planet} has no issue #${number}.`),
            }),
          );
          if (issue.pull) return yield* refuse(`#${number} of ${planet} is a pull request.`);
          const { body, cut } = cutIssueBody(issue.body);
          yield* hooks.remember({
            planet,
            number,
            url: issue.url,
            title: issue.title,
            body,
            cut,
          });
          return {
            output: {
              number,
              title: issue.title,
              body,
              state: issue.state,
              url: issue.url,
              ...(cut
                ? {
                    note: 'The body is cut because it is too long, so this issue cannot be edited here.',
                  }
                : {}),
            },
          };
        }),
    }),
    defineTool({
      name: 'propose_issue',
      description:
        'Proposes an idea as a Gitea issue in a planet. The owner sees it as a card, may edit it, and creates or discards it; you learn their decision in the next message. This ends your turn. Nothing is filed without the owner.',
      parameters: Schema.Struct({
        planet: PlanetName,
        title: Schema.String.annotate({ description: 'A short issue title.' }),
        body: Schema.String.annotate({
          description: 'The issue body in Markdown: the idea, why, and a rough shape.',
        }),
        images: Images,
      }),
      run: ({ images: numbers = [], ...input }) =>
        Effect.gen(function* () {
          const proposed = parseProposedIssue(input);
          if (Result.isFailure(proposed)) return yield* refusal(proposed.failure);
          const images = yield* hooks.images(numbers);
          if (Result.isFailure(images)) return yield* refusal(images.failure);
          const { repository } = yield* findPlanet(proposed.success.planet);
          if (Option.isNone(repository)) {
            return yield* refuse(
              `${proposed.success.planet} has no repository on Gitea, so no issue can be filed there.`,
            );
          }
          yield* hooks.propose(proposed.success, images.success);
          return {
            output: 'The owner sees the proposal now. Wait for their decision.',
            pause: true,
          };
        }),
    }),
    defineTool({
      name: 'propose_issue_edit',
      description:
        'Proposes a new title and body for an existing issue you read with read_issue in this brainstorm. Send the whole new body, and keep every part of it the edit is not about. The owner sees the edit next to the current version, may change it, and applies or discards it; you learn their decision in the next message. This ends your turn. Nothing changes without the owner.',
      parameters: Schema.Struct({
        planet: PlanetName,
        number: IssueNumber,
        title: Schema.String.annotate({ description: "The issue's whole new title." }),
        body: Schema.String.annotate({ description: "The issue's whole new body in Markdown." }),
        images: Images,
      }),
      run: ({ planet, number, images: numbers = [], ...text }) =>
        Effect.gen(function* () {
          const read = yield* hooks.readOf(planet, number);
          if (read === undefined) {
            return yield* refuse(
              `Read the issue #${number} of ${planet} with read_issue first, then propose the edit.`,
            );
          }
          if (read.cut) {
            return yield* refuse(
              `The body of the issue #${number} is too long to edit here, so nothing of it is lost.`,
            );
          }
          const edit = parseIssueEdit(text);
          if (Result.isFailure(edit)) return yield* refusal(edit.failure);
          const images = yield* hooks.images(numbers);
          if (Result.isFailure(images)) return yield* refusal(images.failure);
          yield* hooks.proposeEdit({ ...edit.success, read, images: images.success });
          return {
            output: 'The owner sees the edit now. Wait for their decision.',
            pause: true,
          };
        }),
    }),
  ];
});

import {
  cutDoc,
  cutIssueBody,
  orderIssues,
  parseIssueDraft,
  parseIssueEdit,
  isProjectDoc,
  PROJECT_DOCS,
  type InvalidInputError,
  type IssueDraft,
  type IssueRead,
  type IssueText,
} from '@pocket-comms/comms-domain';
import { defineTool, ToolRefusal, type AgentTool } from '@smotastic/pocket-agent';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import * as Result from 'effect/Result';
import * as Schema from 'effect/Schema';
import { GiteaOutbound } from '../ports/gitea.outbound.port.js';
import { ProjectsOutbound } from '../ports/projects.outbound.port.js';
import { makeIssueProject } from '../use-cases/issue-project.js';

// The tools of the brainstorm chat. Four read; none takes a path, and a project is only ever a
// name the projects port lists. Two propose, a new issue or an edit of one, with the chat
// pictures that go along, and end the turn: only the owner's decision writes.

const ProjectName = Schema.String.annotate({
  description: 'The name of a project, as list_projects names it.',
});

const IssueNumber = Schema.Int.check(Schema.isGreaterThan(0)).annotate({
  description: "The issue's number in the project's Gitea repository.",
});

const Pictures = Schema.optional(
  Schema.Array(Schema.Int).annotate({
    description:
      'The numbers of the chat pictures that belong to the issue, at most five. The owner may change the choice.',
  }),
);

const refuse = (message: string) => Effect.fail(new ToolRefusal({ message }));

const refusal = (error: InvalidInputError) =>
  refuse(error.issues.map((issue) => issue.message).join(' '));

/** An edit Pi proposes, with the issue as Pi last read it. */
export interface EditDraft extends IssueText {
  readonly read: IssueRead;
  /** The chat pictures that go along, by image id. */
  readonly pictures: ReadonlyArray<string>;
}

/** What the tools of one turn do in the chat they run for. */
export interface ChatHooks {
  /** Shows a new issue proposal, with these chat pictures by id, and answers its id. */
  readonly propose: (draft: IssueDraft, pictures: ReadonlyArray<string>) => Effect.Effect<string>;
  /** Shows an edit proposal to the owner and answers its id. */
  readonly proposeEdit: (edit: EditDraft) => Effect.Effect<string>;
  /** Keeps this read as the last read of its issue. */
  readonly remember: (read: IssueRead) => Effect.Effect<void>;
  /** The last read of a project's issue in this chat, if Pi read it. */
  readonly readOf: (project: string, number: number) => Effect.Effect<IssueRead | undefined>;
  /** The ids of the chat pictures with these numbers; a number of no picture is refused. */
  readonly pictures: (
    numbers: ReadonlyArray<number>,
  ) => Effect.Effect<Result.Result<ReadonlyArray<string>, InvalidInputError>>;
}

/** A target shows at most this many characters; Pi chooses the project names it passes. */
const MAX_TARGET = 80;

/** The parts of a call's input a row may show; anything else in it is ignored. */
const decodeShown = Schema.decodeUnknownOption(
  Schema.Struct({
    project: Schema.optional(Schema.String),
    number: Schema.optional(Schema.Number),
    file: Schema.optional(Schema.String),
  }),
);

/**
 * What a tool's row in the chat shows of its call (spec 026): the project, the issue or the file
 * it works on, never the rest of its input, such as a proposed body.
 */
export const describeBrainstormCall = (
  _tool: string,
  input: Schema.Json,
): { readonly target?: string } => {
  const shown = decodeShown(input);
  if (Option.isNone(shown)) return {};
  const { project, number, file } = shown.value;
  if (project === undefined || project === '') return {};
  const target =
    number !== undefined
      ? `${project} #${number}`
      : file !== undefined && isProjectDoc(file)
        ? `${project}/${file}`
        : project;
  return { target: target.length <= MAX_TARGET ? target : `${target.slice(0, MAX_TARGET - 1)}…` };
};

export const makeBrainstormTools = Effect.gen(function* () {
  const projectsOutbound = yield* ProjectsOutbound;
  const giteaOutbound = yield* GiteaOutbound;
  const issueProject = yield* makeIssueProject;

  const findProject = (name: string) =>
    issueProject(name).pipe(
      Effect.catchTag('ProjectNotFoundError', () =>
        refuse(`There is no project ${name}. Call list_projects for their names.`),
      ),
    );

  const repositoryOf = (project: string) =>
    Effect.gen(function* () {
      const { repository } = yield* findProject(project);
      if (Option.isNone(repository)) {
        return yield* refuse(`${project} has no repository on Gitea.`);
      }
      return repository.value;
    });

  const giteaRefusals = {
    GiteaNotConfiguredError: () => refuse('The app has no Gitea token.'),
    GiteaUnavailableError: (error: { readonly reason: string }) =>
      refuse(`Gitea cannot be reached: ${error.reason}`),
  };

  /** The tools of one turn, which act on the chat through `chat`. */
  return (chat: ChatHooks): ReadonlyArray<AgentTool> => [
    defineTool({
      name: 'list_projects',
      description:
        "The owner's projects: the git repositories in the projects folder, by name, and whether each has a repository on the owner's Gitea, where issues can be filed.",
      parameters: Schema.Struct({}),
      run: () =>
        Effect.gen(function* () {
          const projects = yield* projectsOutbound.list;
          const listed = yield* Effect.forEach(projects, (project) =>
            projectsOutbound.originUrl(project).pipe(
              Effect.map((origin) => ({
                name: project.name,
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
        "A project's open Gitea issues, by number and title. Read them before proposing an issue, so no idea is filed twice.",
      parameters: Schema.Struct({ project: ProjectName }),
      run: ({ project }) =>
        Effect.gen(function* () {
          const repository = yield* repositoryOf(project);
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
      name: 'read_project_doc',
      description: `A project's ${PROJECT_DOCS.join(' or ')} at its top level, to learn what the project is. No other file can be read.`,
      parameters: Schema.Struct({
        project: ProjectName,
        file: Schema.Literals(PROJECT_DOCS).annotate({ description: 'The file to read.' }),
      }),
      run: ({ project, file }) =>
        Effect.gen(function* () {
          const found = yield* findProject(project);
          const text = yield* projectsOutbound.readDoc(found.project, file);
          if (Option.isNone(text)) return yield* refuse(`${project} has no ${file}.`);
          return { output: cutDoc(text.value) };
        }),
    }),
    defineTool({
      name: 'read_issue',
      description:
        'One issue of a project, open or closed, by its number: its title, its whole body, its state and its page. Read an issue before proposing an edit to it.',
      parameters: Schema.Struct({ project: ProjectName, number: IssueNumber }),
      run: ({ project, number }) =>
        Effect.gen(function* () {
          const repository = yield* repositoryOf(project);
          const issue = yield* giteaOutbound.issue(repository, number).pipe(
            Effect.catchTags({
              ...giteaRefusals,
              IssueNotFoundError: () => refuse(`${project} has no issue #${number}.`),
            }),
          );
          if (issue.pull) return yield* refuse(`#${number} of ${project} is a pull request.`);
          const { body, cut } = cutIssueBody(issue.body);
          yield* chat.remember({
            project,
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
        'Proposes an idea as a Gitea issue in a project. The owner sees it as a card, may edit it, and creates or discards it; you learn their decision in the next message. This ends your turn. Nothing is filed without the owner.',
      parameters: Schema.Struct({
        project: ProjectName,
        title: Schema.String.annotate({ description: 'A short issue title.' }),
        body: Schema.String.annotate({
          description: 'The issue body in Markdown: the idea, why, and a rough shape.',
        }),
        pictures: Pictures,
      }),
      run: ({ pictures: numbers = [], ...input }) =>
        Effect.gen(function* () {
          const draft = parseIssueDraft(input);
          if (Result.isFailure(draft)) return yield* refusal(draft.failure);
          const pictures = yield* chat.pictures(numbers);
          if (Result.isFailure(pictures)) return yield* refusal(pictures.failure);
          const { repository } = yield* findProject(draft.success.project);
          if (Option.isNone(repository)) {
            return yield* refuse(
              `${draft.success.project} has no repository on Gitea, so no issue can be filed there.`,
            );
          }
          yield* chat.propose(draft.success, pictures.success);
          return {
            output: 'The owner sees the proposal now. Wait for their decision.',
            pause: true,
          };
        }),
    }),
    defineTool({
      name: 'propose_issue_edit',
      description:
        'Proposes a new title and body for an existing issue you read with read_issue in this chat. Send the whole new body, and keep every part of it the edit is not about. The owner sees the edit next to the current version, may change it, and applies or discards it; you learn their decision in the next message. This ends your turn. Nothing changes without the owner.',
      parameters: Schema.Struct({
        project: ProjectName,
        number: IssueNumber,
        title: Schema.String.annotate({ description: "The issue's whole new title." }),
        body: Schema.String.annotate({ description: "The issue's whole new body in Markdown." }),
        pictures: Pictures,
      }),
      run: ({ project, number, pictures: numbers = [], ...text }) =>
        Effect.gen(function* () {
          const read = yield* chat.readOf(project, number);
          if (read === undefined) {
            return yield* refuse(
              `Read the issue #${number} of ${project} with read_issue first, then propose the edit.`,
            );
          }
          if (read.cut) {
            return yield* refuse(
              `The body of the issue #${number} is too long to edit here, so nothing of it is lost.`,
            );
          }
          const edit = parseIssueEdit(text);
          if (Result.isFailure(edit)) return yield* refusal(edit.failure);
          const pictures = yield* chat.pictures(numbers);
          if (Result.isFailure(pictures)) return yield* refusal(pictures.failure);
          yield* chat.proposeEdit({ ...edit.success, read, pictures: pictures.success });
          return {
            output: 'The owner sees the edit now. Wait for their decision.',
            pause: true,
          };
        }),
    }),
  ];
});

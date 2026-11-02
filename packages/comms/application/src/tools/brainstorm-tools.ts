import {
  cutDoc,
  orderIssues,
  parseIssueDraft,
  PROJECT_DOCS,
  type IssueDraft,
} from '@pocket-comms/comms-domain';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import * as Result from 'effect/Result';
import * as Schema from 'effect/Schema';
import type { RuntimeTool } from '../ports/agent-runtime.outbound.port.js';
import { GiteaOutbound } from '../ports/gitea.outbound.port.js';
import { ProjectsOutbound } from '../ports/projects.outbound.port.js';
import { makeIssueProject } from '../use-cases/issue-project.js';
import { defineTool, ToolRefusal } from './tool.js';

// The tools of the brainstorm chat (spec 013, requirements 10 and 11). Three read; none takes a
// path, and a project is only ever a name the projects port lists. The fourth proposes an issue
// and ends the turn: only the owner's decision writes.

const ProjectName = Schema.String.annotate({
  description: 'The name of a project, as list_projects names it.',
});

const refuse = (message: string) => Effect.fail(new ToolRefusal({ message }));

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

  /** The tools of one turn; `propose` shows a proposal to the owner and answers its id. */
  return (propose: (draft: IssueDraft) => Effect.Effect<string>): ReadonlyArray<RuntimeTool> => [
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
          const { repository } = yield* findProject(project);
          if (Option.isNone(repository)) {
            return yield* refuse(`${project} has no repository on Gitea.`);
          }
          const issues = yield* giteaOutbound.openIssues(repository.value).pipe(
            Effect.catchTags({
              GiteaNotConfiguredError: () => refuse('The app has no Gitea token.'),
              GiteaUnavailableError: (error) => refuse(`Gitea cannot be reached: ${error.reason}`),
            }),
          );
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
      name: 'propose_issue',
      description:
        'Proposes an idea as a Gitea issue in a project. The owner sees it as a card, may edit it, and creates or discards it; you learn their decision in the next message. This ends your turn. Nothing is filed without the owner.',
      parameters: Schema.Struct({
        project: ProjectName,
        title: Schema.String.annotate({ description: 'A short issue title.' }),
        body: Schema.String.annotate({
          description: 'The issue body in Markdown: the idea, why, and a rough shape.',
        }),
      }),
      run: (input) =>
        Effect.gen(function* () {
          const draft = parseIssueDraft(input);
          if (Result.isFailure(draft)) {
            return yield* refuse(draft.failure.issues.map((issue) => issue.message).join(' '));
          }
          const { repository } = yield* findProject(draft.success.project);
          if (Option.isNone(repository)) {
            return yield* refuse(
              `${draft.success.project} has no repository on Gitea, so no issue can be filed there.`,
            );
          }
          yield* propose(draft.success);
          return {
            output: 'The owner sees the proposal now. Wait for their decision.',
            pause: true,
          };
        }),
    }),
  ];
});

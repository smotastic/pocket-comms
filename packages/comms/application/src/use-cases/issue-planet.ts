import type { Project } from '@pocket-comms/comms-domain';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import { ProjectNotFoundError } from '../errors.js';
import { GiteaOutbound, type LinkedRepository } from '../ports/gitea.outbound.port.js';
import { ProjectsOutbound } from '../ports/projects.outbound.port.js';

/**
 * A project by its name, and the Gitea repository its `origin` names. The project is only ever
 * one the projects port lists, and the repository only ever the one its remote names.
 */
export const makeIssueProject = Effect.gen(function* () {
  const projectsOutbound = yield* ProjectsOutbound;
  const giteaOutbound = yield* GiteaOutbound;

  return Effect.fnUntraced(function* (name: string) {
    const projects = yield* projectsOutbound.list;
    const project = projects.find((candidate) => candidate.name === name);
    if (project === undefined) return yield* new ProjectNotFoundError({ project: name });
    const origin = yield* projectsOutbound.originUrl(project);
    const repository = Option.flatMap(origin, giteaOutbound.repositoryOf);
    return { project, repository } satisfies {
      readonly project: Project;
      readonly repository: Option.Option<LinkedRepository>;
    };
  });
});

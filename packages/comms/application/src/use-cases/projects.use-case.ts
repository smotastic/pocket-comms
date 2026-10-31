import { orderProjects } from '@pocket-comms/comms-domain';
import * as Effect from 'effect/Effect';
import type { ProjectDto } from '../dto/task.dto.js';
import { HerdrOutbound } from '../ports/herdr.outbound.port.js';
import { ProjectsOutbound } from '../ports/projects.outbound.port.js';

/** The projects in the order the app offers them: open in Herdr first. */
export const makeProjects = Effect.gen(function* () {
  const projectsOutbound = yield* ProjectsOutbound;
  const herdrOutbound = yield* HerdrOutbound;

  const projects = Effect.fn('Tasks.projects')(function* () {
    const listed = yield* projectsOutbound.list;
    const { workspaces } = yield* herdrOutbound.snapshot;
    return orderProjects(listed, workspaces).map(({ name, open }): ProjectDto => ({ name, open }));
  });

  return { projects: projects() };
});

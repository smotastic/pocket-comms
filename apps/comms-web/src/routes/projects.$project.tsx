import { createFileRoute } from '@tanstack/react-router';
import { ProjectIssues } from '../ProjectIssues.js';

/** `/projects/$project` shows a project's open Gitea issues. */
export const Route = createFileRoute('/projects/$project')({
  component: function ProjectIssueList() {
    const { client } = Route.useRouteContext();
    const { project } = Route.useParams();
    const navigate = Route.useNavigate();
    const openAgent = (agent: string, note?: string) =>
      void navigate({
        to: '/agents/$agent',
        params: { agent },
        state: (previous) => ({ ...previous, note }),
      });
    return (
      <ProjectIssues
        key={project}
        client={client}
        project={project}
        onBack={() => void navigate({ to: '/projects' })}
        onOpenAgent={(agent) => openAgent(agent)}
        onStarted={openAgent}
      />
    );
  },
});

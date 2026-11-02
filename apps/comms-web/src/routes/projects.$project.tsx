import { createFileRoute, useRouterState } from '@tanstack/react-router';
import { ProjectPage } from '../ProjectPage.js';

/** `/projects/$project` shows a project's agents and open Gitea issues. */
export const Route = createFileRoute('/projects/$project')({
  component: function Project() {
    const { client } = Route.useRouteContext();
    const { project } = Route.useParams();
    const navigate = Route.useNavigate();
    const notice = useRouterState({ select: (state) => state.location.state.notice });
    const openAgent = (agent: string, note?: string) =>
      void navigate({
        to: '/agents/$agent',
        params: { agent },
        state: (previous) => ({ ...previous, note }),
      });
    return (
      <ProjectPage
        key={project}
        client={client}
        project={project}
        notice={notice}
        onBack={() => void navigate({ to: '/' })}
        onOpenAgent={(agent) => openAgent(agent)}
        onStarted={openAgent}
      />
    );
  },
});

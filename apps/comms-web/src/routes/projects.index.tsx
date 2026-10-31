import { createFileRoute } from '@tanstack/react-router';
import { Projects } from '../Projects.js';

/** `/projects` lists the projects, each leading to its Gitea issues. */
export const Route = createFileRoute('/projects/')({
  component: function ProjectList() {
    const { client } = Route.useRouteContext();
    const navigate = Route.useNavigate();
    return (
      <Projects
        client={client}
        onBack={() => void navigate({ to: '/' })}
        onOpen={(project) => void navigate({ to: '/projects/$project', params: { project } })}
      />
    );
  },
});

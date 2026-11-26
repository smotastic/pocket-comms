import { createFileRoute, useRouterState } from '@tanstack/react-router';
import { PlanetPage } from '../PlanetPage.js';

/** `/planets/$planet` shows a planet's agents and open Gitea issues. */
export const Route = createFileRoute('/planets/$planet')({
  component: function Planet() {
    const { client } = Route.useRouteContext();
    const { planet } = Route.useParams();
    const navigate = Route.useNavigate();
    const notice = useRouterState({ select: (state) => state.location.state.notice });
    const openAgent = (agent: string, note: string | undefined) =>
      void navigate({
        to: '/agents/$agent',
        params: { agent },
        state: (previous) => ({ ...previous, note }),
      });
    return (
      <PlanetPage
        key={planet}
        client={client}
        planet={planet}
        notice={notice}
        onBack={() => void navigate({ to: '/' })}
        onStarted={openAgent}
      />
    );
  },
});

import { createFileRoute } from '@tanstack/react-router';
import { ActivityPage } from '../ActivityPage.js';

/** `/activity` lists what happened across the agents (spec 017). */
export const Route = createFileRoute('/activity')({
  component: function Activity() {
    const { client } = Route.useRouteContext();
    const navigate = Route.useNavigate();
    return (
      <ActivityPage
        client={client}
        onBack={() => void navigate({ to: '/' })}
        onOpenAgent={(agent) => void navigate({ to: '/agents/$agent', params: { agent } })}
        onOpenProject={(project) =>
          void navigate({ to: '/projects/$project', params: { project } })
        }
      />
    );
  },
});

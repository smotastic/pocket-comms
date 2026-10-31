import { createFileRoute } from '@tanstack/react-router';
import { Overview } from '../Overview.js';

/** `/` lists every live agent. */
export const Route = createFileRoute('/')({
  component: function AgentsOverview() {
    const { client } = Route.useRouteContext();
    const navigate = Route.useNavigate();
    return (
      <Overview
        client={client}
        onOpen={(agent) => void navigate({ to: '/agents/$agent', params: { agent } })}
        onStarted={(agent, note) =>
          void navigate({
            to: '/agents/$agent',
            params: { agent },
            state: (previous) => ({ ...previous, note }),
          })
        }
      />
    );
  },
});

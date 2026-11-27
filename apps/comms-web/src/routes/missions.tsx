import { createFileRoute } from '@tanstack/react-router';
import { MissionControl } from '../MissionControl.js';

/** `/missions`: Mission Control, the running mission, the mission queue and the mission log. */
export const Route = createFileRoute('/missions')({
  component: function Missions() {
    const { client } = Route.useRouteContext();
    const navigate = Route.useNavigate();
    return <MissionControl client={client} onBack={() => void navigate({ to: '/' })} />;
  },
});

import { createFileRoute } from '@tanstack/react-router';
import { Conversation } from '../Conversation.js';

/** `/agents/$agent` shows one agent: its conversation or its screen. */
export const Route = createFileRoute('/agents/$agent')({
  component: function AgentConversation() {
    const { client } = Route.useRouteContext();
    const { agent } = Route.useParams();
    const navigate = Route.useNavigate();
    return (
      <Conversation
        key={agent}
        client={client}
        agentRef={agent}
        onBack={() => void navigate({ to: '/' })}
      />
    );
  },
});

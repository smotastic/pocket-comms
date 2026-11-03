import { createFileRoute } from '@tanstack/react-router';
import { SubagentConversation } from '../SubagentConversation.js';

/** `/agents/$agent/subagents/$subagent` shows a subagent's own conversation, read-only. */
export const Route = createFileRoute('/agents/$agent_/subagents/$subagent')({
  component: function Subagent() {
    const { client } = Route.useRouteContext();
    const { agent, subagent } = Route.useParams();
    const navigate = Route.useNavigate();
    return (
      <SubagentConversation
        key={`${agent}/${subagent}`}
        client={client}
        agentRef={agent}
        id={subagent}
        onBack={() => void navigate({ to: '/agents/$agent', params: { agent } })}
      />
    );
  },
});

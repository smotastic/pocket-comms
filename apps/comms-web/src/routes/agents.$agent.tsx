import { createFileRoute, useRouterState } from '@tanstack/react-router';
import { Conversation } from '../Conversation.js';

/** `/agents/$agent` shows one agent: its conversation or its screen. */
export const Route = createFileRoute('/agents/$agent')({
  component: function AgentConversation() {
    const { client } = Route.useRouteContext();
    const { agent } = Route.useParams();
    const navigate = Route.useNavigate();
    const note = useRouterState({ select: (state) => state.location.state.note });
    return (
      <Conversation
        key={agent}
        client={client}
        agentRef={agent}
        note={note}
        onBack={() => void navigate({ to: '/' })}
        onOpenSubagent={(subagent) =>
          void navigate({
            to: '/agents/$agent/subagents/$subagent',
            params: { agent, subagent },
          })
        }
      />
    );
  },
});

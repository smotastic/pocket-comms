import { createFileRoute, useRouterState } from '@tanstack/react-router';
import { Conversation } from '../Conversation.js';

/** `/agents/$agent` shows one agent: its conversation or its screen. */
export const Route = createFileRoute('/agents/$agent')({
  // `from=push` marks a tapped notification: an agent that is gone by then leads to the overview.
  validateSearch: (search: Record<string, unknown>): { readonly from?: 'push' } =>
    search['from'] === 'push' ? { from: 'push' } : {},
  component: function AgentConversation() {
    const { client } = Route.useRouteContext();
    const { agent } = Route.useParams();
    const navigate = Route.useNavigate();
    const note = useRouterState({ select: (state) => state.location.state.note });
    const { from } = Route.useSearch();
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
        {...(from === 'push' ? { onGone: () => void navigate({ to: '/', replace: true }) } : {})}
      />
    );
  },
});

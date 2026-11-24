import { createFileRoute, useRouter, useRouterState } from '@tanstack/react-router';
import { useRef } from 'react';
import { Conversation } from '../Conversation.js';
import { parsePullRequestSearch, pullRequestSearch } from '../pull-requests.js';

/** `/agents/$agent` shows one agent: its conversation or its screen. */
export const Route = createFileRoute('/agents/$agent')({
  // `from=push` marks a tapped notification: an agent that is gone by then leads to the overview.
  // `pr=owner/repo/number` shows an attached pull request's changes (spec 031), so Back closes them.
  // `task=issue` comes from an issue's Send the issue's task… (spec 032).
  validateSearch: (
    search: Record<string, unknown>,
  ): { readonly from?: 'push'; readonly pr?: string; readonly task?: 'issue' } => {
    const pr = parsePullRequestSearch(search['pr']);
    return {
      ...(search['from'] === 'push' ? { from: 'push' as const } : {}),
      ...(search['task'] === 'issue' ? { task: 'issue' as const } : {}),
      ...(pr === undefined ? {} : { pr: pullRequestSearch(pr) }),
    };
  },
  component: function AgentConversation() {
    const { client } = Route.useRouteContext();
    const { agent } = Route.useParams();
    const navigate = Route.useNavigate();
    const note = useRouterState({ select: (state) => state.location.state.note });
    const { from, pr, task } = Route.useSearch();
    const router = useRouter();
    // A sheet opened here added a step, so closing it goes back; one opened from a link replaces.
    const openedHere = useRef(false);
    return (
      <Conversation
        key={agent}
        client={client}
        agentRef={agent}
        note={note}
        fromIssue={task === 'issue'}
        onBack={() => void navigate({ to: '/' })}
        {...(from === 'push' ? { onGone: () => void navigate({ to: '/', replace: true }) } : {})}
        shownPullRequest={parsePullRequestSearch(pr)}
        onShowPullRequest={(pullRequest) => {
          if (pullRequest === undefined && openedHere.current) {
            openedHere.current = false;
            router.history.back();
            return;
          }
          openedHere.current = pullRequest !== undefined;
          void navigate({
            search: (previous) =>
              pullRequest === undefined
                ? { ...(previous.from === undefined ? {} : { from: previous.from }) }
                : { ...previous, pr: pullRequestSearch(pullRequest) },
            // Opening adds a step, so Back closes the sheet.
            replace: pullRequest === undefined,
          });
        }}
      />
    );
  },
});

import {
  AgentList,
  AgentRow,
  Alert,
  AppBar,
  IconButton,
  LiveIndicator,
  Page,
  Stack,
  Text,
} from '@smotastic/pocket-design';
import { useQuery } from '@tanstack/react-query';
import { activityTarget, activityText, activityTone } from './activity.js';
import { BrainstormAction } from './Brainstorm.js';
import type { ActivityEventView, CommsClient } from './comms-client.js';
import { activityQuery, projectsQuery } from './comms-queries.js';
import { useActivityLive, useNow } from './live.js';
import { navigateOnPlainClick } from './links.js';
import { projectHue } from './rows.js';
import { since } from './since.js';
import { statusDot } from './StatusBadge.js';

export interface ActivityPageProps {
  readonly client: CommsClient;
  readonly onBack: () => void;
  readonly onOpenAgent: (ref: string) => void;
  readonly onOpenProject: (project: string) => void;
}

/** Where a row leads, as `AgentRow` takes it; an event that leads nowhere is a plain row. */
const linkOf = (
  event: ActivityEventView,
  onOpenAgent: (ref: string) => void,
  onOpenProject: (project: string) => void,
) => {
  const target = activityTarget(event);
  if (target === undefined) return {};
  return target.to === 'agent'
    ? {
        href: `/agents/${encodeURIComponent(target.ref)}`,
        onClick: navigateOnPlainClick(() => onOpenAgent(target.ref)),
      }
    : {
        href: `/projects/${encodeURIComponent(target.project)}`,
        onClick: navigateOnPlainClick(() => onOpenProject(target.project)),
      };
};

/** One event as an agent row: who, what happened and when. */
const ActivityItem = ({
  event,
  projects,
  now,
  onOpenAgent,
  onOpenProject,
}: Omit<ActivityPageProps, 'client' | 'onBack'> & {
  readonly event: ActivityEventView;
  /** Every project's name, in the order that gives each its colour. */
  readonly projects: ReadonlyArray<string>;
  readonly now: number;
}) => {
  const { agent } = event;
  const name = agent.name ?? agent.workspace;
  return (
    <AgentRow
      {...linkOf(event, onOpenAgent, onOpenProject)}
      // The second line says what happened; the dot only colours it.
      status={statusDot(activityTone(event), '')}
      name={name}
      {...(agent.worktree === undefined || agent.worktree === name
        ? {}
        : { worktree: agent.worktree })}
      project={agent.project ?? agent.workspace}
      hue={projectHue(agent.project, projects)}
      title={activityText(event)}
      since={since(event.at, now)}
    />
  );
};

/**
 * `/activity`: what happened across the agents, newest first. An event opens its agent's
 * conversation, or its project when the agent is gone. It updates live.
 */
export const ActivityPage = ({ client, onBack, onOpenAgent, onOpenProject }: ActivityPageProps) => {
  const { live } = useActivityLive(client);
  const activity = useQuery(activityQuery(client));
  const projects = useQuery(projectsQuery(client));
  const now = useNow();
  const events = activity.data?.events;

  return (
    <>
      <AppBar
        start={<IconButton icon="back" label="Back to all agents" onClick={onBack} />}
        title="Activity"
        subtitle={<LiveIndicator live={live} label={live ? 'Live' : 'Connecting…'} />}
        end={<BrainstormAction />}
      />
      <Page>
        <Stack gap="lg">
          {activity.error === null ? null : <Alert>{activity.error.message}</Alert>}
          {events === undefined ? (
            activity.isPending ? (
              <Text tone="muted">Loading the activity…</Text>
            ) : null
          ) : events.length === 0 ? (
            <Text tone="muted">Nothing happened in the last 24 hours.</Text>
          ) : (
            <AgentList label="Activity">
              {events.map((event) => (
                <ActivityItem
                  key={event.id}
                  event={event}
                  projects={projects.data?.map(({ name }) => name) ?? []}
                  now={now}
                  onOpenAgent={onOpenAgent}
                  onOpenProject={onOpenProject}
                />
              ))}
            </AgentList>
          )}
        </Stack>
      </Page>
    </>
  );
};

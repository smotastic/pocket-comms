import {
  Alert,
  AppBar,
  ChipGroup,
  IconButton,
  LiveIndicator,
  Page,
  SectionHeader,
  Stack,
  Text,
} from '@smotastic/pocket-design';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { AgentItem } from './AgentItem.js';
import { AgentList } from './AgentRow.js';
import { BrainstormAction } from './Brainstorm.js';
import type { AgentView, CommsClient } from './comms-client.js';
import { RequestError } from './comms-client.js';
import { overviewQuery, projectsQuery } from './comms-queries.js';
import { activeFilter, agentsOf, ALL } from './everything-else.js';
import { useNow, useOverviewLive } from './live.js';
import { ProjectsSheet } from './ProjectsSheet.js';
import { startedNotice } from './started.js';

export interface OverviewProps {
  readonly client: CommsClient;
  readonly onOpen: (ref: string) => void;
  /** Opens a project's page, with a notice to show there. */
  readonly onProject: (project: string, notice?: string) => void;
  /** Opens the conversation of an agent the projects sheet started, with its note. */
  readonly onStarted: (ref: string, note: string | undefined) => void;
  /** Opens the activity timeline. */
  readonly onActivity: () => void;
}

const Group = ({
  title,
  agents,
  now,
  onOpen,
  filter,
}: {
  readonly title: string;
  readonly agents: ReadonlyArray<AgentView>;
  readonly now: number;
  readonly onOpen: (ref: string) => void;
  /** Shown under the heading, such as the project filter. */
  readonly filter?: ReactNode;
}) => (
  <section aria-label={title}>
    <Stack gap="xs">
      <SectionHeader title={title} count={agents.length} />
      {filter}
      <AgentList label={title}>
        {agents.map((agent) => (
          <AgentItem
            key={agent.paneId}
            agent={agent}
            withProject
            now={now}
            onOpen={onOpen}
          />
        ))}
      </AgentList>
    </Stack>
  </section>
);

/**
 * `/`: every live agent in two groups, Needs you and Everything else, the latter by project and
 * narrowed by a project filter. Its Projects action opens every project and the activity
 * timeline in a side sheet. It updates live.
 */
export const Overview = ({ client, onOpen, onProject, onStarted, onActivity }: OverviewProps) => {
  const { live, unavailable } = useOverviewLive(client);
  const overview = useQuery(overviewQuery(client));
  const projects = useQuery(projectsQuery(client));
  const now = useNow();
  const [chosen, setChosen] = useState(ALL);
  const [projectsOpen, setProjectsOpen] = useState(false);

  const herdrAway =
    unavailable ??
    (overview.error instanceof RequestError && overview.error.status === 503
      ? overview.error.message
      : undefined);
  const data = overview.data;
  const groups = data?.groups ?? [];
  const filter = activeFilter(groups, chosen);
  // A project that leaves the list is forgotten, so it is not chosen again when it comes back.
  useEffect(() => {
    if (filter !== chosen) setChosen(filter);
  }, [filter, chosen]);
  const empty = data !== undefined && data.needsYou.length === 0 && groups.length === 0;

  return (
    <>
      <AppBar
        title="pocket-comms"
        subtitle={<LiveIndicator live={live} label={live ? 'Mac mini · live' : 'Connecting…'} />}
        end={
          <>
            <BrainstormAction />
            <IconButton icon="cards" label="Projects" onClick={() => setProjectsOpen(true)} />
          </>
        }
      />
      <ProjectsSheet
        client={client}
        open={projectsOpen}
        onClose={() => setProjectsOpen(false)}
        overview={data}
        projects={projects.data?.map(({ name }) => name)}
        projectsError={projects.error?.message}
        onProject={onProject}
        onActivity={onActivity}
        onStarted={(project, created) => {
          setProjectsOpen(false);
          // A start without a running agent says so on the project's page.
          if (created.agent?.started === true) onStarted(created.agent.ref, created.agent.note);
          else onProject(project, startedNotice(created));
        }}
      />
      <Page>
        <Stack gap="lg">
          {herdrAway === undefined ? null : (
            <Alert>Herdr is not running. The app keeps trying. ({herdrAway})</Alert>
          )}
          {overview.error !== null && herdrAway === undefined ? (
            <Alert>{overview.error.message}</Alert>
          ) : null}
          {projects.error === null ? null : <Alert>{projects.error.message}</Alert>}
          {data === undefined ? (
            overview.isPending ? (
              <Text tone="muted">Loading the agents…</Text>
            ) : null
          ) : (
            <>
              {data.needsYou.length === 0 ? null : (
                <Group
                  title="Needs you"
                  agents={data.needsYou}
                  now={now}
                  onOpen={onOpen}
                />
              )}
              {groups.length === 0 ? null : (
                <Group
                  title="Everything else"
                  agents={agentsOf(groups, filter)}
                  now={now}
                  onOpen={onOpen}
                  filter={
                    groups.length < 2 ? undefined : (
                      <ChipGroup
                        label="Project"
                        selectionMode="single"
                        layout="row"
                        selected={filter}
                        onSelect={setChosen}
                        items={[
                          { id: ALL, label: 'All' },
                          ...groups.map((group) => ({ id: group.key, label: group.name })),
                        ]}
                      />
                    )
                  }
                />
              )}
              {empty ? <Text tone="muted">No agents are running.</Text> : null}
            </>
          )}
        </Stack>
      </Page>
    </>
  );
};

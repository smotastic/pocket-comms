import {
  AgentList,
  Alert,
  AppBar,
  ChipGroup,
  Figure,
  Heading,
  IconButton,
  Inline,
  LiveIndicator,
  Page,
  SectionHeader,
  Stack,
  Text,
} from '@smotastic/pocket-design';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { AgentItem } from './AgentItem.js';
import { BrainstormAction } from './Brainstorm.js';
import type { AgentView, CommsClient } from './comms-client.js';
import { RequestError } from './comms-client.js';
import { overviewQuery, projectsQuery } from './comms-queries.js';
import { activeFilter, agentsOf, ALL } from './everything-else.js';
import { useMultiplexerName, useNow, useOverviewLive } from './live.js';
import { ProjectsSheet } from './ProjectsSheet.js';
import { projectHue } from './rows.js';
import { startedNotice } from './started.js';

export interface OverviewProps {
  readonly client: CommsClient;
  /** Opens a project's page, with a notice to show there. */
  readonly onProject: (project: string, notice?: string) => void;
  /** Opens the conversation of an agent the projects sheet started, with its note. */
  readonly onStarted: (ref: string, note: string | undefined) => void;
  /** Opens the Settings page. */
  readonly onSettings: () => void;
}

const Rows = ({
  label,
  agents,
  projects,
  now,
}: {
  readonly label: string;
  readonly agents: ReadonlyArray<AgentView>;
  /** Every project's name, in the order that gives each its colour. */
  readonly projects: ReadonlyArray<string>;
  readonly now: number;
}) => (
  <AgentList label={label}>
    {agents.map((agent) => (
      <AgentItem
        key={agent.paneId}
        agent={agent}
        hue={projectHue(agent.project, projects)}
        withProject
        now={now}
      />
    ))}
  </AgentList>
);

/**
 * The overview's main action, on its stage: how many agents need the reader and every one of them,
 * or that nobody does.
 */
const NeedsYou = ({
  agents,
  running,
  projects,
  now,
}: {
  readonly agents: ReadonlyArray<AgentView>;
  readonly running: number;
  readonly projects: ReadonlyArray<string>;
  readonly now: number;
}) =>
  agents.length === 0 ? (
    <Heading level={2}>{running === 0 ? 'No agents are running' : 'Nobody needs you'}</Heading>
  ) : (
    <section aria-label="Needs you">
      <Stack gap="lg">
        <Figure value={agents.length} unit={agents.length === 1 ? 'needs you' : 'need you'} />
        <Rows label="Needs you" agents={agents} projects={projects} now={now} />
      </Stack>
    </section>
  );

const Group = ({
  title,
  agents,
  projects,
  now,
  filter,
}: {
  readonly title: string;
  readonly agents: ReadonlyArray<AgentView>;
  /** Every project's name, in the order that gives each its colour. */
  readonly projects: ReadonlyArray<string>;
  readonly now: number;
  /** Shown under the heading, such as the project filter. */
  readonly filter?: ReactNode;
}) => (
  <section aria-label={title}>
    <Stack gap="xs">
      <SectionHeader title={title} count={agents.length} />
      {filter}
      <Rows label={title} agents={agents} projects={projects} now={now} />
    </Stack>
  </section>
);

/**
 * `/`: every live agent on a stage (spec 024 of the kit): how many need the reader and every one
 * of them on the sky, then Everything else by project, narrowed by a project filter. Its Projects action opens every project and the activity
 * timeline in a side sheet, and its Settings action opens the Settings page. It updates live.
 */
export const Overview = ({ client, onProject, onStarted, onSettings }: OverviewProps) => {
  const { live, unavailable } = useOverviewLive(client);
  const multiplexer = useMultiplexerName();
  const overview = useQuery(overviewQuery(client));
  const projects = useQuery(projectsQuery(client));
  const now = useNow();
  const [chosen, setChosen] = useState(ALL);
  const [projectsOpen, setProjectsOpen] = useState(false);

  const away =
    unavailable ??
    (overview.error instanceof RequestError && overview.error.status === 503
      ? overview.error.message
      : undefined);
  const data = overview.data;
  const names = projects.data?.map(({ name }) => name) ?? [];
  const groups = data?.groups ?? [];
  const filter = activeFilter(groups, chosen);
  const running = data === undefined ? undefined : data.needsYou.length + agentsOf(groups).length;
  // A project that leaves the list is forgotten, so it is not chosen again when it comes back.
  useEffect(() => {
    if (filter !== chosen) setChosen(filter);
  }, [filter, chosen]);

  return (
    <>
      <AppBar
        title="pocket-comms"
        subtitle={<LiveIndicator live={live} label={live ? 'Home server · live' : 'Connecting…'} />}
        end={
          <>
            <BrainstormAction />
            <IconButton icon="cards" label="Projects" onClick={() => setProjectsOpen(true)} />
            <IconButton icon="settings" label="Settings" onClick={onSettings} />
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
        onStarted={(project, created) => {
          setProjectsOpen(false);
          // A start without a running agent says so on the project's page.
          if (created.agent?.started === true) onStarted(created.agent.ref, created.agent.note);
          else onProject(project, startedNotice(created));
        }}
      />
      <Page
        kind="home"
        hero="stage"
        landmark="constellation"
        header={
          <Inline gap="sm">
            <Heading level={1}>Agents</Heading>
            {running === undefined ? null : <Text tone="muted">{`${running} running`}</Text>}
          </Inline>
        }
      >
        <Stack gap="lg">
          {away === undefined ? null : (
            <Alert>
              {multiplexer ?? 'The multiplexer'} is not running. The app keeps trying. ({away})
            </Alert>
          )}
          {overview.error !== null && away === undefined ? (
            <Alert>{overview.error.message}</Alert>
          ) : null}
          {projects.error === null ? null : <Alert>{projects.error.message}</Alert>}
          {data === undefined ? (
            overview.isPending ? (
              <Text tone="muted">Loading the agents…</Text>
            ) : null
          ) : (
            <>
              <NeedsYou agents={data.needsYou} running={running ?? 0} projects={names} now={now} />
              {groups.length === 0 ? null : (
                <Group
                  title="Everything else"
                  agents={agentsOf(groups, filter)}
                  projects={names}
                  now={now}
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
            </>
          )}
        </Stack>
      </Page>
    </>
  );
};

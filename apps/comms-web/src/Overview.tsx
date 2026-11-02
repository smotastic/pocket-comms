import {
  AgentList,
  Alert,
  Card,
  FilterChips,
  Link,
  List,
  ListItem,
  LiveIndicator,
  Page,
  SectionHeader,
  Stack,
  Text,
  TopBar,
} from '@pocket-comms/design-ui';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { AgentItem } from './AgentItem.js';
import type { AgentView, CommsClient, OverviewView } from './comms-client.js';
import { RequestError } from './comms-client.js';
import { overviewQuery, projectsQuery } from './comms-queries.js';
import { activeFilter, agentsOf, ALL } from './everything-else.js';
import { navigateOnPlainClick } from './links.js';
import { useNow, useOverviewLive } from './live.js';
import { OTHER_KEY, projectHue } from './rows.js';

export interface OverviewProps {
  readonly client: CommsClient;
  readonly onOpen: (ref: string) => void;
  /** Opens a project's page. */
  readonly onProject: (project: string) => void;
}

const projectHref = (project: string) => `/projects/${encodeURIComponent(project)}`;

const Group = ({
  title,
  agents,
  projects,
  now,
  onOpen,
  filter,
}: {
  readonly title: string;
  readonly agents: ReadonlyArray<AgentView>;
  /** Every project's name, in the order that gives each its colour. */
  readonly projects: ReadonlyArray<string>;
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
            hue={projectHue(agent.project, projects)}
            withProject
            now={now}
            onOpen={onOpen}
          />
        ))}
      </AgentList>
    </Stack>
  </section>
);

/** Every project that has an agent on the overview. */
const busyProjects = (overview: OverviewView) =>
  new Set([
    ...overview.groups.filter((group) => group.key !== OTHER_KEY).map((group) => group.name),
    ...overview.needsYou.flatMap((agent) => (agent.project === undefined ? [] : [agent.project])),
  ]);

/** The projects without an agent, each a link to its page. */
const IdleProjects = ({
  names,
  onProject,
}: {
  readonly names: ReadonlyArray<string>;
  readonly onProject: (project: string) => void;
}) => (
  <Card>
    <section aria-label="Projects">
      <Stack gap="xs">
        <SectionHeader title="Projects" count={names.length} />
        <List aria-label="Projects without agents">
          {names.map((name) => (
            <ListItem key={name}>
              <Link
                emphasis="strong"
                href={projectHref(name)}
                onClick={navigateOnPlainClick(() => onProject(name))}
              >
                {name}
              </Link>
            </ListItem>
          ))}
        </List>
      </Stack>
    </section>
  </Card>
);

/**
 * `/`: every live agent in two groups, Needs you and Everything else, the latter by project and
 * narrowed by a project filter; then the projects without agents. It updates live.
 */
export const Overview = ({ client, onOpen, onProject }: OverviewProps) => {
  const { live, unavailable } = useOverviewLive(client);
  const overview = useQuery(overviewQuery(client));
  const projects = useQuery(projectsQuery(client));
  const now = useNow();
  const [chosen, setChosen] = useState(ALL);

  const herdrAway =
    unavailable ??
    (overview.error instanceof RequestError && overview.error.status === 503
      ? overview.error.message
      : undefined);
  const data = overview.data;
  const names = projects.data?.map(({ name }) => name) ?? [];
  const groups = data?.groups ?? [];
  const filter = activeFilter(groups, chosen);
  // A project that leaves the list is forgotten, so it is not chosen again when it comes back.
  useEffect(() => {
    if (filter !== chosen) setChosen(filter);
  }, [filter, chosen]);
  const busy = data === undefined ? undefined : busyProjects(data);
  const idle =
    busy === undefined || projects.data === undefined
      ? []
      : names.filter((name) => !busy.has(name));
  const empty = data !== undefined && data.needsYou.length === 0 && groups.length === 0;

  return (
    <>
      <TopBar
        title="pocket-comms"
        subtitle={<LiveIndicator live={live} label={live ? 'Mac mini · live' : 'Connecting…'} />}
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
                  projects={names}
                  now={now}
                  onOpen={onOpen}
                />
              )}
              {groups.length === 0 ? null : (
                <Group
                  title="Everything else"
                  agents={agentsOf(groups, filter)}
                  projects={names}
                  now={now}
                  onOpen={onOpen}
                  filter={
                    groups.length < 2 ? undefined : (
                      <FilterChips
                        label="Project"
                        value={filter}
                        onChange={setChosen}
                        options={[
                          { value: ALL, label: 'All' },
                          ...groups.map((group) => ({
                            value: group.key,
                            label: group.name,
                            hue: projectHue(
                              group.key === OTHER_KEY ? undefined : group.name,
                              names,
                            ),
                          })),
                        ]}
                      />
                    )
                  }
                />
              )}
              {empty ? <Text tone="muted">No agents are running.</Text> : null}
              {idle.length === 0 ? null : <IdleProjects names={idle} onProject={onProject} />}
            </>
          )}
        </Stack>
      </Page>
    </>
  );
};

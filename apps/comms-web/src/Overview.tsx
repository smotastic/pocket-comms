import {
  AgentList,
  Alert,
  Card,
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
import { AgentItem } from './AgentItem.js';
import type { AgentView, CommsClient, OverviewView } from './comms-client.js';
import { RequestError } from './comms-client.js';
import { overviewQuery, projectsQuery } from './comms-queries.js';
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

const Section = ({
  title,
  withProject,
  projects,
  agents,
  now,
  onOpen,
  onTitle,
}: {
  readonly title: string;
  readonly withProject: boolean;
  /** Every project's name, in the order that gives each its colour. */
  readonly projects: ReadonlyArray<string>;
  readonly agents: ReadonlyArray<AgentView>;
  readonly now: number;
  readonly onOpen: (ref: string) => void;
  /** Makes the title a link to the project's page. */
  readonly onTitle?: (() => void) | undefined;
}) => (
  <Card>
    <section aria-label={title}>
      <Stack gap="xs">
        <SectionHeader
          title={title}
          count={agents.length}
          {...(onTitle === undefined
            ? {}
            : { link: { href: projectHref(title), label: `Open ${title}`, onNavigate: onTitle } })}
        />
        <AgentList label={title}>
          {agents.map((agent) => (
            <AgentItem
              key={agent.paneId}
              agent={agent}
              hue={projectHue(agent.project, projects)}
              withProject={withProject}
              now={now}
              onOpen={onOpen}
            />
          ))}
        </AgentList>
      </Stack>
    </section>
  </Card>
);

/** Every project that has an agent on the overview, in a card or in Needs you. */
const busyProjects = (overview: OverviewView) =>
  new Set([
    ...overview.groups.filter((group) => group.key !== OTHER_KEY).map((group) => group.name),
    ...overview.needsYou.flatMap((agent) => (agent.project === undefined ? [] : [agent.project])),
  ]);

/** The projects without an agent, each a link to its page (spec 008, requirement 5). */
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
 * `/`: every live agent, Needs you first, then a card per project and Other, then the projects
 * without agents. A project's card or row opens its page. It updates live.
 */
export const Overview = ({ client, onOpen, onProject }: OverviewProps) => {
  const { live, unavailable } = useOverviewLive(client);
  const overview = useQuery(overviewQuery(client));
  const projects = useQuery(projectsQuery(client));
  const now = useNow();

  const herdrAway =
    unavailable ??
    (overview.error instanceof RequestError && overview.error.status === 503
      ? overview.error.message
      : undefined);
  const data = overview.data;
  const names = projects.data?.map(({ name }) => name) ?? [];
  const known = new Set(names);
  const busy = data === undefined ? undefined : busyProjects(data);
  const idle =
    busy === undefined || projects.data === undefined
      ? []
      : projects.data.map(({ name }) => name).filter((name) => !busy.has(name));
  const empty = data !== undefined && data.needsYou.length === 0 && data.groups.length === 0;

  return (
    <>
      <TopBar
        title="pocket-comms"
        subtitle={<LiveIndicator live={live} label={live ? 'Mac mini · live' : 'Connecting…'} />}
      />
      <Page>
        <Stack gap="md">
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
                <Section
                  title="Needs you"
                  withProject
                  projects={names}
                  agents={data.needsYou}
                  now={now}
                  onOpen={onOpen}
                />
              )}
              {data.groups.map((group) => (
                <Section
                  key={group.key}
                  title={group.name}
                  withProject={group.key === OTHER_KEY}
                  projects={names}
                  agents={group.agents}
                  now={now}
                  onOpen={onOpen}
                  onTitle={
                    group.key !== OTHER_KEY && known.has(group.name)
                      ? () => onProject(group.name)
                      : undefined
                  }
                />
              ))}
              {empty ? <Text tone="muted">No agents are running.</Text> : null}
              {idle.length === 0 ? null : <IdleProjects names={idle} onProject={onProject} />}
            </>
          )}
        </Stack>
      </Page>
    </>
  );
};

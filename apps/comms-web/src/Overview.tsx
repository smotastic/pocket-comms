import {
  AgentRow,
  Alert,
  IconButton,
  Inline,
  LiveIndicator,
  Page,
  SectionHeader,
  Stack,
  StatusPill,
  Text,
  TopBar,
} from '@pocket-comms/design-ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { AgentView, CommsClient, TaskCreatedView } from './comms-client.js';
import { RequestError } from './comms-client.js';
import { overviewQuery } from './comms-queries.js';
import { kindOf, STATUS_LABELS } from './labels.js';
import { useNow, useOverviewLive } from './live.js';
import { NewTask } from './NewTask.js';
import { OTHER_KEY, rowName, rowTag, type RowSection } from './rows.js';
import { since } from './since.js';

export interface OverviewProps {
  readonly client: CommsClient;
  readonly onOpen: (ref: string) => void;
  /** Opens the projects and their Gitea issues. */
  readonly onProjects: () => void;
  /** Opens the conversation of an agent the New task sheet started, with a note to show there. */
  readonly onStarted: (ref: string, note: string | undefined) => void;
}

/** What the overview says after a task without a running agent was created. */
const createdNotice = (created: TaskCreatedView) => {
  const ready = `${created.branch} is ready in a new worktree.`;
  return created.agent?.note === undefined ? ready : `${ready} ${created.agent.note}`;
};

const withTag = (tag: string | undefined) => (tag === undefined ? {} : { tag });

const Row = ({
  agent,
  section,
  now,
  onOpen,
}: {
  readonly agent: AgentView;
  readonly section: RowSection;
  readonly now: number;
  readonly onOpen: (ref: string) => void;
}) => (
  <AgentRow
    href={`/agents/${encodeURIComponent(agent.ref)}`}
    onNavigate={() => onOpen(agent.ref)}
    kind={kindOf(agent.kind)}
    name={rowName(agent)}
    status={<StatusPill tone={agent.status} label={STATUS_LABELS[agent.status]} />}
    detail={agent.status === 'blocked' ? 'Needs your answer' : agent.title}
    {...withTag(rowTag(agent, section))}
    since={since(agent.changedAt, now)}
    {...(agent.status === 'blocked'
      ? { attention: 'blocked' as const }
      : agent.needsYou
        ? { attention: 'done' as const }
        : {})}
  />
);

const Section = ({
  title,
  section,
  agents,
  now,
  onOpen,
}: {
  readonly title: string;
  readonly section: RowSection;
  readonly agents: ReadonlyArray<AgentView>;
  readonly now: number;
  readonly onOpen: (ref: string) => void;
}) => (
  <section aria-label={title}>
    <Stack gap="xs">
      <SectionHeader title={title} count={agents.length} />
      {agents.map((agent) => (
        <Row key={agent.paneId} agent={agent} section={section} now={now} onOpen={onOpen} />
      ))}
    </Stack>
  </section>
);

/** `/`: every live agent, Needs you first, then by repository; it updates live. */
export const Overview = ({ client, onOpen, onProjects, onStarted }: OverviewProps) => {
  const { live, unavailable } = useOverviewLive(client);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const overview = useQuery(overviewQuery(client));
  const now = useNow();

  const herdrAway =
    unavailable ??
    (overview.error instanceof RequestError && overview.error.status === 503
      ? overview.error.message
      : undefined);
  const data = overview.data;
  const empty = data !== undefined && data.needsYou.length === 0 && data.groups.length === 0;

  return (
    <>
      <TopBar
        title="pocket-comms"
        subtitle={<LiveIndicator live={live} label={live ? 'Mac mini · live' : 'Connecting…'} />}
        end={
          <Inline gap="2xs" wrap={false}>
            <IconButton icon="issues" label="Projects" onClick={onProjects} />
            <IconButton
              icon="plus"
              label="New task"
              onClick={() => {
                setNotice(undefined);
                setCreating(true);
              }}
            />
          </Inline>
        }
      />
      <NewTask
        client={client}
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(created) => {
          setCreating(false);
          if (created.agent?.started === true) onStarted(created.agent.ref, created.agent.note);
          else setNotice(createdNotice(created));
        }}
      />
      <Page>
        <Stack gap="xl">
          {notice === undefined ? null : (
            <div role="status">
              <Text>{notice}</Text>
            </div>
          )}
          {herdrAway === undefined ? null : (
            <Alert>Herdr is not running. The app keeps trying. ({herdrAway})</Alert>
          )}
          {overview.error !== null && herdrAway === undefined ? (
            <Alert>{overview.error.message}</Alert>
          ) : null}
          {data === undefined ? (
            overview.isPending ? (
              <Text tone="muted">Loading the agents…</Text>
            ) : null
          ) : (
            <>
              {data.needsYou.length === 0 ? null : (
                <Section
                  title="Needs you"
                  section="needsYou"
                  agents={data.needsYou}
                  now={now}
                  onOpen={onOpen}
                />
              )}
              {data.groups.map((group) => (
                <Section
                  key={group.key}
                  title={group.name}
                  section={group.key === OTHER_KEY ? 'other' : 'project'}
                  agents={group.agents}
                  now={now}
                  onOpen={onOpen}
                />
              ))}
              {empty ? <Text tone="muted">No agents are running.</Text> : null}
            </>
          )}
        </Stack>
      </Page>
    </>
  );
};

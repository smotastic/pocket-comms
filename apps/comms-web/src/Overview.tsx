import {
  AgentRow,
  Alert,
  LiveIndicator,
  Page,
  SectionHeader,
  Stack,
  StatusPill,
  Text,
  TopBar,
} from '@pocket-comms/design-ui';
import { useQuery } from '@tanstack/react-query';
import type { AgentView, CommsClient } from './comms-client.js';
import { RequestError } from './comms-client.js';
import { overviewQuery } from './comms-queries.js';
import { kindOf, STATUS_LABELS } from './labels.js';
import { useNow, useOverviewLive } from './live.js';
import { since } from './since.js';

export interface OverviewProps {
  readonly client: CommsClient;
  readonly onOpen: (ref: string) => void;
}

const Row = ({
  agent,
  now,
  onOpen,
}: {
  readonly agent: AgentView;
  readonly now: number;
  readonly onOpen: (ref: string) => void;
}) => (
  <AgentRow
    href={`/agents/${encodeURIComponent(agent.ref)}`}
    onNavigate={() => onOpen(agent.ref)}
    kind={kindOf(agent.kind)}
    name={agent.ref}
    status={<StatusPill tone={agent.status} label={STATUS_LABELS[agent.status]} />}
    detail={agent.status === 'blocked' ? 'Needs your answer' : agent.title}
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
  agents,
  now,
  onOpen,
}: {
  readonly title: string;
  readonly agents: ReadonlyArray<AgentView>;
  readonly now: number;
  readonly onOpen: (ref: string) => void;
}) => (
  <section aria-label={title}>
    <Stack gap="xs">
      <SectionHeader title={title} count={agents.length} />
      {agents.map((agent) => (
        <Row key={agent.paneId} agent={agent} now={now} onOpen={onOpen} />
      ))}
    </Stack>
  </section>
);

/** `/`: every live agent, Needs you first, then by repository; it updates live. */
export const Overview = ({ client, onOpen }: OverviewProps) => {
  const { live, unavailable } = useOverviewLive(client);
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
      />
      <Page>
        <Stack gap="xl">
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
                <Section title="Needs you" agents={data.needsYou} now={now} onOpen={onOpen} />
              )}
              {data.groups.map((group) => (
                <Section
                  key={group.key}
                  title={group.name}
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

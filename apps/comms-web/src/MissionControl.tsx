import {
  Alert,
  AppBar,
  Button,
  Card,
  IconButton,
  Inline,
  Link,
  List,
  ListItem,
  Page,
  SectionHeader,
  Stack,
  Tag,
  Text,
} from '@smotastic/pocket-design';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type { CommsClient, MissionView } from './comms-client.js';
import { missionsKey, missionsQuery } from './comms-queries.js';
import { useNow } from './live.js';
import { ago } from './since.js';
import { AutopilotSection } from './AutopilotSection.js';
import { STATE_NAMES } from './mission-states.js';

export { STATE_NAMES } from './mission-states.js';

/** The versions it shipped, the issue a failure opened, and what it ships with. */
const DeployFacts = ({ mission }: { readonly mission: MissionView }) => (
  <>
    {mission.versions === undefined || mission.versions.length === 0 ? null : (
      <Text size="sm">{mission.versions.join(', ')}</Text>
    )}
    {mission.fixIssue === undefined ? null : (
      <Text size="sm">{`Fix issue #${mission.fixIssue}; the planet is paused until it is closed.`}</Text>
    )}
    {mission.output === undefined || mission.output === '' ? null : (
      <Text size="sm" tone="muted">
        {mission.output}
      </Text>
    )}
  </>
);

const laneName = (mission: MissionView) => (mission.lane === 'hop' ? 'Hop' : 'Full flight');

/** The mark of a mission Autopilot sent (spec 038). */
const AutopilotTag = ({ mission }: { readonly mission: MissionView }) =>
  mission.autopilot === true ? <Tag>Autopilot</Tag> : null;

/** How long a finished mission ran, in minutes or hours. */
export const ranFor = (mission: MissionView): string | undefined => {
  if (mission.startedAt === undefined || mission.finishedAt === undefined) return undefined;
  const minutes = Math.max(1, Math.round((mission.finishedAt - mission.startedAt) / 60_000));
  return minutes < 60 ? `ran ${minutes} min` : `ran ${(minutes / 60).toFixed(1)} h`;
};

const IssueLink = ({ mission }: { readonly mission: MissionView }) => (
  <Link emphasis="strong" external href={mission.issue.url}>
    {`${mission.planet} #${mission.issue.number} ${mission.issue.title}`}
  </Link>
);

/** A button that runs `action`, shows a failure, and reads Mission Control again. */
const Action = ({
  label,
  variant,
  action,
}: {
  readonly label: string;
  readonly variant: 'secondary' | 'danger';
  readonly action: () => Promise<void>;
}) => {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | undefined>(undefined);
  return (
    <Stack gap="xs">
      <Button
        size="sm"
        variant={variant}
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setFailure(undefined);
          action()
            .then(() => queryClient.invalidateQueries({ queryKey: missionsKey }))
            .catch((error: unknown) =>
              setFailure(error instanceof Error ? error.message : `${label} failed.`),
            )
            .finally(() => setBusy(false));
        }}
      >
        {label}
      </Button>
      {failure === undefined ? null : <Alert>{failure}</Alert>}
    </Stack>
  );
};

const Running = ({
  client,
  mission,
}: {
  readonly client: CommsClient;
  readonly mission: MissionView;
}) => (
  <Card>
    <section aria-label="Running mission">
      <Stack gap="xs">
        <SectionHeader title="Running" />
        <IssueLink mission={mission} />
        <Inline gap="xs">
          <Tag>{STATE_NAMES[mission.state]}</Tag>
          <Tag>{laneName(mission)}</Tag>
          <AutopilotTag mission={mission} />
          {mission.agent === undefined ? null : (
            <Link href={`/agents/${encodeURIComponent(mission.agent)}`}>Open its agent</Link>
          )}
          {mission.pullRequest === undefined ? null : (
            <Link external href={mission.pullRequest.url}>
              {`Pull request #${mission.pullRequest.number}`}
            </Link>
          )}
        </Inline>
        {mission.reason === undefined ? null : <Text size="sm">{mission.reason}</Text>}
        <DeployFacts mission={mission} />
        <Inline gap="xs">
          {mission.state === 'lost' ? (
            <Action
              label="Resume"
              variant="secondary"
              action={() => client.resumeMission(mission.id)}
            />
          ) : null}
          {mission.state === 'releasing' || mission.state === 'deploying' ? null : (
            <Action label="Abort" variant="danger" action={() => client.abortMission(mission.id)} />
          )}
        </Inline>
      </Stack>
    </section>
  </Card>
);

/**
 * Mission Control (spec 035): the running mission with Abort and Resume, the mission queue with
 * Remove, the mission log with what finished since the owner last looked, and Autopilot (spec 038). Opening it marks the
 * log seen; the marks stay on this screen until it reads the missions again.
 */
export const MissionControl = ({
  client,
  onBack,
}: {
  readonly client: CommsClient;
  readonly onBack: () => void;
}) => {
  const missions = useQuery(missionsQuery(client));
  const now = useNow();
  const marked = useRef(false);
  const data = missions.data;
  useEffect(() => {
    if (data === undefined || marked.current) return;
    marked.current = true;
    if (data.newCount > 0) void client.missionsSeen().catch(() => undefined);
  }, [client, data]);

  return (
    <>
      <AppBar
        start={<IconButton icon="back" label="Back to all agents" onClick={onBack} />}
        title="Mission Control"
      />
      <Page>
        <Stack gap="md">
          {missions.error === null ? null : <Alert>{missions.error.message}</Alert>}
          {missions.isPending ? <Text tone="muted">Reading the missions…</Text> : null}
          {data === undefined ? null : (
            <>
              {data.running === undefined ? (
                <Text tone="muted">No mission is running.</Text>
              ) : (
                <Running client={client} mission={data.running} />
              )}
              <Stack gap="xs">
                <SectionHeader title="Mission queue" count={data.queue.length} />
                {data.queue.length === 0 ? (
                  <Text tone="muted">No mission waits.</Text>
                ) : (
                  <List aria-label="Mission queue">
                    {data.queue.map((mission) => (
                      <ListItem key={mission.id}>
                        <Stack gap="xs">
                          <IssueLink mission={mission} />
                          <Inline gap="xs">
                            <Tag>{laneName(mission)}</Tag>
                            <AutopilotTag mission={mission} />
                            <Text as="span" size="sm" tone="muted">
                              {`sent ${ago(mission.sentAt, now)}`}
                            </Text>
                            <Action
                              label="Remove"
                              variant="secondary"
                              action={() => client.removeMission(mission.id)}
                            />
                          </Inline>
                        </Stack>
                      </ListItem>
                    ))}
                  </List>
                )}
              </Stack>
              <Stack gap="xs">
                <SectionHeader title="Mission log" count={data.log.length} />
                {data.log.length === 0 ? (
                  <Text tone="muted">No mission has finished yet.</Text>
                ) : (
                  <List aria-label="Mission log">
                    {data.log.map((mission) => (
                      <ListItem key={mission.id}>
                        <Stack gap="xs">
                          <IssueLink mission={mission} />
                          <Inline gap="xs">
                            {mission.isNew === true ? <Tag>New</Tag> : null}
                            <Tag>{STATE_NAMES[mission.state]}</Tag>
                            <Tag>{laneName(mission)}</Tag>
                            <AutopilotTag mission={mission} />
                            {mission.pullRequest === undefined ? null : (
                              <Link external href={mission.pullRequest.url}>
                                {`Pull request #${mission.pullRequest.number}`}
                              </Link>
                            )}
                            <Text as="span" size="sm" tone="muted">
                              {[
                                ranFor(mission),
                                mission.finishedAt === undefined
                                  ? undefined
                                  : `finished ${ago(mission.finishedAt, now)}`,
                              ]
                                .filter((part) => part !== undefined)
                                .join(' · ')}
                            </Text>
                          </Inline>
                          {mission.outcome === undefined && mission.reason === undefined ? null : (
                            <Text size="sm">{mission.outcome ?? mission.reason}</Text>
                          )}
                          {mission.outcome === undefined || mission.reason === undefined ? null : (
                            <Text size="sm">{mission.reason}</Text>
                          )}
                          <DeployFacts mission={mission} />
                          {mission.state === 'awaiting-deploy' &&
                          mission.deployWith === undefined ? (
                            <Action
                              label="Deploy"
                              variant="secondary"
                              action={() => client.deployMission(mission.id)}
                            />
                          ) : null}
                        </Stack>
                      </ListItem>
                    ))}
                  </List>
                )}
              </Stack>
            </>
          )}
          <AutopilotSection client={client} />
        </Stack>
      </Page>
    </>
  );
};

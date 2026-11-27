import {
  Alert,
  Button,
  Card,
  DescriptionList,
  Inline,
  SectionHeader,
  SegmentedControl,
  Stack,
  Text,
} from '@smotastic/pocket-design';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { CommsClient, PreflightView } from './comms-client.js';
import { planetsKey, preflightQuery } from './comms-queries.js';

type Check = PreflightView['checks'][number]['check'];
type Level = PreflightView['autonomy']['chosen'];

/** What each check is called on the page, in the order preflight runs them. */
const CHECK_NAMES: Readonly<Record<Check, string>> = {
  gitea: 'Gitea',
  'agents-md': 'AGENTS.md',
  'ci-workflow': 'CI workflow',
  'ci-green': 'CI green',
  'verify-script': 'Verify script',
  'mission-bot': 'Mission bot',
};

const LEVELS: ReadonlyArray<{ readonly id: Level; readonly label: string }> = [
  { id: 'manual', label: 'Manual' },
  // Spec 034 lets the owner choose only manual; the others come with missions and autopilot.
  { id: 'missions', label: 'Missions (coming)' },
  { id: 'autopilot', label: 'Autopilot (coming)' },
];

/** The sentence under the levels: the level in effect, and why when preflight lowered it. */
const inEffect = ({ autonomy, result }: PreflightView) =>
  autonomy.effective === autonomy.chosen
    ? `In effect: ${autonomy.effective}.`
    : `In effect: ${autonomy.effective}, lowered from ${autonomy.chosen} because preflight is ${result}.`;

/** Unregister, which asks in place before it unregisters (spec 034, requirement 14). */
const Unregister = ({
  client,
  planet,
  onUnregistered,
}: {
  readonly client: CommsClient;
  readonly planet: string;
  readonly onUnregistered: () => void;
}) => {
  const queryClient = useQueryClient();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | undefined>(undefined);

  if (!asking) {
    return (
      <Inline gap="md">
        <Button size="sm" variant="secondary" onClick={() => setAsking(true)}>
          Unregister
        </Button>
      </Inline>
    );
  }
  return (
    <Stack gap="xs">
      <Text>Unregister {planet}? Its agents keep running, under Other.</Text>
      {failure === undefined ? null : <Alert>{failure}</Alert>}
      <Inline gap="md">
        <Button
          size="sm"
          variant="danger"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setFailure(undefined);
            client
              .unregisterPlanet(planet)
              .then(async () => {
                await queryClient.invalidateQueries({ queryKey: planetsKey });
                onUnregistered();
              })
              .catch((error: unknown) => {
                setFailure(error instanceof Error ? error.message : 'Unregistering failed.');
                setBusy(false);
              });
          }}
        >
          Unregister {planet}
        </Button>
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => setAsking(false)}>
          Keep it
        </Button>
      </Inline>
    </Stack>
  );
};

export interface PreflightCardProps {
  readonly client: CommsClient;
  readonly planet: string;
  /** Called once the planet is unregistered, such as to leave its page. */
  readonly onUnregistered: () => void;
}

/**
 * A planet's preflight (spec 034): go or no-go, each check with its reason, the chosen and the
 * effective autonomy level, and Unregister.
 */
export const PreflightCard = ({ client, planet, onUnregistered }: PreflightCardProps) => {
  const preflight = useQuery(preflightQuery(client, planet));
  const data = preflight.data;

  return (
    <Card>
      <section aria-label="Preflight">
        <Stack gap="sm">
          <SectionHeader title="Preflight" />
          {preflight.error === null ? null : <Alert>{preflight.error.message}</Alert>}
          {preflight.isPending ? <Text tone="muted">Checking the planet…</Text> : null}
          {data === undefined ? null : (
            <>
              <Text>{data.result === 'go' ? 'Go' : 'No-go'}</Text>
              <DescriptionList
                label="Checks"
                items={data.checks.map(({ check, passed, reason }) => ({
                  term: CHECK_NAMES[check],
                  details: `${passed ? 'Passed' : 'Failed'}: ${reason}`,
                }))}
              />
              <SegmentedControl
                label="Autonomy level"
                options={LEVELS}
                selected={data.autonomy.chosen}
                onSelect={() => undefined}
                isDisabled
              />
              <Text size="sm" tone="muted">
                {inEffect(data)}
              </Text>
            </>
          )}
          <Unregister client={client} planet={planet} onUnregistered={onUnregistered} />
        </Stack>
      </section>
    </Card>
  );
};

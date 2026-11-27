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
import type { KNOWN_DEPLOY_CHECKS, KNOWN_PREFLIGHT_CHECKS } from '@pocket-comms/comms-contract';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { CommsClient, PreflightView } from './comms-client.js';
import { planetsKey, preflightKey, preflightQuery } from './comms-queries.js';

type Level = PreflightView['autonomy']['chosen'];

/** What each check is called on the page, in the order preflight runs them. */
const CHECK_NAMES: ReadonlyMap<string, string> = new Map(
  Object.entries({
    gitea: 'Gitea',
    'agents-md': 'AGENTS.md',
    'ci-workflow': 'CI workflow',
    'ci-green': 'CI green',
    'verify-script': 'Verify script',
    'mission-bot': 'Mission bot',
    'last-deploy': 'Last deploy',
  } satisfies Record<(typeof KNOWN_PREFLIGHT_CHECKS)[number], string>),
);

const DEPLOY_CHECK_NAMES: ReadonlyMap<string, string> = new Map(
  Object.entries({
    'release-settings': 'Releases',
    'deploy-script': 'Deploy script',
    'deploy-apps': 'Apps',
  } satisfies Record<(typeof KNOWN_DEPLOY_CHECKS)[number], string>),
);

/** A check's name on the page; one a newer server added shows by its own name (issue #124). */
const checkName = (check: string) => CHECK_NAMES.get(check) ?? check;

const LEVELS: ReadonlyArray<{ readonly id: Level; readonly label: string }> = [
  { id: 'manual', label: 'Manual' },
  { id: 'missions', label: 'Missions' },
  // Autopilot comes with step 5 of Mission Control.
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

/** A button that runs `action`, refreshes the preflight, and shows why it failed. */
const Act = ({
  label,
  planet,
  action,
}: {
  readonly label: string;
  readonly planet: string;
  readonly action: () => Promise<void>;
}) => {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | undefined>(undefined);
  return (
    <Stack gap="xs">
      <Inline gap="md">
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setFailure(undefined);
            action()
              .then(() => queryClient.invalidateQueries({ queryKey: preflightKey(planet) }))
              .catch((error: unknown) =>
                setFailure(error instanceof Error ? error.message : `${label} failed.`),
              )
              .finally(() => setBusy(false));
          }}
        >
          {label}
        </Button>
      </Inline>
      {failure === undefined ? null : <Alert>{failure}</Alert>}
    </Stack>
  );
};

/**
 * The apps the planet's releases name, each allowed or not, with Allow or Disallow (spec 037).
 * The list it sets is the named apps that stay allowed.
 */
const AllowedApps = ({
  client,
  planet,
  apps,
}: {
  readonly client: CommsClient;
  readonly planet: string;
  readonly apps: ReadonlyArray<{ readonly app: string; readonly allowed: boolean }>;
}) => {
  const allowed = apps.filter((each) => each.allowed).map((each) => each.app);
  return (
    <Stack gap="xs">
      <Text size="sm" tone="muted">
        Apps its releases may deploy
      </Text>
      {apps.map(({ app, allowed: isAllowed }) => (
        <Stack gap="xs" key={app}>
          <Text>
            {app}: {isAllowed ? 'allowed' : 'not allowed'}
          </Text>
          <Act
            label={isAllowed ? `Disallow ${app}` : `Allow ${app}`}
            planet={planet}
            action={() =>
              client.allowApps(
                planet,
                isAllowed ? allowed.filter((each) => each !== app) : [...allowed, app],
              )
            }
          />
        </Stack>
      ))}
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
 * effective autonomy level, and Unregister; Resume of a paused planet and its allowed apps
 * (spec 037).
 */
export const PreflightCard = ({ client, planet, onUnregistered }: PreflightCardProps) => {
  const preflight = useQuery(preflightQuery(client, planet));
  const queryClient = useQueryClient();
  const [choosing, setChoosing] = useState<string | undefined>(undefined);
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
                  term: checkName(check),
                  details: `${passed ? 'Passed' : 'Failed'}: ${reason}`,
                }))}
              />
              {data.deploy === undefined ? null : (
                <>
                  <Text>
                    {data.deploy.deploys
                      ? 'Deploys its missions'
                      : 'Does not deploy: its missions end merged'}
                  </Text>
                  <DescriptionList
                    label="Deploy checks"
                    items={data.deploy.checks.map(({ check, passed, reason }) => ({
                      term: DEPLOY_CHECK_NAMES.get(check) ?? check,
                      details: `${passed ? 'Passed' : 'Failed'}: ${reason}`,
                    }))}
                  />
                  {data.deploy.apps === undefined || data.deploy.apps.length === 0 ? null : (
                    <AllowedApps client={client} planet={planet} apps={data.deploy.apps} />
                  )}
                </>
              )}
              {data.checks.some((each) => each.check === 'last-deploy' && !each.passed) ? (
                <Act label="Resume" planet={planet} action={() => client.resumePlanet(planet)} />
              ) : null}
              <SegmentedControl
                label="Autonomy level"
                options={LEVELS}
                selected={data.autonomy.chosen}
                onSelect={(level) => {
                  if (level === 'autopilot' || level === data.autonomy.chosen) return;
                  setChoosing(undefined);
                  client
                    .chooseAutonomy(planet, level)
                    .then(() => queryClient.invalidateQueries({ queryKey: preflightKey(planet) }))
                    .catch((error: unknown) =>
                      setChoosing(error instanceof Error ? error.message : 'Choosing failed.'),
                    );
                }}
              />
              {choosing === undefined ? null : <Alert>{choosing}</Alert>}
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

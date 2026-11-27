import {
  Alert,
  Button,
  Card,
  Inline,
  Input,
  Link,
  List,
  ListItem,
  NumberField,
  SectionHeader,
  Stack,
  Switch,
  Tag,
  Text,
} from '@smotastic/pocket-design';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { AutopilotSettingsView, AutopilotView, CommsClient } from './comms-client.js';
import { autopilotKey, autopilotQuery } from './comms-queries.js';
import { STATE_NAMES } from './mission-states.js';

type Night = NonNullable<AutopilotView['night']>;
type Verdict = Night['triage'][number]['verdicts'][number];

const VERDICT_GROUPS: ReadonlyArray<{
  readonly verdict: Verdict['verdict'];
  readonly title: string;
}> = [
  { verdict: 'full-flight', title: 'Ready for your grilling' },
  { verdict: 'hop', title: 'Hops' },
  { verdict: 'not-ready', title: 'Not ready' },
];

/** The switch, the window and the budget; the switch keeps itself at once (spec 038, requirement 3). */
const Settings = ({
  client,
  settings,
}: {
  readonly client: CommsClient;
  readonly settings: AutopilotSettingsView;
}) => {
  const queryClient = useQueryClient();
  const [start, setStart] = useState(settings.start);
  const [end, setEnd] = useState(settings.end);
  const [budget, setBudget] = useState(settings.budget);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | undefined>(undefined);
  useEffect(() => {
    setStart(settings.start);
    setEnd(settings.end);
    setBudget(settings.budget);
  }, [settings]);

  const save = (next: AutopilotSettingsView) => {
    setBusy(true);
    setFailure(undefined);
    client
      .updateAutopilot(next)
      .then((view) => queryClient.setQueryData(autopilotKey, view))
      .catch((error: unknown) =>
        setFailure(error instanceof Error ? error.message : 'Saving failed.'),
      )
      .finally(() => setBusy(false));
  };

  return (
    <Stack gap="sm">
      <Switch
        label="Autopilot"
        description="Sends hops on the planets at autopilot, inside the window."
        isSelected={settings.enabled}
        isDisabled={busy}
        onChange={(enabled) => save({ ...settings, enabled })}
      />
      <Inline gap="sm">
        <Input
          label="Window opens"
          value={start}
          inputMode="numeric"
          placeholder="23:00"
          onChange={(event) => setStart(event.target.value)}
        />
        <Input
          label="Window closes"
          value={end}
          inputMode="numeric"
          placeholder="07:00"
          onChange={(event) => setEnd(event.target.value)}
        />
      </Inline>
      <NumberField
        label="Budget"
        description="The most missions Autopilot sends in one window."
        value={budget}
        minValue={0}
        maxValue={50}
        onChange={(value) => setBudget(Number.isNaN(value) ? 0 : value)}
      />
      <Inline gap="sm">
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => save({ ...settings, start, end, budget })}
        >
          Save window and budget
        </Button>
      </Inline>
      {failure === undefined ? null : <Alert>{failure}</Alert>}
    </Stack>
  );
};

const VerdictItem = ({
  planet,
  verdict,
}: {
  readonly planet: string;
  readonly verdict: Verdict;
}) => (
  <ListItem>
    <Stack gap="xs">
      <Link emphasis="strong" external href={verdict.url}>
        {`${planet} #${verdict.number} ${verdict.title}`}
      </Link>
      <Text size="sm" tone="muted">
        {verdict.reason}
      </Text>
    </Stack>
  </ListItem>
);

/** The current or latest window: what it triaged and sent, and why it stopped (requirement 20). */
const WindowFacts = ({ night, open }: { readonly night: Night; readonly open: boolean }) => {
  const verdicts = night.triage.flatMap((planet) =>
    planet.verdicts.map((verdict) => ({ planet: planet.planet, verdict })),
  );
  return (
    <Stack gap="sm">
      <SectionHeader title={open ? `Tonight (${night.window})` : `Last window (${night.window})`} />
      {night.stopped === undefined ? null : <Alert>{`Stopped: ${night.stopped}`}</Alert>}
      {night.triage
        .filter((planet) => planet.skipped !== undefined)
        .map((planet) => (
          <Text
            key={planet.planet}
            size="sm"
          >{`Triage of ${planet.planet} skipped: ${planet.skipped ?? ''}`}</Text>
        ))}
      {night.sent.length === 0 ? (
        <Text size="sm" tone="muted">
          No hop sent.
        </Text>
      ) : (
        <List aria-label="Sent by Autopilot">
          {night.sent.map((mission) => (
            <ListItem key={mission.id}>
              <Inline gap="xs">
                <Link external href={mission.issue.url}>
                  {`${mission.planet} #${mission.issue.number} ${mission.issue.title}`}
                </Link>
                <Tag>{STATE_NAMES[mission.state]}</Tag>
              </Inline>
            </ListItem>
          ))}
        </List>
      )}
      {VERDICT_GROUPS.map(({ verdict, title }) => {
        const group = verdicts.filter((each) => each.verdict.verdict === verdict);
        return group.length === 0 ? null : (
          <Stack key={verdict} gap="xs">
            <SectionHeader title={title} count={group.length} />
            <List aria-label={title}>
              {group.map((each) => (
                <VerdictItem
                  key={`${each.planet}#${each.verdict.number}`}
                  planet={each.planet}
                  verdict={each.verdict}
                />
              ))}
            </List>
          </Stack>
        );
      })}
    </Stack>
  );
};

/** Autopilot in Mission Control (spec 038). */
export const AutopilotSection = ({ client }: { readonly client: CommsClient }) => {
  const autopilot = useQuery(autopilotQuery(client));
  const data = autopilot.data;
  return (
    <Card>
      <section aria-label="Autopilot">
        <Stack gap="sm">
          <SectionHeader title="Autopilot" />
          {autopilot.error === null ? null : <Alert>{autopilot.error.message}</Alert>}
          {data === undefined ? null : (
            <>
              <Text size="sm">
                {[
                  `Window ${data.settings.start}–${data.settings.end}, ${data.open ? 'open now' : 'closed now'}.`,
                  data.planets.length === 0
                    ? 'No planet is at autopilot.'
                    : `At autopilot: ${data.planets.join(', ')}.`,
                ].join(' ')}
              </Text>
              <Settings client={client} settings={data.settings} />
              {data.night === undefined ? null : (
                <WindowFacts night={data.night} open={data.open} />
              )}
            </>
          )}
        </Stack>
      </section>
    </Card>
  );
};

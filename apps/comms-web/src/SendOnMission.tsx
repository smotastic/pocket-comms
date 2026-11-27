import {
  Alert,
  Button,
  Form,
  IconButton,
  Inline,
  Sheet,
  SheetHeader,
  Text,
} from '@smotastic/pocket-design';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CommsClient, IssueView, Lane, MissionView } from './comms-client.js';
import { issuesKey, missionsKey } from './comms-queries.js';

const LANES: ReadonlyArray<{ readonly id: Lane; readonly label: string }> = [
  { id: 'hop', label: 'Hop' },
  { id: 'full-flight', label: 'Full flight' },
];

/** The lane the issue's label names, when it names exactly one (spec 035, requirement 5). */
export const laneOfIssue = (issue: IssueView): Lane | undefined => {
  const named = LANES.filter(({ id }) => issue.labels.includes(`mission:${id}`));
  return named.length === 1 ? named[0]?.id : undefined;
};

const SendForm = ({
  client,
  planet,
  issue,
  onSent,
}: {
  readonly client: CommsClient;
  readonly planet: string;
  readonly issue: IssueView;
  readonly onSent: (mission: MissionView) => void;
}) => {
  const queryClient = useQueryClient();
  const named = laneOfIssue(issue);
  const send = useMutation({
    mutationFn: (lane: Lane) => client.sendOnMission(planet, issue.number, lane),
    onSuccess: async (mission) => {
      await queryClient.invalidateQueries({ queryKey: missionsKey });
      await queryClient.invalidateQueries({ queryKey: issuesKey(planet) });
      onSent(mission);
    },
  });

  return (
    <Form
      aria-label={`Send #${issue.number} on a mission`}
      onSubmit={(event) => event.preventDefault()}
      actions={
        <Inline gap="sm">
          {LANES.map(({ id, label }) => (
            <Button
              key={id}
              variant={named === id ? 'primary' : 'secondary'}
              disabled={send.isPending}
              onClick={() => send.mutate(id)}
            >
              {`Send as ${label.toLowerCase()}`}
            </Button>
          ))}
        </Inline>
      }
    >
      <Text tone="muted">
        An agent carries out the issue on its own, as the mission bot, until its pull request is
        merged. It waits its turn in the mission queue.
      </Text>
      <Text size="sm">
        {named === undefined
          ? 'The issue names no lane: pick one.'
          : `The issue's label names the lane ${named === 'hop' ? 'hop' : 'full flight'}.`}
      </Text>
      {send.isPending ? <Text size="sm">Sending…</Text> : null}
      {send.error === null ? null : <Alert>{send.error.message}</Alert>}
    </Form>
  );
};

export interface SendOnMissionProps {
  readonly client: CommsClient;
  readonly planet: string;
  /** The issue to send; none closes the sheet. */
  readonly issue: IssueView | undefined;
  readonly onClose: () => void;
  readonly onSent: (mission: MissionView) => void;
}

/** Send on a mission (spec 035): the issue, the lane picker and the send. */
export const SendOnMission = ({ client, planet, issue, onClose, onSent }: SendOnMissionProps) => (
  <Sheet
    open={issue !== undefined}
    label={issue === undefined ? 'Send on a mission' : `Send #${issue.number} on a mission`}
    bodyLabel="Send on a mission form"
    onClose={onClose}
    header={
      <SheetHeader
        title={issue === undefined ? 'Send on a mission' : `Send #${issue.number} on a mission`}
        {...(issue === undefined ? {} : { subtitle: issue.title })}
      >
        <IconButton icon="close" label="Close" onClick={onClose} />
      </SheetHeader>
    }
  >
    {issue === undefined ? null : (
      <SendForm key={issue.number} client={client} planet={planet} issue={issue} onSent={onSent} />
    )}
  </Sheet>
);

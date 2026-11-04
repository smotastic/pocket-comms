import {
  Alert,
  Button,
  IconButton,
  Sheet,
  SheetHeader,
  Stack,
  Text,
} from '@smotastic/pocket-design';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  RequestError,
  type AgentView,
  type CommsClient,
  type OverviewView,
} from './comms-client.js';
import { overviewQuery } from './comms-queries.js';

export interface CloseAgentProps {
  readonly client: CommsClient;
  /** The agent to close; it works in a linked worktree. */
  readonly agent: AgentView;
  readonly open: boolean;
  readonly onCancel: () => void;
  readonly onClosed: () => void;
}

/** The other live agents in the same worktree as `agent`, which close with it. */
const othersOf = (overview: OverviewView | undefined, agent: AgentView): ReadonlyArray<string> => {
  if (overview === undefined) return [];
  const refs = new Set(
    [...overview.needsYou, ...overview.groups.flatMap((group) => group.agents)]
      .filter(
        (each) =>
          each.ref !== agent.ref &&
          each.project === agent.project &&
          each.worktree === agent.worktree,
      )
      .map((each) => each.ref),
  );
  return [...refs];
};

const listed = (names: ReadonlyArray<string>) =>
  names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;

/**
 * The confirmation before an agent's worktree is removed. Nothing is removed before
 * the owner confirms, and changes are discarded only after a second, explicit confirmation.
 */
export const CloseAgent = ({ client, agent, open, onCancel, onClosed }: CloseAgentProps) => {
  const overview = useQuery({ ...overviewQuery(client), enabled: open });
  const close = useMutation({
    mutationFn: (force: boolean) => client.closeAgent(agent.ref, force),
    onSuccess: onClosed,
  });
  const hasChanges =
    close.error instanceof RequestError && close.error.problem === 'worktree-has-changes';
  const others = othersOf(overview.data, agent);
  const cancel = () => {
    close.reset();
    onCancel();
  };

  return (
    <Sheet
      open={open}
      label={`Close ${agent.ref}`}
      bodyLabel="Close confirmation"
      onClose={cancel}
      header={
        <SheetHeader title={`Close ${agent.ref}`} subtitle={agent.worktree ?? agent.workspace}>
          <IconButton icon="close" label="Cancel" onClick={cancel} />
        </SheetHeader>
      }
    >
      <Stack gap="md">
        <Text>
          This removes the worktree {agent.worktree} and its checkout folder, and closes its Herdr
          workspace. The branch stays.
        </Text>
        {others.length === 0 ? null : (
          <Text>
            {listed(others)} {others.length === 1 ? 'closes' : 'close'} too.
          </Text>
        )}
        {hasChanges ? (
          <>
            <Alert>
              The worktree has changes that are not committed. Closing it now discards them for
              good.
            </Alert>
            <Button variant="danger" disabled={close.isPending} onClick={() => close.mutate(true)}>
              Discard changes and close
            </Button>
          </>
        ) : (
          <>
            {close.error === null ? null : <Alert>{close.error.message}</Alert>}
            <Button variant="danger" disabled={close.isPending} onClick={() => close.mutate(false)}>
              {close.isPending ? 'Closing…' : 'Close worktree'}
            </Button>
          </>
        )}
      </Stack>
    </Sheet>
  );
};

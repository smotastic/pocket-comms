import {
  Alert,
  Button,
  Form,
  IconButton,
  Sheet,
  SheetHeader,
  Text,
} from '@smotastic/pocket-design';
import { useMutation } from '@tanstack/react-query';
import type { CommsClient, IssueView } from './comms-client.js';

export interface CloseIssueProps {
  readonly client: CommsClient;
  readonly planet: string;
  /** The issue to close; none closes the sheet. */
  readonly issue: IssueView | undefined;
  readonly onClose: () => void;
  readonly onClosed: (number: number) => void;
}

/** The agents, or the branch of a worktree without one, that still work on the issue. */
export const stillWorking = (issue: IssueView) =>
  issue.work.flatMap((work) =>
    work.agents.length === 0 ? [work.branch] : work.agents.map((agent) => agent.ref),
  );

/** Closes an issue in Gitea; the Close sheet and the planets sheet ask first. */
export const useCloseIssue = (
  client: CommsClient,
  planet: string,
  number: number,
  onClosed: (number: number) => void,
) =>
  useMutation({
    mutationFn: () => client.closeIssue(planet, number),
    onSuccess: () => onClosed(number),
  });

const CloseForm = ({
  client,
  planet,
  issue,
  onClose,
  onClosed,
}: Omit<CloseIssueProps, 'issue'> & { readonly issue: IssueView }) => {
  const close = useCloseIssue(client, planet, issue.number, onClosed);
  const working = stillWorking(issue);

  return (
    <Form
      aria-label={`Close #${issue.number}`}
      onSubmit={(event) => {
        event.preventDefault();
        if (!close.isPending) close.mutate();
      }}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={close.isPending}>
            {close.isPending ? 'Closing…' : 'Close issue'}
          </Button>
        </>
      }
    >
      <Text tone="muted">The issue is closed in Gitea. It can be reopened there.</Text>
      {working.length === 0 ? null : (
        <Text>Still worked on: {working.join(', ')}. Closing leaves them running.</Text>
      )}
      {close.error === null ? null : <Alert>{close.error.message}</Alert>}
    </Form>
  );
};

/**
 * The Close sheet (spec 010): the issue and a confirmation, so a stray tap never closes it. The
 * worktrees and agents on the issue stay as they are.
 */
export const CloseIssue = ({ client, planet, issue, onClose, onClosed }: CloseIssueProps) => (
  <Sheet
    open={issue !== undefined}
    label={issue === undefined ? 'Close issue' : `Close #${issue.number}`}
    bodyLabel="Close form"
    onClose={onClose}
    header={
      <SheetHeader
        title={issue === undefined ? 'Close issue' : `Close #${issue.number}`}
        {...(issue === undefined ? {} : { subtitle: issue.title })}
      >
        <IconButton icon="close" label="Dismiss" onClick={onClose} />
      </SheetHeader>
    }
  >
    {issue === undefined ? null : (
      <CloseForm
        key={issue.number}
        client={client}
        planet={planet}
        issue={issue}
        onClose={onClose}
        onClosed={onClosed}
      />
    )}
  </Sheet>
);

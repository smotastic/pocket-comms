import {
  Alert,
  Button,
  Form,
  IconButton,
  Input,
  Sheet,
  SheetHeader,
  Text,
  TextArea,
} from '@pocket-comms/design-ui';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import {
  RequestError,
  type CommsClient,
  type IssueView,
  type TaskCreatedView,
} from './comms-client.js';
import { withMarkNote } from './issue-groups.js';

export interface ImplementIssueProps {
  readonly client: CommsClient;
  readonly project: string;
  /** The issue to implement; none closes the sheet. */
  readonly issue: IssueView | undefined;
  readonly onClose: () => void;
  readonly onStarted: (created: TaskCreatedView) => void;
}

const ImplementForm = ({
  client,
  project,
  issue,
  onStarted,
}: Omit<ImplementIssueProps, 'issue' | 'onClose'> & { readonly issue: IssueView }) => {
  const [branch, setBranch] = useState(issue.branch);
  const [additionalInformation, setAdditionalInformation] = useState('');
  const start = useMutation({
    mutationFn: () =>
      client.implementIssue(
        project,
        issue.number,
        branch,
        additionalInformation.trim() === '' ? undefined : additionalInformation,
      ),
    onSuccess: (created) => onStarted(withMarkNote(created)),
  });
  const issues = start.error instanceof RequestError ? start.error.issues : [];
  const messageOf = (field: string) => issues.find((each) => each.field === field)?.message;
  const others = issues.filter(
    (each) => each.field !== 'branch' && each.field !== 'additionalInformation',
  );

  return (
    <Form
      aria-label={`Implement #${issue.number}`}
      onSubmit={(event) => {
        event.preventDefault();
        if (!start.isPending) start.mutate();
      }}
      actions={
        <Button type="submit" disabled={start.isPending}>
          {start.isPending ? 'Starting…' : 'Start Claude'}
        </Button>
      }
    >
      <Text tone="muted">
        Claude starts in a new worktree of {project}, with the issue as its first prompt.
      </Text>
      <Input
        label="Branch"
        value={branch}
        onChange={(event) => setBranch(event.target.value)}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        error={messageOf('branch')}
        required
      />
      <TextArea
        label="Additional information"
        value={additionalInformation}
        onChange={(event) => setAdditionalInformation(event.target.value)}
        placeholder="Optional hints or constraints for this run"
        error={messageOf('additionalInformation')}
      />
      {start.error !== null && (issues.length === 0 || others.length > 0) ? (
        <Alert>
          {others.length > 0 ? others.map((each) => each.message).join(' ') : start.error.message}
        </Alert>
      ) : null}
    </Form>
  );
};

/**
 * The Implement with Claude sheet (spec 006): the issue, its branch, the optional additional
 * information of spec 021, and the start. Nothing starts before the owner confirms the branch.
 */
export const ImplementIssue = ({
  client,
  project,
  issue,
  onClose,
  onStarted,
}: ImplementIssueProps) => (
  <Sheet
    open={issue !== undefined}
    label={issue === undefined ? 'Implement' : `Implement #${issue.number}`}
    bodyLabel="Implement form"
    onClose={onClose}
    header={
      <SheetHeader
        title={issue === undefined ? 'Implement' : `Implement #${issue.number}`}
        {...(issue === undefined ? {} : { subtitle: issue.title })}
      >
        <IconButton icon="close" label="Close" onClick={onClose} />
      </SheetHeader>
    }
  >
    {issue === undefined ? null : (
      <ImplementForm
        key={issue.number}
        client={client}
        project={project}
        issue={issue}
        onStarted={onStarted}
      />
    )}
  </Sheet>
);

import {
  Alert,
  Button,
  Form,
  IconButton,
  SegmentedControl,
  Sheet,
  SheetHeader,
  Text,
} from '@smotastic/pocket-design';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import type { AgentToStart, CommsClient, IssueView, TaskCreatedView } from './comms-client.js';

/** An issue's worktree that has no agent: the issue and the worktree's branch. */
export interface WorktreeToStart {
  readonly issue: IssueView;
  readonly branch: string;
}

export interface StartAgentSheetProps {
  readonly client: CommsClient;
  readonly project: string;
  /** The worktree to start an agent in; none closes the sheet. */
  readonly worktree: WorktreeToStart | undefined;
  readonly onClose: () => void;
  readonly onStarted: (created: TaskCreatedView) => void;
}

const KINDS: ReadonlyArray<{ readonly id: AgentToStart; readonly label: string }> = [
  { id: 'claude', label: 'Claude' },
  { id: 'pi', label: 'Pi' },
];

const StartForm = ({
  client,
  project,
  worktree,
  onStarted,
}: Omit<StartAgentSheetProps, 'worktree' | 'onClose'> & { readonly worktree: WorktreeToStart }) => {
  const [kind, setKind] = useState<AgentToStart>('claude');
  const start = useMutation({
    mutationFn: () =>
      client.startAgentInWorktree(project, worktree.issue.number, worktree.branch, kind),
    onSuccess: onStarted,
  });
  const name = kind === 'pi' ? 'Pi' : 'Claude';

  return (
    <Form
      aria-label={`Start an agent for #${worktree.issue.number}`}
      onSubmit={(event) => {
        event.preventDefault();
        if (!start.isPending) start.mutate();
      }}
      actions={
        <Button type="submit" disabled={start.isPending}>
          {start.isPending ? 'Starting…' : `Start ${name}`}
        </Button>
      }
    >
      <Text tone="muted">
        {name} starts in the existing worktree on {worktree.branch} of {project}. No new worktree or
        branch is made; the agent gets the task once it is ready.
      </Text>
      <SegmentedControl label="Agent" options={KINDS} selected={kind} onSelect={setKind} />
      {start.error === null ? null : <Alert>{start.error.message}</Alert>}
    </Form>
  );
};

/**
 * The Start an agent here sheet (spec 032): an issue's worktree without an agent gets a Claude or
 * Pi agent, with the kept prompt or the issue's task. Nothing starts before the owner confirms.
 */
export const StartAgentSheet = ({
  client,
  project,
  worktree,
  onClose,
  onStarted,
}: StartAgentSheetProps) => (
  <Sheet
    open={worktree !== undefined}
    label="Start an agent here"
    bodyLabel="Start an agent form"
    onClose={onClose}
    header={
      <SheetHeader
        title="Start an agent here"
        {...(worktree === undefined
          ? {}
          : { subtitle: `#${worktree.issue.number} ${worktree.issue.title}` })}
      >
        <IconButton icon="close" label="Close" onClick={onClose} />
      </SheetHeader>
    }
  >
    {worktree === undefined ? null : (
      <StartForm
        key={`${worktree.issue.number}/${worktree.branch}`}
        client={client}
        project={project}
        worktree={worktree}
        onStarted={onStarted}
      />
    )}
  </Sheet>
);

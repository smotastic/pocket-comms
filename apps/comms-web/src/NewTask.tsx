import {
  Alert,
  Button,
  Form,
  IconButton,
  Input,
  Segmented,
  Sheet,
  SheetHeader,
  Stack,
  Switch,
  TextArea,
} from '@pocket-comms/design-ui';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { suggestBranch } from './branch.js';
import {
  RequestError,
  type AgentToStart,
  type CommsClient,
  type TaskCreatedView,
} from './comms-client.js';

export interface NewTaskProps {
  readonly client: CommsClient;
  /** The project the task starts in (spec 008, requirement 11). */
  readonly project: string;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onCreated: (created: TaskCreatedView) => void;
}

const AGENT_OPTIONS = [
  { value: 'claude', label: 'Claude' },
  { value: 'pi', label: 'Pi' },
] as const;

const isAgentToStart = (value: string): value is AgentToStart =>
  AGENT_OPTIONS.some((option) => option.value === value);

const NewTaskForm = ({
  client,
  project,
  onCreated,
}: Pick<NewTaskProps, 'client' | 'project' | 'onCreated'>) => {
  const [task, setTask] = useState('');
  // The branch follows the task until the owner edits it (spec 005, requirement 6).
  const [editedBranch, setBranch] = useState<string | undefined>(undefined);
  const [startAgent, setStartAgent] = useState(true);
  const [kind, setKind] = useState<AgentToStart>('claude');
  const create = useMutation({ mutationFn: client.createTask, onSuccess: onCreated });

  const branch = editedBranch ?? (task.trim() === '' ? '' : suggestBranch(task));
  const issues = create.error instanceof RequestError ? create.error.issues : [];
  const issueOf = (field: string) => issues.find((issue) => issue.field === field)?.message;
  const unplaced = issues.filter((issue) => !['task', 'branch', 'agent'].includes(issue.field));

  return (
    <Form
      aria-label="New task"
      onSubmit={(event) => {
        event.preventDefault();
        if (create.isPending) return;
        create.mutate({
          project,
          task,
          branch,
          ...(startAgent ? { agent: { kind } } : {}),
        });
      }}
      actions={
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? 'Creating…' : 'Create'}
        </Button>
      }
    >
      <TextArea
        label="Task"
        placeholder="What should be done? The first line becomes the title."
        value={task}
        onChange={(event) => setTask(event.target.value)}
        error={issueOf('task')}
        required
      />
      <Input
        label="Branch"
        value={branch}
        onChange={(event) => setBranch(event.target.value)}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        error={issueOf('branch')}
        required
      />
      <Switch
        label="Start an agent"
        description="It gets the task as its first prompt."
        checked={startAgent}
        onChange={(event) => setStartAgent(event.target.checked)}
      />
      {startAgent ? (
        <Stack gap="xs">
          <Segmented
            label="Agent"
            options={AGENT_OPTIONS}
            value={kind}
            onChange={(value) => {
              if (isAgentToStart(value)) setKind(value);
            }}
          />
          {issueOf('agent') === undefined ? null : <Alert>{issueOf('agent')}</Alert>}
        </Stack>
      ) : null}
      {create.error !== null && (issues.length === 0 || unplaced.length > 0) ? (
        <Alert>
          {unplaced.length > 0
            ? unplaced.map((issue) => issue.message).join(' ')
            : create.error.message}
        </Alert>
      ) : null}
    </Form>
  );
};

/**
 * The New task sheet (spec 005) of one project (spec 008): the task, its branch and optionally an
 * agent. A closed sheet forgets what was typed; a failed create keeps it.
 */
export const NewTask = ({ client, project, open, onClose, onCreated }: NewTaskProps) => (
  <Sheet
    open={open}
    label="New task"
    bodyLabel="New task form"
    onClose={onClose}
    header={
      <SheetHeader title="New task" subtitle={`${project} · a new worktree in Herdr`}>
        <IconButton icon="close" label="Close" onClick={onClose} />
      </SheetHeader>
    }
  >
    <NewTaskForm client={client} project={project} onCreated={onCreated} />
  </Sheet>
);

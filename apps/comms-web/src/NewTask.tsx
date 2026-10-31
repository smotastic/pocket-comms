import {
  Alert,
  Button,
  Form,
  IconButton,
  Input,
  Segmented,
  Select,
  Sheet,
  SheetHeader,
  Stack,
  Switch,
  Text,
  TextArea,
} from '@pocket-comms/design-ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { suggestBranch } from './branch.js';
import {
  RequestError,
  type AgentToStart,
  type CommsClient,
  type TaskCreatedView,
} from './comms-client.js';
import { projectsQuery } from './comms-queries.js';

export interface NewTaskProps {
  readonly client: CommsClient;
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

const NewTaskForm = ({ client, onCreated }: Pick<NewTaskProps, 'client' | 'onCreated'>) => {
  const projects = useQuery(projectsQuery(client));
  const [chosenProject, setProject] = useState<string | undefined>(undefined);
  const [task, setTask] = useState('');
  // The branch follows the task until the owner edits it (spec 005, requirement 6).
  const [editedBranch, setBranch] = useState<string | undefined>(undefined);
  const [startAgent, setStartAgent] = useState(true);
  const [kind, setKind] = useState<AgentToStart>('claude');
  const create = useMutation({ mutationFn: client.createTask, onSuccess: onCreated });

  const project = chosenProject ?? projects.data?.[0]?.name ?? '';
  const branch = editedBranch ?? (task.trim() === '' ? '' : suggestBranch(task));
  const issues = create.error instanceof RequestError ? create.error.issues : [];
  const issueOf = (field: string) => issues.find((issue) => issue.field === field)?.message;
  const unplaced = issues.filter(
    (issue) => !['project', 'task', 'branch', 'agent'].includes(issue.field),
  );

  if (projects.error !== null) return <Alert>{projects.error.message}</Alert>;
  if (projects.data === undefined) return <Text tone="muted">Loading the projects…</Text>;
  if (projects.data.length === 0) {
    return <Text tone="muted">No git repositories were found in the projects folder.</Text>;
  }

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
      <Select
        label="Project"
        value={project}
        onChange={(event) => setProject(event.target.value)}
        options={projects.data.map(({ name, open }) => ({
          value: name,
          label: open ? `${name} · open in Herdr` : name,
        }))}
        error={issueOf('project')}
      />
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
 * The New task sheet (spec 005): a project, the task, its branch and optionally an agent. A
 * closed sheet forgets what was typed; a failed create keeps it.
 */
export const NewTask = ({ client, open, onClose, onCreated }: NewTaskProps) => (
  <Sheet
    open={open}
    label="New task"
    bodyLabel="New task form"
    onClose={onClose}
    header={
      <SheetHeader title="New task" subtitle="A new worktree in Herdr">
        <IconButton icon="close" label="Close" onClick={onClose} />
      </SheetHeader>
    }
  >
    <NewTaskForm client={client} onCreated={onCreated} />
  </Sheet>
);

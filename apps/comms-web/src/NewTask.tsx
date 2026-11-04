import {
  Alert,
  AttachButton,
  Button,
  Form,
  IconButton,
  Inline,
  Input,
  SegmentedControl,
  Sheet,
  SheetHeader,
  Stack,
  Switch,
  Text,
  TextArea,
} from '@smotastic/pocket-design';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { AttachedImages } from './AttachedImages.js';
import { useAttachments } from './attachments.js';
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

const AGENT_OPTIONS: ReadonlyArray<{ readonly id: AgentToStart; readonly label: string }> = [
  { id: 'claude', label: 'Claude' },
  { id: 'pi', label: 'Pi' },
];

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
  // Images go with the agent's first prompt, so only a task with an agent takes them; images left
  // on a task without one are sent anyway, and the server refuses them (spec 014, req. 11).
  const images = useAttachments(client);
  const busy = create.isPending || images.pending;

  const branch = editedBranch ?? (task.trim() === '' ? '' : suggestBranch(task));
  const issues = create.error instanceof RequestError ? create.error.issues : [];
  const issueOf = (field: string) => issues.find((issue) => issue.field === field)?.message;
  const unplaced = issues.filter(
    (issue) => !['task', 'branch', 'agent', 'imageIds'].includes(issue.field),
  );

  return (
    <Form
      aria-label="New task"
      onSubmit={(event) => {
        event.preventDefault();
        if (busy) return;
        create.mutate({
          project,
          task,
          branch,
          ...(startAgent ? { agent: { kind } } : {}),
          ...(images.ids.length > 0 ? { imageIds: images.ids } : {}),
        });
      }}
      actions={
        <Button type="submit" disabled={busy}>
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
        isSelected={startAgent}
        onChange={setStartAgent}
      />
      {startAgent ? (
        <Stack gap="xs">
          <SegmentedControl
            label="Agent"
            options={AGENT_OPTIONS}
            selected={kind}
            onSelect={setKind}
          />
          {issueOf('agent') === undefined ? null : <Alert>{issueOf('agent')}</Alert>}
        </Stack>
      ) : null}
      {startAgent || images.attachments.length > 0 ? (
        <Stack gap="xs">
          <Text size="sm" tone="muted">
            Images for the first prompt
          </Text>
          <Inline gap="xs">
            {startAgent ? (
              <AttachButton
                label="Attach image"
                icon="image"
                acceptedFileTypes={['image/*']}
                onSelect={(files) => void images.add(files)}
                isDisabled={images.full}
              />
            ) : null}
            <AttachedImages
              attachments={images.attachments}
              onRemove={images.remove}
              onRetry={images.retry}
            />
          </Inline>
          {images.notice === undefined ? null : <Alert>{images.notice}</Alert>}
          {issueOf('imageIds') === undefined ? null : <Alert>{issueOf('imageIds')}</Alert>}
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

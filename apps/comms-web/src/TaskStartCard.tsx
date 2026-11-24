import { Alert, Button, Card, Inline, Stack, Text, TextArea } from '@smotastic/pocket-design';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { CommsClient, TaskStartView } from './comms-client.js';
import { conversationKey, taskStartKey, taskStartQuery } from './comms-queries.js';

export interface TaskStartCardProps {
  readonly client: CommsClient;
  readonly agentRef: string;
  /** Offer the issue's task when the worktree has no kept start (Send the issue's task…). */
  readonly fromIssue: boolean;
}

const TITLES: Record<TaskStartView['delivery'], string> = {
  pending: 'Starting the agent…',
  uncertain: 'The task may not have arrived',
  'not-started': 'The task was not sent',
  'not-sent': 'The task was not sent',
};

const titleOf = (start: TaskStartView): string =>
  start.source === 'issue' ? 'Send the issue’s task' : TITLES[start.delivery];

const explanationOf = (start: TaskStartView): string | undefined => {
  if (start.source === 'issue') {
    return 'Prompt built from the issue. The agent may have it already: check the conversation before you send it.';
  }
  if (start.delivery === 'uncertain') {
    return 'Check the conversation before you send it again.';
  }
  return start.reason;
};

const WAITING: Record<TaskStartView['agent']['status'], string> = {
  blocked: 'Answer the agent’s question first. The task stays here until then.',
  working: 'The agent is working. Send the task when it is idle.',
  idle: 'The agent is not ready for input yet.',
  done: 'The agent is not ready for input. Look at its screen.',
  unknown: 'The agent is not ready for input. Look at its screen.',
};

// Why Send waits: the app never answers a dialog and never prompts an agent that is not ready.
const waitingOf = ({ agent }: TaskStartView): string | undefined =>
  agent.status === 'idle' && agent.ready ? undefined : WAITING[agent.status];

const facts = (start: TaskStartView): string =>
  [start.branch, start.issue === undefined ? undefined : `issue #${start.issue}`]
    .filter((part) => part !== undefined)
    .join(' · ');

const StartForm = ({
  client,
  agentRef,
  fromIssue,
  start,
}: TaskStartCardProps & { readonly start: TaskStartView }) => {
  const queryClient = useQueryClient();
  const [prompt, setPrompt] = useState(start.prompt);
  const [dismissing, setDismissing] = useState(false);
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: taskStartKey(agentRef, fromIssue) }),
      queryClient.invalidateQueries({ queryKey: conversationKey(agentRef) }),
    ]);
  const uncertain = start.delivery === 'uncertain';
  const send = useMutation({
    mutationFn: () =>
      client.sendTaskStart(agentRef, {
        prompt,
        ...(uncertain ? { anyway: true } : {}),
        ...(start.source === 'issue' ? { fromIssue: true } : {}),
      }),
    onSettled: refresh,
  });
  const dismiss = useMutation({
    mutationFn: () => client.dismissTaskStart(agentRef),
    onSettled: refresh,
  });
  const waiting = waitingOf(start);
  const pending = start.delivery === 'pending';
  const busy = send.isPending || dismiss.isPending;
  const notDelivered =
    send.data !== undefined && send.data.delivery !== 'delivered' ? send.data : undefined;
  const explanation = explanationOf(start);

  return (
    <Stack gap="sm">
      <Text tone="muted" size="sm">
        {facts(start)}
      </Text>
      {explanation === undefined ? null : <Text>{explanation}</Text>}
      {pending ? null : (
        <>
          <TextArea
            label="Task"
            value={prompt}
            rows={6}
            onChange={(event) => setPrompt(event.target.value)}
          />
          {waiting === undefined ? null : <Alert tone="info">{waiting}</Alert>}
          {send.error === null ? null : <Alert>{send.error.message}</Alert>}
          {dismiss.error === null ? null : <Alert>{dismiss.error.message}</Alert>}
          {notDelivered === undefined ? null : (
            <Alert tone="warning">{notDelivered.reason ?? 'The task was not sent.'}</Alert>
          )}
          {dismissing ? (
            <Stack gap="xs">
              <Text>Dismiss the task? Nothing is sent, and the task is gone from here.</Text>
              <Inline gap="xs">
                <Button size="sm" variant="danger" disabled={busy} onClick={() => dismiss.mutate()}>
                  Dismiss the task
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDismissing(false)}>
                  Keep it
                </Button>
              </Inline>
            </Stack>
          ) : (
            <Inline gap="xs">
              <Button
                size="sm"
                disabled={busy || waiting !== undefined || prompt.trim() === ''}
                onClick={() => send.mutate()}
              >
                {send.isPending ? 'Sending…' : uncertain ? 'Send anyway' : 'Send'}
              </Button>
              {start.source === 'issue' ? null : (
                <Button size="sm" variant="ghost" onClick={() => setDismissing(true)}>
                  Dismiss
                </Button>
              )}
            </Inline>
          )}
        </>
      )}
    </Stack>
  );
};

/**
 * The Task not sent card (spec 032): the first prompt a task start did not deliver, to edit and
 * send once the agent is idle and ready, or to dismiss. A prompt that may have arrived is sent only
 * through Send anyway.
 */
export const TaskStartCard = ({ client, agentRef, fromIssue }: TaskStartCardProps) => {
  const start = useQuery(taskStartQuery(client, agentRef, fromIssue));
  if (start.data === undefined || start.data === null) return null;
  return (
    <Card title={titleOf(start.data)}>
      <StartForm
        key={start.data.prompt}
        client={client}
        agentRef={agentRef}
        fromIssue={fromIssue}
        start={start.data}
      />
    </Card>
  );
};

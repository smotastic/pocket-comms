import {
  Activity,
  Alert,
  ApprovalPanel,
  Composer,
  DockedPage,
  IconButton,
  KeyPad,
  Markdown,
  QuestionCard,
  Segmented,
  Stack,
  StatusPill,
  TerminalScreen,
  Text,
  ToolLine,
  TopBar,
  UserMessage,
} from '@pocket-comms/design-ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ConversationMenu } from './brainstorm-placement.prototype.js';
import type { AgentView, CommsClient, Key, TranscriptView } from './comms-client.js';
import { RequestError } from './comms-client.js';
import { CloseAgent } from './CloseAgent.js';
import { agentQuery, screenQuery, transcriptQuery } from './comms-queries.js';
import { kindOf, STATUS_LABELS } from './labels.js';
import { useAgentLive } from './live.js';

export interface ConversationProps {
  readonly client: CommsClient;
  readonly agentRef: string;
  readonly onBack: () => void;
  /** What the New task flow could not do for this agent, such as send the task (spec 005). */
  readonly note?: string | undefined;
}

type View = 'chat' | 'screen';

const KEYS: ReadonlyArray<{ value: Key; label: string; accessibleLabel?: string }> = [
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: 'up', label: '↑', accessibleLabel: 'Up' },
  { value: 'down', label: '↓', accessibleLabel: 'Down' },
  { value: 'enter', label: 'Enter' },
  { value: 'esc', label: 'Esc' },
];
const CTRL_C = { value: 'ctrl+c', label: 'Ctrl-C', accessibleLabel: 'Hold to send Control C' };

const isKey = (value: string): value is Key =>
  value === CTRL_C.value || KEYS.some((key) => key.value === value);

// A call that asked the owner questions waits while pending and failed when they never answered.
const QUESTION_STATES = { pending: 'waiting', ok: 'answered', error: 'unanswered' } as const;

const Chat = ({
  transcript,
  failed,
}: {
  readonly transcript: TranscriptView | undefined;
  /** The session cannot be read, such as before the agent's first prompt. */
  readonly failed: boolean;
}) => {
  if (transcript === undefined) {
    return (
      <Text tone="muted">{failed ? 'No conversation yet.' : 'Loading the conversation…'}</Text>
    );
  }
  if (transcript.entries.length === 0) return <Text tone="muted">Nothing was said yet.</Text>;
  return (
    <>
      {transcript.entries.map((entry) => {
        switch (entry.type) {
          case 'user':
            return <UserMessage key={entry.id}>{entry.text}</UserMessage>;
          case 'assistant':
            return <Markdown key={entry.id} text={entry.text} />;
          case 'tool':
            if (entry.questions !== undefined) {
              return (
                <QuestionCard
                  key={entry.id}
                  questions={entry.questions.map(({ header, text, answer }) => ({
                    text,
                    ...(header === undefined ? {} : { header }),
                    ...(answer === undefined ? {} : { answer }),
                  }))}
                  state={QUESTION_STATES[entry.outcome]}
                />
              );
            }
            return (
              <ToolLine
                key={entry.id}
                verb={entry.verb}
                {...(entry.target === undefined ? {} : { target: entry.target })}
                {...(entry.added === undefined ? {} : { added: entry.added })}
                {...(entry.removed === undefined ? {} : { removed: entry.removed })}
                outcome={entry.outcome}
              />
            );
        }
      })}
    </>
  );
};

const Header = ({
  agent,
  view,
  onView,
  onBack,
  onClose,
}: {
  readonly agent: AgentView | undefined;
  readonly view: View;
  readonly onView: (view: View) => void;
  readonly onBack: () => void;
  /** Asks to close the agent; only an agent in a linked worktree can be closed. */
  readonly onClose?: () => void;
}) => (
  <Stack gap="2xs">
    <TopBar
      start={<IconButton icon="back" label="Back to all agents" onClick={onBack} />}
      title={agent?.ref ?? '…'}
      {...(agent === undefined
        ? {}
        : { subtitle: <StatusPill tone={agent.status} label={STATUS_LABELS[agent.status]} /> })}
      end={
        <>
          {agent?.format === undefined ? null : (
            <Segmented
              label="View"
              options={[
                { value: 'chat', label: 'Chat' },
                { value: 'screen', label: 'Screen' },
              ]}
              value={view}
              onChange={(value) => onView(value === 'screen' ? 'screen' : 'chat')}
            />
          )}
          <ConversationMenu
            {...(agent?.worktree === undefined || onClose === undefined
              ? {}
              : { close: { label: `Close ${agent.ref}`, onClose } })}
          />
        </>
      }
    />
    {agent === undefined ? null : (
      <Text tone="muted" size="sm" truncate>
        {kindOf(agent.kind).label}
        {agent.cwd === undefined ? '' : ` · ${agent.cwd}`}
      </Text>
    )}
  </Stack>
);

/**
 * `/agents/$agent`: a Claude or Pi agent's session as a chat, or any agent's terminal screen, with
 * the composer, or the approval keys while the agent is blocked. It updates live.
 */
export const Conversation = ({ client, agentRef, onBack, note }: ConversationProps) => {
  useAgentLive(client, agentRef);
  const agentResult = useQuery(agentQuery(client, agentRef));
  const agent = agentResult.data;
  const hasChat = agent?.format !== undefined;
  const [chosen, setChosen] = useState<View>('chat');
  const view: View = hasChat ? chosen : 'screen';
  const blocked = agent?.status === 'blocked';

  const transcript = useQuery({ ...transcriptQuery(client, agentRef), enabled: hasChat });
  const screen = useQuery({
    ...screenQuery(client, agentRef),
    enabled: agent !== undefined && (view === 'screen' || blocked),
  });

  // Opening a done agent shows its completion, so it leaves Needs you (requirement 11). A failed
  // attempt is tried again; the overview keeps the agent under Needs you until one succeeds.
  const unseenDone = agent?.status === 'done' && agent.needsYou;
  const { mutate: markSeen } = useMutation({ mutationFn: () => client.seen(agentRef), retry: 3 });
  useEffect(() => {
    if (unseenDone) markSeen();
  }, [markSeen, unseenDone]);

  const [closing, setClosing] = useState(false);
  const [draft, setDraft] = useState('');
  const prompt = useMutation({
    mutationFn: (text: string) => client.prompt(agentRef, text),
    onSuccess: () => setDraft(''),
  });
  const keys = useMutation({ mutationFn: (key: Key) => client.keys(agentRef, [key]) });
  // Only the latest send can fail visibly: a new one clears the reason of the other.
  const failure = prompt.error ?? keys.error;
  const sendPrompt = (text: string) => {
    keys.reset();
    prompt.mutate(text);
  };
  const pressKey = (key: Key) => {
    prompt.reset();
    keys.mutate(key);
  };

  if (agentResult.error instanceof RequestError && agentResult.error.status === 404) {
    return (
      <DockedPage
        label="Conversation"
        header={<Header agent={undefined} view={view} onView={setChosen} onBack={onBack} />}
        footer={null}
      >
        <Text tone="muted">{agentRef} is not running any more.</Text>
      </DockedPage>
    );
  }

  if (agent === undefined) {
    return (
      <DockedPage
        label="Conversation"
        header={<Header agent={undefined} view={view} onView={setChosen} onBack={onBack} />}
        footer={null}
      >
        {agentResult.error === null ? (
          <Text tone="muted">Loading the agent…</Text>
        ) : (
          <Alert>{agentResult.error.message}</Alert>
        )}
      </DockedPage>
    );
  }

  const screenText = screen.data ?? '';
  const name = agent.ref;
  const kindLabel = kindOf(agent.kind).label;

  return (
    <DockedPage
      label={`Conversation with ${name}`}
      header={
        <Header
          agent={agent}
          view={view}
          onView={setChosen}
          onBack={onBack}
          onClose={() => setClosing(true)}
        />
      }
      footer={
        <Stack gap="xs">
          {failure === null ? null : <Alert>{failure.message}</Alert>}
          {blocked || view === 'screen' ? (
            <KeyPad
              label="Keys"
              keys={KEYS}
              holdKey={CTRL_C}
              disabled={keys.isPending}
              onKey={(value) => {
                if (isKey(value)) pressKey(value);
              }}
            />
          ) : null}
          {blocked ? (
            <Text tone="muted" size="sm">
              {view === 'chat' ? 'Answer above to continue' : 'Answer with the keys'}
            </Text>
          ) : (
            <Composer
              label="Message"
              value={draft}
              onChange={setDraft}
              onSend={sendPrompt}
              placeholder={`Message ${name}`}
              locked={prompt.isPending}
            />
          )}
        </Stack>
      }
    >
      <Stack gap="md">
        {note === undefined ? null : (
          <div role="status">
            <Text tone="muted">{note}</Text>
          </div>
        )}
        {view === 'screen' ? (
          <TerminalScreen label={`Screen of ${name}`} text={screenText} />
        ) : (
          <>
            <Chat transcript={transcript.data} failed={transcript.error !== null} />
            {agent.status === 'working' ? (
              <Activity label={transcript.data?.activity ?? 'Thinking…'} />
            ) : null}
            {blocked ? (
              <ApprovalPanel title={`${kindLabel} needs your answer`}>
                <TerminalScreen label={`Screen of ${name}`} text={screenText} />
              </ApprovalPanel>
            ) : null}
          </>
        )}
      </Stack>
      {agent.worktree === undefined ? null : (
        <CloseAgent
          client={client}
          agent={agent}
          open={closing}
          onCancel={() => setClosing(false)}
          onClosed={onBack}
        />
      )}
    </DockedPage>
  );
};

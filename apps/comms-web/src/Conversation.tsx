import {
  Activity,
  Alert,
  AppBar,
  Card,
  Composer,
  DockedPage,
  IconButton,
  SegmentedControl,
  Stack,
  Text,
} from '@smotastic/pocket-design';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type { AgentView, CommsClient, Key } from './comms-client.js';
import { RequestError } from './comms-client.js';
import { AttachedImages } from './AttachedImages.js';
import { BackgroundStrip } from './BackgroundStrip.js';
import { useAttachments } from './attachments.js';
import { delegationLink, stripItems } from './background.js';
import { Chat } from './Chat.js';
import { CloseAgent } from './CloseAgent.js';
import { ConversationMenu } from './ConversationMenu.js';
import { agentQuery, screenQuery, transcriptQuery } from './comms-queries.js';
import { KeyPad } from './KeyPad.js';
import { kindOf, STATUS_LABELS } from './labels.js';
import { useAgentLive, useNow } from './live.js';
import { StatusBadge } from './StatusBadge.js';
import { TerminalScreen } from './TerminalScreen.js';

export interface ConversationProps {
  readonly client: CommsClient;
  readonly agentRef: string;
  readonly onBack: () => void;
  /** Opens a subagent's conversation, by its id. */
  readonly onOpenSubagent: (id: string) => void;
  /** What the New task flow could not do for this agent, such as send the task (spec 005). */
  readonly note?: string | undefined;
  /**
   * Called once, in place of saying so, when the agent turns out to be gone before it was ever
   * shown; one that ends while it is open still says that it is not running any more.
   */
  readonly onGone?: (() => void) | undefined;
}

type View = 'chat' | 'screen';

const VIEWS: ReadonlyArray<{ readonly id: View; readonly label: string }> = [
  { id: 'chat', label: 'Chat' },
  { id: 'screen', label: 'Screen' },
];

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
    <AppBar
      start={<IconButton icon="back" label="Back to all agents" onClick={onBack} />}
      title={agent?.ref ?? '…'}
      {...(agent === undefined
        ? {}
        : { subtitle: <StatusBadge tone={agent.status} label={STATUS_LABELS[agent.status]} /> })}
      end={
        <>
          {agent?.format === undefined ? null : (
            <SegmentedControl
              label="View"
              layout="inline"
              options={VIEWS}
              selected={view}
              onSelect={onView}
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
export const Conversation = ({
  client,
  agentRef,
  onBack,
  onOpenSubagent,
  note,
  onGone,
}: ConversationProps) => {
  useAgentLive(client, agentRef);
  const now = useNow(60_000);
  const [backgroundOpen, setBackgroundOpen] = useState(false);
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
  const images = useAttachments(client);
  // A successful send clears the text and the images; a failed one keeps both (spec 014).
  const prompt = useMutation({
    mutationFn: ({ text, imageIds }: { text: string; imageIds: ReadonlyArray<string> }) =>
      client.prompt(agentRef, text, imageIds),
    onSuccess: () => {
      setDraft('');
      images.clear();
    },
  });
  const keys = useMutation({ mutationFn: (key: Key) => client.keys(agentRef, [key]) });
  // Only the latest send can fail visibly: a new one clears the reason of the other.
  const failure = prompt.error ?? keys.error;
  const sendPrompt = (text: string) => {
    keys.reset();
    prompt.mutate({ text, imageIds: images.ids });
  };
  const pressKey = (key: Key) => {
    prompt.reset();
    keys.mutate(key);
  };

  const gone = agentResult.error instanceof RequestError && agentResult.error.status === 404;
  const shown = useRef(false);
  if (agent !== undefined) shown.current = true;
  const leave = useRef(onGone);
  leave.current = onGone;
  useEffect(() => {
    if (!gone || shown.current) return;
    const gonePage = leave.current;
    leave.current = undefined;
    gonePage?.();
  }, [gone]);

  if (gone) {
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
          {images.notice === undefined ? null : <Alert>{images.notice}</Alert>}
          {agent.background.length === 0 ? null : (
            <BackgroundStrip
              items={stripItems(agent, now, onOpenSubagent)}
              expanded={backgroundOpen}
              onExpandedChange={setBackgroundOpen}
            />
          )}
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
              locked={prompt.isPending || images.pending}
              attach={{
                label: 'Attach image',
                icon: 'image',
                acceptedFileTypes: ['image/*'],
                onSelect: (files) => void images.add(files),
                isDisabled: images.full,
              }}
              sendable={images.ids.length > 0}
              {...(images.attachments.length === 0
                ? {}
                : {
                    attachments: (
                      <AttachedImages
                        attachments={images.attachments}
                        onRemove={images.remove}
                        onRetry={images.retry}
                      />
                    ),
                  })}
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
            <Chat
              transcript={transcript.data}
              failed={transcript.error !== null}
              imageUrl={client.imageUrl}
              linkOf={delegationLink(agent, onOpenSubagent)}
            />
            {agent.status === 'working' ? (
              <Activity label={transcript.data?.activity ?? 'Thinking…'} />
            ) : null}
            {blocked ? (
              <Card title={`${kindLabel} needs your answer`}>
                <TerminalScreen label={`Screen of ${name}`} text={screenText} />
              </Card>
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

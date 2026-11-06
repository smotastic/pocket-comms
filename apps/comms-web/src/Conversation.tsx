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
  TerminalScreen,
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
import { agentQuery, quickRepliesQuery, screenQuery, transcriptQuery } from './comms-queries.js';
import { KeyPad } from './KeyPad.js';
import { QuickReplies, SuggestedReplies } from './QuickReplies.js';
import { kindOf, STATUS_LABELS } from './labels.js';
import { useAgentLive, useNow } from './live.js';
import { StatusBadge } from './StatusBadge.js';

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
  { value: 'left', label: '←', accessibleLabel: 'Left' },
  { value: 'right', label: '→', accessibleLabel: 'Right' },
  { value: 'enter', label: 'Enter' },
  { value: 'esc', label: 'Esc' },
];
const CTRL_C = { value: 'ctrl+c', label: 'Ctrl-C', accessibleLabel: 'Hold to send Control C' };

/**
 * A text to send, whether it came from a field, which a successful send clears, and the message
 * it answers, whose suggestions a successful send hides.
 */
type Send = { readonly text: string; readonly fromField: boolean; readonly answers?: string };

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
 * the composer, the suggested and the owner's quick replies, or the keys and a field that types
 * into the waiting dialog while the agent is blocked. It updates live.
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
  const quickReplies = useQuery(quickRepliesQuery(client));
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
  // What the owner types into a waiting dialog, apart from the message they are writing.
  const [answer, setAnswer] = useState('');
  // The message the last successful prompt answered, so its suggestions are not sent again, and
  // the latest message, which the next prompt answers.
  const [answered, setAnswered] = useState<string>();
  const latestId = useRef<string>(undefined);
  const images = useAttachments(client);
  // A successful send from a field clears it, and the images; a failed one keeps both. A quick
  // reply leaves the fields alone. The clearing is on the mutation, not on `mutate`, so a reset
  // of the mutation by a later send cannot drop it.
  const prompt = useMutation({
    mutationFn: ({ text, imageIds }: Send & { imageIds: ReadonlyArray<string> }) =>
      client.prompt(agentRef, text, imageIds),
    onSuccess: (_, { fromField, answers }) => {
      if (answers !== undefined) setAnswered(answers);
      if (!fromField) return;
      setDraft('');
      images.clear();
    },
  });
  const keys = useMutation({ mutationFn: (key: Key) => client.keys(agentRef, [key]) });
  // Typing never presses Enter: the owner submits the dialog with the key.
  const typed = useMutation({
    mutationFn: ({ text }: Send) => client.type(agentRef, text),
    onSuccess: (_, { fromField }) => {
      if (fromField) setAnswer('');
    },
  });
  // Only the latest send can fail visibly: a new one clears the reason of the others.
  const failure = prompt.error ?? keys.error ?? typed.error;
  // The keys wait for a send too, so an Enter can never overtake the text it should submit.
  const sending = prompt.isPending || typed.isPending;
  const sendPrompt = (send: Send, imageIds: ReadonlyArray<string>) => {
    keys.reset();
    typed.reset();
    prompt.mutate({ ...send, answers: send.answers ?? latestId.current, imageIds });
  };
  const typeText = (send: Send) => {
    keys.reset();
    prompt.reset();
    typed.mutate(send);
  };
  const pressKey = (key: Key) => {
    prompt.reset();
    typed.reset();
    keys.mutate(key);
  };
  const sendReply = (text: string) =>
    blocked ? typeText({ text, fromField: false }) : sendPrompt({ text, fromField: false }, []);
  // A refused text means nothing once the dialog is gone.
  const { reset: resetTyped } = typed;
  useEffect(() => {
    if (!blocked) resetTyped();
  }, [blocked, resetTyped]);

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

  // A suggestion answers only the latest message, and only while the agent waits for a prompt;
  // a blocked agent is answered with the keys and the dialog field alone.
  const latest = transcript.data?.entries.at(-1);
  latestId.current = latest?.id;
  const waiting = agent.status === 'idle' || agent.status === 'done';
  const suggested =
    view === 'chat' && waiting && latest?.type === 'assistant' && latest.id !== answered
      ? { id: latest.id, replies: latest.replies ?? [] }
      : undefined;

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
              disabled={keys.isPending || sending}
              onKey={(value) => {
                if (isKey(value)) pressKey(value);
              }}
            />
          ) : null}
          {suggested === undefined ? null : (
            <SuggestedReplies
              replies={suggested.replies}
              disabled={sending}
              onPick={(text) => sendPrompt({ text, fromField: false, answers: suggested.id }, [])}
            />
          )}
          <QuickReplies replies={quickReplies.data ?? []} disabled={sending} onPick={sendReply} />
          {blocked ? (
            <Composer
              label="Type into the dialog"
              value={answer}
              onChange={setAnswer}
              onSend={(text) => typeText({ text, fromField: true })}
              placeholder="Your answer"
              hint="Choose Type something or Other with the keys first, then press Enter to submit."
              sendLabel="Type"
              locked={typed.isPending}
            />
          ) : (
            <Composer
              label="Message"
              value={draft}
              onChange={setDraft}
              onSend={(text) => sendPrompt({ text, fromField: true }, images.ids)}
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

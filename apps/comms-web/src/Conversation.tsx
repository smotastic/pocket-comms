import {
  Activity,
  Alert,
  AppBar,
  Card,
  Composer,
  type ComposerAction,
  Disclosure,
  DockedPage,
  IconButton,
  SegmentedControl,
  Stack,
  TerminalScreen,
  Text,
  appendText,
  useVoiceClip,
  VoiceClipRow,
  withoutSent,
} from '@smotastic/pocket-design';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type { AgentView, CommsClient, Key } from './comms-client.js';
import { RequestError } from './comms-client.js';
import { AttachedImages } from './AttachedImages.js';
import { BackgroundStrip } from './BackgroundStrip.js';
import { useAttachments } from './attachments.js';
import { delegationLink, stripItems } from './background.js';
import { ConversationEntries } from './ConversationEntries.js';
import { CloseAgent } from './CloseAgent.js';
import { ConversationMenu } from './ConversationMenu.js';
import {
  agentQuery,
  quickRepliesQuery,
  screenQuery,
  speechQuery,
  conversationQuery,
} from './comms-queries.js';
import { KeyPad } from './KeyPad.js';
import { QuickReplies, SuggestedReplies } from './QuickReplies.js';
import { kindOf, STATUS_LABELS } from './labels.js';
import { useAgentLive, useNow } from './live.js';
import { StatusBadge } from './StatusBadge.js';
import { voiceLabels, voiceNotice } from './voice.js';

export interface ConversationProps {
  readonly client: CommsClient;
  readonly agentRef: string;
  readonly onBack: () => void;
  /** What the New task flow could not do for this agent, such as send the task (spec 005). */
  readonly note?: string | undefined;
  /**
   * Called once, in place of saying so, when the agent turns out to be gone before it was ever
   * shown; one that ends while it is open still says that it is not running any more.
   */
  readonly onGone?: (() => void) | undefined;
}

type View = 'conversation' | 'screen';

const VIEWS: ReadonlyArray<{ readonly id: View; readonly label: string }> = [
  { id: 'conversation', label: 'Conversation' },
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
  { value: 'pageup', label: 'Page up' },
  { value: 'pagedown', label: 'Page down' },
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
 * the composer and the suggested replies, or a field that types into the waiting dialog while the
 * agent is blocked. The keys wait under Controls, so the question keeps the room, and the owner's
 * quick replies open from the composer's Actions menu. It updates live.
 */
export const Conversation = ({ client, agentRef, onBack, note, onGone }: ConversationProps) => {
  useAgentLive(client, agentRef);
  const now = useNow(60_000);
  const [backgroundOpen, setBackgroundOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [repliesOpen, setRepliesOpen] = useState(false);
  const agentResult = useQuery(agentQuery(client, agentRef));
  const agent = agentResult.data;
  const hasConversation = agent?.format !== undefined;
  const [chosen, setChosen] = useState<View>('conversation');
  const view: View = hasConversation ? chosen : 'screen';
  const conversation = useQuery({
    ...conversationQuery(client, agentRef),
    enabled: hasConversation,
  });
  // A dialog waits while the agent is blocked, or while a Claude agent's latest entry is a question
  // waiting for its answer: Herdr reports such an agent as done.
  const pendingEntry = conversation.data?.entries.at(-1);
  const dialogWaits =
    agent?.status === 'blocked' ||
    (agent?.format === 'claude' &&
      pendingEntry?.type === 'tool' &&
      pendingEntry.outcome === 'pending' &&
      pendingEntry.questions !== undefined);
  const quickReplies = useQuery(quickRepliesQuery(client));
  const screen = useQuery({
    ...screenQuery(client, agentRef),
    enabled: agent !== undefined && (view === 'screen' || dialogWaits),
  });

  // Opening a done agent shows its completion, so it leaves Needs you (requirement 11). A failed
  // attempt is tried again; the overview keeps the agent under Needs you until one succeeds.
  const doneNotSeen = agent?.status === 'done' && agent.needsYou;
  const { mutate: markSeen } = useMutation({ mutationFn: () => client.seen(agentRef), retry: 3 });
  useEffect(() => {
    if (doneNotSeen) markSeen();
  }, [markSeen, doneNotSeen]);

  const [closing, setClosing] = useState(false);
  const [draft, setDraft] = useState('');
  // What the owner types into a waiting dialog, apart from the message they are writing.
  const [dialogText, setDialogText] = useState('');
  // The message the last successful prompt answered, so its suggestions are not sent again, and
  // the latest message, which the next prompt answers.
  const [answered, setAnswered] = useState<string>();
  const latestId = useRef<string>(undefined);
  const images = useAttachments(client);
  const speech = useQuery(speechQuery(client));
  // A clip belongs to the message, also while a dialog's composer shows.
  const voice = useVoiceClip(
    (clip) => client.transcribe(clip),
    (text) => setDraft((current) => appendText(current, text)),
  );
  // A successful send from a field clears it, and the images; a failed one keeps both. A quick
  // reply leaves the fields alone. The clearing is on the mutation, not on `mutate`, so a reset
  // of the mutation by a later send cannot drop it.
  const prompt = useMutation({
    mutationFn: ({ text, imageIds }: Send & { imageIds: ReadonlyArray<string> }) =>
      client.prompt(agentRef, text, imageIds),
    onSuccess: (_, { text, fromField, answers }) => {
      if (answers !== undefined) setAnswered(answers);
      if (!fromField) return;
      // Only the sent text goes: a transcription that arrived meanwhile stays.
      setDraft((current) => withoutSent(current, text));
      images.clear();
      voice.dismiss();
    },
  });
  const keys = useMutation({ mutationFn: (key: Key) => client.keys(agentRef, [key]) });
  // Typing never presses Enter: the owner submits the dialog with the key.
  const typed = useMutation({
    mutationFn: ({ text }: Send) => client.type(agentRef, text),
    onSuccess: (_, { fromField }) => {
      if (fromField) setDialogText('');
    },
  });
  // The options the owner chose for a waiting question, kept by its call so a new question starts
  // empty and a failed send keeps them.
  const [choices, setChoices] = useState<{
    readonly call: string;
    readonly chosen: ReadonlyArray<ReadonlyArray<number>>;
  }>();
  const answer = useMutation({
    mutationFn: ({
      call,
      answers,
    }: {
      call: string;
      answers: ReadonlyArray<ReadonlyArray<number>>;
    }) => client.answer(agentRef, call, answers),
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
    // Paging moves through the agent's own screen, so the owner reads on in the Screen view, which
    // shows that screen alone with the keys, and pages back down there.
    if (key === 'pageup') setChosen('screen');
  };
  const sendReply = (text: string) =>
    dialogWaits ? typeText({ text, fromField: false }) : sendPrompt({ text, fromField: false }, []);
  // A refused text means nothing once the dialog is gone.
  const { reset: resetTyped } = typed;
  useEffect(() => {
    if (!dialogWaits) resetTyped();
  }, [dialogWaits, resetTyped]);

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
  const latest = conversation.data?.entries.at(-1);
  latestId.current = latest?.id;
  const waiting = agent.status === 'idle' || agent.status === 'done';
  const suggested =
    view === 'conversation' && waiting && latest?.type === 'assistant' && latest.id !== answered
      ? { id: latest.id, replies: latest.replies ?? [] }
      : undefined;

  // A Claude agent's waiting question whose options are known is answered in its card, also while
  // a sent answer waits for the session to record it.
  const asking =
    agent.format === 'claude' &&
    latest?.type === 'tool' &&
    latest.outcome === 'pending' &&
    latest.questions !== undefined &&
    latest.questions.every((question) => (question.options?.length ?? 0) > 0)
      ? { call: latest.id, questions: latest.questions }
      : undefined;
  const sentCall = answer.isSuccess ? answer.variables.call : undefined;
  const answerable = asking !== undefined && view === 'conversation';
  const picked =
    asking !== undefined && choices?.call === asking.call
      ? choices.chosen
      : (asking?.questions.map(() => []) ?? []);
  const answerError =
    asking === undefined || answer.error === null || answer.variables?.call !== asking.call
      ? undefined
      : answer.error instanceof RequestError && answer.error.problem === 'question-not-waiting'
        ? 'This question was answered or moved on. Check the Screen view.'
        : answer.error.message;
  const answering =
    asking === undefined || !answerable
      ? undefined
      : {
          call: asking.call,
          chosen: picked,
          onChange: (question: number, options: ReadonlyArray<number>) =>
            setChoices({
              call: asking.call,
              chosen: picked.map((current, index) => (index === question ? options : current)),
            }),
          onSend: () => {
            prompt.reset();
            keys.reset();
            typed.reset();
            answer.mutate({ call: asking.call, answers: picked });
          },
          sending: answer.isPending && answer.variables.call === asking.call,
          sent: sentCall === asking.call,
          ...(answerError === undefined ? {} : { error: answerError }),
        };

  const screenText = screen.data ?? '';
  const name = agent.ref;
  const kindLabel = kindOf(agent.kind).label;
  const withKeys = dialogWaits || view === 'screen';
  const owned = quickReplies.data ?? [];
  const repliesAction: ReadonlyArray<ComposerAction> =
    owned.length === 0
      ? []
      : [
          {
            id: 'replies',
            label: 'Quick replies',
            icon: 'chat',
            onAction: () => setRepliesOpen(true),
          },
        ];

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
          {voice.notice === undefined ? null : (
            <Alert tone={voiceNotice(voice.notice).tone}>{voiceNotice(voice.notice).text}</Alert>
          )}
          {/* Above both composers, so Stop stays in reach when a dialog takes the field. */}
          <VoiceClipRow
            clip={voice.clip}
            labels={voiceLabels}
            level={voice.level}
            onStop={() => void voice.stop()}
            onCancel={() => void voice.cancel()}
            onRetry={voice.retry}
            onDiscard={voice.discard}
          />
          {agent.background.length === 0 ? null : (
            <BackgroundStrip
              items={stripItems(agent, now)}
              expanded={backgroundOpen}
              onExpandedChange={setBackgroundOpen}
            />
          )}
          {suggested === undefined ? null : (
            <SuggestedReplies
              replies={suggested.replies}
              disabled={sending}
              onPick={(text) => sendPrompt({ text, fromField: false, answers: suggested.id }, [])}
            />
          )}
          {/* Closed at first so the question keeps the room; open while the owner presses keys. */}
          {withKeys ? (
            <Disclosure
              title="Controls"
              detail="Keys"
              expanded={controlsOpen}
              onExpandedChange={setControlsOpen}
            >
              <KeyPad
                label="Keys"
                keys={KEYS}
                holdKey={CTRL_C}
                disabled={keys.isPending || sending}
                onKey={(value) => {
                  if (isKey(value)) pressKey(value);
                }}
              />
            </Disclosure>
          ) : null}
          {dialogWaits ? (
            <Composer
              label="Type into the dialog"
              value={dialogText}
              onChange={setDialogText}
              onSend={(text) => typeText({ text, fromField: true })}
              placeholder="Your answer"
              hint="Choose Type something or Other with the keys first, then press Enter to submit."
              sendLabel="Type"
              locked={typed.isPending}
              {...(repliesAction.length === 0
                ? {}
                : { actions: { label: 'Actions', items: repliesAction } })}
            />
          ) : (
            <Composer
              label="Message"
              value={draft}
              onChange={setDraft}
              onSend={(text) => sendPrompt({ text, fromField: true }, images.ids)}
              placeholder={`Message ${name}`}
              locked={prompt.isPending || images.pending}
              actions={{
                label: 'Actions',
                items: [
                  {
                    id: 'image',
                    label: 'Upload image',
                    icon: 'image',
                    isDisabled: images.full,
                    files: {
                      acceptedFileTypes: ['image/*'],
                      onSelect: (files) => void images.add(files),
                    },
                  },
                  ...(speech.data === true
                    ? [
                        {
                          id: 'voice',
                          label: 'Record voice',
                          icon: 'mic' as const,
                          onAction: () => void voice.start(),
                          isDisabled: voice.clip._tag !== 'Idle',
                        },
                      ]
                    : []),
                  ...repliesAction,
                ],
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
            <ConversationEntries
              conversation={conversation.data}
              failed={conversation.error !== null}
              imageUrl={client.imageUrl}
              linkOf={delegationLink(agent)}
              {...(answering === undefined ? {} : { answering })}
            />
            {agent.status === 'working' ? (
              <Activity label={conversation.data?.currentStep ?? 'Thinking…'} />
            ) : null}
            {/* Once answers are sent, a dialog still up shows again, so the owner sees what is left. */}
            {dialogWaits && (answering === undefined || answering.sent) ? (
              <Card title={`${kindLabel} needs your answer`}>
                {/* Wrapped, so the whole question reads on a phone; the Screen view keeps the lines. */}
                <TerminalScreen label={`Screen of ${name}`} text={screenText} wrap />
              </Card>
            ) : null}
          </>
        )}
      </Stack>
      <QuickReplies
        open={repliesOpen}
        onClose={() => setRepliesOpen(false)}
        replies={owned}
        disabled={sending}
        onPick={sendReply}
      />
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
